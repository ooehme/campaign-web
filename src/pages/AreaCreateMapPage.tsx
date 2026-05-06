import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import L from 'leaflet'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { MapContainer, Marker, Polygon, TileLayer, useMapEvents } from 'react-leaflet'
import { createArea, createOrAttachAreaToCampaign, listCampaignAreas } from '../api/endpoints'
import { ApiError } from '../api/client'
import { ErrorState } from '../components/UiState'
import type { GeoJsonInput, GeoJsonPolygon } from '../types/models'
import { MAP_ATTRIBUTION, MAP_TILE_URL } from '../utils/constants'
import { getSuggestedAreaName, normalizeGeoJsonInput } from '../utils/geojson'

const DEFAULT_CENTER: [number, number] = [51.1657, 10.4515]

type LatLngTuple = [number, number]

function MapClickHandler({ onPointAdd, disabled }: { onPointAdd: (point: LatLngTuple) => void; disabled: boolean }) {
  useMapEvents({
    click(event) {
      if (disabled) return
      onPointAdd([event.latlng.lat, event.latlng.lng])
    },
  })
  return null
}

const markerIcon = L.divIcon({ className: 'rounded-full border border-slate-700 bg-white text-xs', html: '⬤', iconSize: [18, 18], iconAnchor: [9, 9] })

const closeRing = (points: LatLngTuple[]) => {
  if (points.length < 3) return [] as [number, number][]
  const ring = points.map(([lat, lng]) => [lng, lat] as [number, number])
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first)
  return ring
}


const hasSelfIntersection = (points: LatLngTuple[]) => {
  if (points.length < 4) return false
  const ring = [...points, points[0]]
  const intersects = (a1: LatLngTuple, a2: LatLngTuple, b1: LatLngTuple, b2: LatLngTuple) => {
    const orient = (p: LatLngTuple, q: LatLngTuple, r: LatLngTuple) => (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1])
    const o1 = orient(a1, a2, b1)
    const o2 = orient(a1, a2, b2)
    const o3 = orient(b1, b2, a1)
    const o4 = orient(b1, b2, a2)
    return o1 * o2 < 0 && o3 * o4 < 0
  }

  for (let i = 0; i < ring.length - 1; i += 1) {
    for (let j = i + 1; j < ring.length - 1; j += 1) {
      if (Math.abs(i - j) <= 1) continue
      if (i === 0 && j === ring.length - 2) continue
      if (intersects(ring[i], ring[i + 1], ring[j], ring[j + 1])) return true
    }
  }
  return false
}

const toGeoJson = (points: LatLngTuple[]): GeoJsonPolygon | null => {
  const ring = closeRing(points)
  if (ring.length < 4) return null
  return { type: 'Polygon', coordinates: [ring] }
}

