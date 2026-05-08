import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import L from 'leaflet'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { GeoJSON, MapContainer, Marker, Polygon, TileLayer, useMapEvents } from 'react-leaflet'
import { createArea, createOrAttachAreaToCampaign, listCampaignAreas } from '../api/endpoints'
import { ApiError } from '../api/client'
import { getGeoJsonMaskGeometry, getGeoJsonPositions, MAP_PANES, MapLayerPanes, MapMask, MapViewportController } from '../components/MapViewport'
import { ErrorState } from '../components/UiState'
import type { GeoJsonFeatureCollection, GeoJsonInput, GeoJsonPolygon } from '../types/models'
import { MAP_ATTRIBUTION, MAP_TILE_URL } from '../utils/constants'
import { getSuggestedAreaName, normalizeGeoJsonInput, parseGeoJsonImport } from '../utils/geojson'

const DEFAULT_CENTER: [number, number] = [51.1657, 10.4515]
const PLACEHOLDER = '{"type":"Polygon","coordinates":[[[13.40,52.52],[13.41,52.52],[13.41,52.53],[13.40,52.53],[13.40,52.52]]]}'

type LatLngTuple = [number, number]
type CreationMode = 'map' | 'import' | 'manual'

function MapClickHandler({ onPointAdd, disabled }: { onPointAdd: (point: LatLngTuple) => void; disabled: boolean }) {
  useMapEvents({
    click(event) {
      if (disabled) return
      onPointAdd([event.latlng.lat, event.latlng.lng])
    },
  })
  return null
}