export function AreaCreateMapPage() {
  const { campaignId } = useParams()
  const campaignNumericId = campaignId ? Number(campaignId) : null
  const isCampaignMode = Number.isFinite(campaignNumericId)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [name, setName] = useState('')
  const [points, setPoints] = useState<LatLngTuple[]>([])
  const [manualGeoJson, setManualGeoJson] = useState('{"type":"Polygon","coordinates":[]}')
  const [useManual, setUseManual] = useState(false)
  const [success, setSuccess] = useState('')
  const [usage, setUsage] = useState<'boundary' | 'target'>('boundary')
  const [boundaryAreaId, setBoundaryAreaId] = useState('')
  const [notes, setNotes] = useState('')
  const campaignAreasQuery = useQuery({ queryKey: ['campaign-areas', campaignNumericId], queryFn: () => listCampaignAreas(campaignNumericId as number, { per_page: 100 }), enabled: Boolean(isCampaignMode && campaignNumericId) })
  const boundaryAreas = (campaignAreasQuery.data?.data ?? []).filter((a) => a.pivot?.usage === 'boundary')

  const geometry = useMemo(() => (useManual ? null : toGeoJson(points)), [points, useManual])
  const parsedManual = useMemo(() => (useManual ? normalizeGeoJsonInput(manualGeoJson) : undefined), [useManual, manualGeoJson])
  const canSave = name.trim().length > 0 && (!!geometry || (useManual && !!parsedManual?.parsed))

  const formatError = (error: unknown) => {
    if (!(error instanceof ApiError)) return 'Speichern fehlgeschlagen.'
    if (error.status === 403) return 'Keine Berechtigung für diese Aktion.'
    if (error.status >= 500) return 'Serverfehler. Bitte später erneut versuchen.'
    return 'Speichern fehlgeschlagen. Bitte Eingaben prüfen.'
  }

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['areas-pool'] })
    qc.invalidateQueries({ queryKey: ['campaign-areas'] })
    qc.invalidateQueries({ queryKey: ['campaign'] })
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payloadGeometry = useManual ? parsedManual?.parsed : geometry
      if (!payloadGeometry) throw new Error('invalid-geometry')
      if (isCampaignMode && campaignNumericId) {
        return createOrAttachAreaToCampaign(campaignNumericId, { name: name.trim(), geojson: payloadGeometry as GeoJsonInput, usage, boundary_area_id: boundaryAreaId ? Number(boundaryAreaId) : null, notes: notes || null })
      }
      return createArea({ name: name.trim(), geojson: payloadGeometry as GeoJsonInput })
    },
    onSuccess: () => {
      invalidate()
      setSuccess('Fläche erfolgreich erstellt.')
      if (isCampaignMode && campaignNumericId) {
        navigate(`/campaigns/${campaignNumericId}`)
        return
      }
      navigate('/areas')
    },
  })

  const validationMessage = useMemo(() => {
    if (!name.trim()) return 'Name ist erforderlich.'
    if (!useManual && !geometry) return 'Bitte eine Fläche auf der Karte zeichnen.'
    if (!useManual && hasSelfIntersection(points)) return 'Die gezeichnete Fläche ist ungültig.'
    if (useManual && parsedManual?.error) return parsedManual.error
    return ''
  }, [name, geometry, useManual, manualGeoJson, points])

  return <section className="space-y-4">
    <h1 className="text-2xl font-semibold">Fläche auf Karte erstellen</h1>
    <p className="text-sm text-slate-600">Zeichnen Sie die Fläche als Polygon auf der Karte.</p>
    {isCampaignMode && <p className="rounded border border-blue-200 bg-blue-50 p-2 text-sm text-blue-700">Die neue Fläche wird direkt der Kampagne zugewiesen.</p>}
    {!isCampaignMode && <p className="rounded border border-slate-200 bg-slate-50 p-2 text-sm">Hinweis: Kampagnenzuweisung kann nach dem Speichern erfolgen.</p>}
    {success && <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">{success}</p>}

    <div className="rounded border bg-white p-4 space-y-3">
      <label className="block text-sm font-medium" htmlFor="area-name">Name</label>
      <input id="area-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Einsatzgebiet Nord" />

      {isCampaignMode && <div className='grid gap-2 md:grid-cols-2'><select value={usage} onChange={(e) => setUsage(e.target.value as 'boundary' | 'target')}><option value='boundary'>Begrenzung</option><option value='target'>Zielgebiet</option></select>{usage === 'target' && <select value={boundaryAreaId} onChange={(e) => setBoundaryAreaId(e.target.value)}><option value=''>Begrenzung auswählen (optional)</option>{boundaryAreas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}<input value={notes} placeholder='Notizen (optional)' onChange={(e) => setNotes(e.target.value)} /></div>}
      <div className="h-96 overflow-hidden rounded border">
        <MapContainer center={DEFAULT_CENTER} zoom={6} className="h-full w-full">
          <TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} />
          <MapClickHandler disabled={useManual} onPointAdd={(point) => setPoints((prev) => [...prev, point])} />
          {points.map((p, idx) => <Marker key={`${p[0]}-${p[1]}-${idx}`} position={p} icon={markerIcon} draggable eventHandlers={{ dragend: (e) => { const next = [...points]; const ll = (e.target as L.Marker).getLatLng(); next[idx] = [ll.lat, ll.lng]; setPoints(next) } }} />)}
          {points.length >= 3 && <Polygon positions={points} pathOptions={{ color: '#0f172a' }} />}
        </MapContainer>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="border" onClick={() => setPoints([])} disabled={points.length === 0 || useManual} title={useManual ? 'Manueller Modus aktiv.' : undefined}>Fläche löschen/zurücksetzen</button>
        <button type="button" className="border" onClick={() => setPoints((prev) => prev.slice(0, -1))} disabled={points.length === 0 || useManual}>Letzten Punkt entfernen</button>
      </div>

      <details>
        <summary className="cursor-pointer text-sm font-medium">Für Experten: GeoJSON manuell bearbeiten</summary>
        <div className="mt-2 space-y-2">
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={useManual} onChange={(e) => setUseManual(e.target.checked)} />Manuellen GeoJSON-Modus verwenden</label>
          <textarea rows={8} value={manualGeoJson} onChange={(e) => { const next = e.target.value; setManualGeoJson(next); const normalized = normalizeGeoJsonInput(next); if (normalized.parsed && !name.trim()) { const suggestion = getSuggestedAreaName(normalized.parsed); if (suggestion) setName(suggestion) } }} />
        </div>
      </details>

      <div>
        <p className="text-sm font-medium">GeoJSON Vorschau</p>
        <pre className="max-h-64 overflow-auto rounded border bg-slate-50 p-3 text-xs">{JSON.stringify(useManual ? (parsedManual?.preview ?? { error: parsedManual?.error ?? 'Ungültiges JSON' }) : (geometry ?? { hint: 'Polygon mit mindestens 3 Punkten zeichnen.' }), null, 2)}</pre>
      </div>

      {validationMessage && <ErrorState message={validationMessage} />}
      {saveMutation.isError && saveMutation.error instanceof ApiError && saveMutation.error.status === 403 ? (
        <ErrorState
          title="Fläche speichern nicht erlaubt"
          message="Ihr Konto darf diese Fläche nicht erstellen oder der Kampagne zuweisen."
          description="Kehren Sie zur vorherigen Übersicht zurück und wählen Sie einen verfügbaren Arbeitsbereich."
          actionLabel={isCampaignMode ? 'Zurück zur Kampagne' : 'Zurück zum Flächen-Pool'}
          actionTo={isCampaignMode && campaignNumericId ? `/campaigns/${campaignNumericId}` : '/areas'}
        />
      ) : saveMutation.isError && <ErrorState message={formatError(saveMutation.error)} />}

      <div className="flex gap-2">
        <button type="button" className="bg-slate-900 text-white disabled:opacity-50" disabled={!canSave || !!validationMessage || saveMutation.isPending} title={!canSave ? validationMessage : undefined} onClick={() => saveMutation.mutate()}>Speichern</button>
        <Link className="border rounded px-3 py-2 text-sm" to={isCampaignMode && campaignNumericId ? `/campaigns/${campaignNumericId}` : '/areas'}>Abbrechen</Link>
      </div>
    </div>
  </section>
}