const markerIcon = L.divIcon({ className: 'rounded-full border border-slate-700 bg-white text-xs', html: 'o', iconSize: [18, 18], iconAnchor: [9, 9] })

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

  const [mode, setMode] = useState<CreationMode>('map')
  const [name, setName] = useState('')
  const [points, setPoints] = useState<LatLngTuple[]>([])
  const [manualGeoJson, setManualGeoJson] = useState(PLACEHOLDER)
  const [importText, setImportText] = useState('')
  const [importNames, setImportNames] = useState<Record<string, string>>({})
  const [success, setSuccess] = useState('')
  const [saveProgress, setSaveProgress] = useState('')
  const [saveErrors, setSaveErrors] = useState<string[]>([])
  const [usage, setUsage] = useState<'boundary' | 'target'>('boundary')
  const [boundaryAreaId, setBoundaryAreaId] = useState('')
  const [notes, setNotes] = useState('')

  const campaignAreasQuery = useQuery({ queryKey: ['campaign-areas', campaignNumericId], queryFn: () => listCampaignAreas(campaignNumericId as number, { per_page: 100 }), enabled: Boolean(isCampaignMode && campaignNumericId) })
  const boundaryAreas = (campaignAreasQuery.data?.data ?? []).filter((a) => a.pivot?.usage === 'boundary')

  const geometry = useMemo(() => toGeoJson(points), [points])
  const parsedManual = useMemo(() => normalizeGeoJsonInput(manualGeoJson), [manualGeoJson])
  const parsedImport = useMemo(() => parseGeoJsonImport(importText), [importText])
  const drawnMapMaskGeometry = useMemo(() => getGeoJsonMaskGeometry(geometry), [geometry])
  const importPreviewGeoJson = useMemo<GeoJsonFeatureCollection>(() => ({ type: 'FeatureCollection', features: parsedImport.items.map((item) => item.feature) }), [parsedImport.items])
  const importMapPositions = useMemo(() => getGeoJsonPositions(importPreviewGeoJson), [importPreviewGeoJson])
  const importMapMaskGeometry = useMemo(() => getGeoJsonMaskGeometry(importPreviewGeoJson), [importPreviewGeoJson])
  const allImportsNamed = parsedImport.items.every((item) => Boolean(importNames[item.id]?.trim()))
  const canSaveSingle = name.trim().length > 0 && (mode === 'map' ? !!geometry : mode === 'manual' ? !!parsedManual.parsed : false)

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

  const createPayload = (areaName: string, geojson: GeoJsonInput) => {
    if (isCampaignMode && campaignNumericId) {
      return createOrAttachAreaToCampaign(campaignNumericId, { name: areaName, geojson, usage, boundary_area_id: boundaryAreaId ? Number(boundaryAreaId) : null, notes: notes || null })
    }
    return createArea({ name: areaName, geojson })
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payloadGeometry = mode === 'manual' ? parsedManual.parsed : geometry
      if (!payloadGeometry) throw new Error('invalid-geometry')
      return createPayload(name.trim(), payloadGeometry as GeoJsonInput)
    },
    onSuccess: () => {
      invalidate()
      setSuccess('Fläche erfolgreich erstellt.')
      navigate(isCampaignMode && campaignNumericId ? `/campaigns/${campaignNumericId}` : '/areas')
    },
  })

  const validationMessage = useMemo(() => {
    if (mode === 'import') {
      if (parsedImport.parseError) return parsedImport.parseError
      if (parsedImport.items.length > 0 && !allImportsNamed) return 'Bitte für jede importierte Fläche einen Namen vergeben.'
      return ''
    }
    if (!name.trim()) return 'Name ist erforderlich.'
    if (mode === 'map' && !geometry) return 'Bitte eine Fläche auf der Karte zeichnen.'
    if (mode === 'map' && hasSelfIntersection(points)) return 'Die gezeichnete Fläche ist ungültig.'
    if (mode === 'manual' && parsedManual.error) return parsedManual.error
    return ''
  }, [name, geometry, mode, parsedManual.error, parsedImport.parseError, parsedImport.items.length, allImportsNamed, points])

  const onFileUpload = async (file?: File | null) => {
    if (!file) return
    const text = await file.text()
    setImportText(text)
    setImportNames({})
    setSaveErrors([])
  }

  const saveImport = async () => {
    if (!allImportsNamed || parsedImport.items.length === 0) return
    setSaveErrors([])
    const errors: string[] = []
    for (let i = 0; i < parsedImport.items.length; i += 1) {
      const item = parsedImport.items[i]
      const areaName = importNames[item.id].trim()
      setSaveProgress(`Speichere Fläche ${i + 1}/${parsedImport.items.length} ...`)
      try {
        await createPayload(areaName, item.feature)
      } catch (e) {
        const apiError = e as ApiError
        errors.push(`${areaName}: ${apiError.status === 500 ? 'Serverfehler beim Speichern. Details im Backend-Log prüfen.' : apiError.message}`)
      }
    }
    invalidate()
    setSaveProgress('')
    if (errors.length === 0) {
      setSuccess(`${parsedImport.items.length} Fläche(n) importiert.`)
      navigate(isCampaignMode && campaignNumericId ? `/campaigns/${campaignNumericId}` : '/areas')
    } else {
      setSaveErrors(errors)
    }
  }

  const backTo = isCampaignMode && campaignNumericId ? `/campaigns/${campaignNumericId}` : '/areas'

  return (
    <section className="space-y-4">
      <Link to={backTo} className="text-sm text-blue-600">Zurück</Link>
      <h1 className="text-2xl font-semibold">Neue Fläche anlegen</h1>
      {isCampaignMode && <p className="rounded border border-blue-200 bg-blue-50 p-2 text-sm text-blue-700">Die neue Fläche wird direkt der Kampagne zugewiesen.</p>}
      {!isCampaignMode && <p className="rounded border border-slate-200 bg-slate-50 p-2 text-sm">Die Fläche wird im globalen Flächen-Pool angelegt.</p>}
      {success && <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">{success}</p>}

      <div className="flex flex-wrap gap-2 rounded border bg-white p-2">
        {([
          ['map', 'Auf Karte anlegen'],
          ['import', 'GeoJSON importieren'],
          ['manual', 'GeoJSON manuell bearbeiten'],
        ] as Array<[CreationMode, string]>).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            className={`border ${mode === value ? 'bg-slate-900 text-white' : 'bg-white'}`}
            onClick={() => { setMode(value); setSaveErrors([]); setSaveProgress('') }}
          >
            {label}
          </button>
        ))}
      </div>

      {isCampaignMode && (
        <div className="grid gap-2 rounded border bg-white p-4 md:grid-cols-3">
          <select value={usage} onChange={(e) => setUsage(e.target.value as 'boundary' | 'target')}>
            <option value="boundary">Begrenzung</option>
            <option value="target">Zielgebiet</option>
          </select>
          <select value={boundaryAreaId} onChange={(e) => setBoundaryAreaId(e.target.value)} disabled={usage !== 'target'}>
            <option value="">Begrenzung auswählen (optional)</option>
            {boundaryAreas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input value={notes} placeholder="Notizen (optional)" onChange={(e) => setNotes(e.target.value)} />
        </div>
      )}

      {mode === 'map' && (
        <div className="space-y-3 rounded border bg-white p-4">
          <label className="block text-sm font-medium" htmlFor="area-name">Name</label>
          <input id="area-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Einsatzgebiet Nord" />
          <div className="aspect-square w-full overflow-hidden rounded border">
            <MapContainer center={DEFAULT_CENTER} zoom={6} maxBoundsViscosity={0.85} className="h-full w-full">
              <TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} />
              <MapLayerPanes />
              <MapMask geometry={drawnMapMaskGeometry} />
              <MapClickHandler disabled={false} onPointAdd={(point) => setPoints((prev) => [...prev, point])} />
              {points.map((p, idx) => <Marker key={`${p[0]}-${p[1]}-${idx}`} pane={MAP_PANES.markers} position={p} icon={markerIcon} draggable eventHandlers={{ dragend: (e) => { const next = [...points]; const ll = (e.target as L.Marker).getLatLng(); next[idx] = [ll.lat, ll.lng]; setPoints(next) } }} />)}
              {points.length >= 3 && <Polygon pane={MAP_PANES.areas} positions={points} pathOptions={{ color: '#0f172a' }} />}
            </MapContainer>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="border" onClick={() => setPoints([])} disabled={points.length === 0}>Fläche löschen/zurücksetzen</button>
            <button type="button" className="border" onClick={() => setPoints((prev) => prev.slice(0, -1))} disabled={points.length === 0}>Letzten Punkt entfernen</button>
          </div>
        </div>
      )}

      {mode === 'import' && (
        <div className="space-y-3 rounded border bg-white p-4">
          <input type="file" accept=".geojson,.json,application/json" onChange={(event) => { void onFileUpload(event.target.files?.[0]) }} />
          <textarea rows={8} placeholder="GeoJSON hier einfügen" value={importText} onChange={(e) => setImportText(e.target.value)} />
          {parsedImport.parseError && <ErrorState message={parsedImport.parseError} />}
          <p className="text-sm text-slate-600">Importierbar: {parsedImport.items.length} · Übersprungen: {parsedImport.skipped}</p>

          {parsedImport.items.length > 0 && (
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="aspect-square w-full overflow-hidden rounded border">
                <MapContainer center={DEFAULT_CENTER} zoom={6} maxBoundsViscosity={0.85} className="h-full w-full">
                  <TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} />
                  <MapLayerPanes />
                  <MapMask geometry={importMapMaskGeometry} />
                  <GeoJSON pane={MAP_PANES.areas} data={importPreviewGeoJson as GeoJSON.GeoJsonObject} style={{ color: '#0f172a', fillOpacity: 0.1 }} />
                  {importMapPositions.length > 0 && <MapViewportController fitPositions={importMapPositions} constrainPositions={importMapPositions} />}
                </MapContainer>
              </div>
              <div className="max-h-72 space-y-2 overflow-auto">
                {parsedImport.items.map((item, index) => (
                  <div key={item.id} className="rounded border p-2">
                    <input
                      className="w-full"
                      placeholder={parsedImport.items.length === 1 ? 'Name der Fläche' : `Name für Fläche ${index + 1}`}
                      value={importNames[item.id] ?? ''}
                      onChange={(e) => setImportNames((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    />
                    <details>
                      <summary className="cursor-pointer text-xs">Eigenschaften anzeigen</summary>
                      <pre className="mt-1 overflow-auto rounded bg-slate-50 p-2 text-xs">{JSON.stringify(item.properties ?? {}, null, 2)}</pre>
                    </details>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'manual' && (
        <div className="space-y-3 rounded border bg-white p-4">
          <label className="block text-sm font-medium" htmlFor="manual-area-name">Name</label>
          <input id="manual-area-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Einsatzgebiet Nord" />
          <textarea rows={12} placeholder={PLACEHOLDER} value={manualGeoJson} onChange={(e) => { const next = e.target.value; setManualGeoJson(next); const normalized = normalizeGeoJsonInput(next); if (normalized.parsed && !name.trim()) { const suggestion = getSuggestedAreaName(normalized.parsed); if (suggestion) setName(suggestion) } }} />
          <div>
            <p className="text-sm font-medium">GeoJSON Vorschau</p>
            <pre className="max-h-64 overflow-auto rounded border bg-slate-50 p-3 text-xs">{JSON.stringify(parsedManual.preview ?? { error: parsedManual.error ?? 'Ungültiges JSON' }, null, 2)}</pre>
          </div>
        </div>
      )}

      {validationMessage && <ErrorState message={validationMessage} />}
      {saveMutation.isError && <ErrorState message={formatError(saveMutation.error)} />}
      {saveErrors.length > 0 && <ErrorState message={`Teilweise fehlgeschlagen: ${saveErrors.join(' | ')}`} />}
      {saveProgress && <p className="text-sm text-slate-700">{saveProgress}</p>}

      <div className="flex gap-2">
        {mode === 'import' ? (
          <button type="button" className="bg-slate-900 text-white disabled:opacity-50" disabled={!!validationMessage || parsedImport.items.length === 0 || !allImportsNamed} onClick={() => void saveImport()}>Import speichern</button>
        ) : (
          <button type="button" className="bg-slate-900 text-white disabled:opacity-50" disabled={!canSaveSingle || !!validationMessage || saveMutation.isPending} title={!canSaveSingle ? validationMessage : undefined} onClick={() => saveMutation.mutate()}>Speichern</button>
        )}
        <Link className="rounded border px-3 py-2 text-sm" to={backTo}>Abbrechen</Link>
      </div>
    </section>
  )
}
