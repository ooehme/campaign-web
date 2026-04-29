import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import L from 'leaflet'
import { GeoJSON, MapContainer, TileLayer } from 'react-leaflet'
import { useMap } from 'react-leaflet/hooks'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { deleteArea, getArea, updateArea } from '../api/endpoints'
import { ErrorState, LoadingState } from '../components/UiState'
import type { Area, GeoJsonShape } from '../types/models'
import { MAP_ATTRIBUTION, MAP_TILE_URL } from '../utils/constants'
import { can, NO_PERMISSION_MESSAGE } from '../utils/permissions'

const DEFAULT_CENTER: [number, number] = [51.1657, 10.4515]
const FIT_BOUNDS_PADDING: [number, number] = [32, 32]
const FIT_BOUNDS_MAX_ZOOM = 18

const parseAndValidate = (value: string): { parsed?: GeoJsonShape; error?: string } => {
  try {
    const parsed = JSON.parse(value) as GeoJsonShape
    if (!parsed || (parsed.type !== 'Polygon' && parsed.type !== 'MultiPolygon')) return { error: 'GeoJSON muss Polygon oder MultiPolygon sein.' }
    if (!Array.isArray(parsed.coordinates) || parsed.coordinates.length === 0) return { error: 'GeoJSON-Koordinaten fehlen.' }
    return { parsed }
  } catch {
    return { error: 'GeoJSON ist kein valides JSON.' }
  }
}

type FitBoundsToGeoJsonProps = {
  geojson?: GeoJsonShape
  autoFitEnabled: boolean
  onAutoFitDone: () => void
  fitTrigger: number
}

function FitBoundsToGeoJson({ geojson, autoFitEnabled, onAutoFitDone, fitTrigger }: FitBoundsToGeoJsonProps) {
  const map = useMap()
  const bounds = useMemo(() => {
    if (!geojson) return null
    try {
      const computedBounds = L.geoJSON(geojson as GeoJSON.GeoJsonObject).getBounds()
      return computedBounds.isValid() ? computedBounds : null
    } catch {
      return null
    }
  }, [geojson])

  useEffect(() => {
    if (!bounds) return
    if (!autoFitEnabled) return
    map.fitBounds(bounds, { padding: FIT_BOUNDS_PADDING, maxZoom: FIT_BOUNDS_MAX_ZOOM })
    onAutoFitDone()
  }, [autoFitEnabled, bounds, map, onAutoFitDone])

  useEffect(() => {
    if (!bounds) return
    if (fitTrigger < 1) return
    map.fitBounds(bounds, { padding: FIT_BOUNDS_PADDING, maxZoom: FIT_BOUNDS_MAX_ZOOM })
  }, [bounds, fitTrigger, map])

  return null
}

export function AreaEditPage() {
  const { areaId } = useParams()
  const id = Number(areaId)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const areaQuery = useQuery({ queryKey: ['area', id], queryFn: () => getArea(id), enabled: Number.isFinite(id) })
  const [name, setName] = useState('')
  const [geojsonText, setGeojsonText] = useState('{"type":"Polygon","coordinates":[]}')
  const [validation, setValidation] = useState<Record<string, string>>({})
  const [hasAutoFitted, setHasAutoFitted] = useState(false)
  const [fitTrigger, setFitTrigger] = useState(0)

  useEffect(() => {
    if (!areaQuery.data) return
    setName(areaQuery.data.name ?? '')
    setGeojsonText(JSON.stringify(areaQuery.data.geojson ?? { type: 'Polygon', coordinates: [] }, null, 2))
    setHasAutoFitted(false)
    setFitTrigger(0)
  }, [areaQuery.data?.id])

  const edit = useMutation({
    mutationFn: (payload: { name: string; geojson: GeoJsonShape }) => updateArea(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['area', id] })
      qc.invalidateQueries({ queryKey: ['areas-pool'] })
      qc.invalidateQueries({ queryKey: ['campaign-areas'] })
      navigate(`/areas/${id}`)
    },
    onError: (error) => {
      const apiError = error as ApiError
      if (apiError.status === 422) {
        const errors = (apiError.details as { errors?: Record<string, string[]> } | undefined)?.errors ?? {}
        setValidation({ name: errors.name?.[0] ?? '', geojson: errors.geojson?.[0] ?? '' })
      }
    },
  })

  const remove = useMutation({ mutationFn: () => deleteArea(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['areas-pool'] }); qc.invalidateQueries({ queryKey: ['campaign-areas'] }); navigate('/areas') } })

  if (areaQuery.isLoading) return <LoadingState />
  if (areaQuery.isError || !areaQuery.data) {
    const error = areaQuery.error as ApiError
    if (error?.status === 401) return <Navigate to="/login" replace />
    if (error?.status === 404) return <ErrorState message="Fläche nicht gefunden." />
    if (error?.status === 403) return <ErrorState message="Keine Berechtigung für diese Aktion." />
    return <ErrorState message="Serverfehler beim Laden oder Speichern der Fläche." />
  }

  const area = areaQuery.data as Area
  const canUpdate = can(area.can?.update)
  const canDelete = can(area.can?.delete)
  const parsedResult = useMemo(() => parseAndValidate(geojsonText), [geojsonText])

  return <section className="space-y-4"><Link to={`/areas/${id}`} className="text-sm text-blue-600">← Zurück zur Flächendetailseite</Link><h1 className="text-2xl font-semibold">Fläche bearbeiten</h1>
    <div className="rounded border bg-white p-4 space-y-2"><h2 className="font-medium">Basisdaten</h2><label className="text-sm">Name</label><input value={name} onChange={(e) => setName(e.target.value)} disabled={!canUpdate} />
      {!canUpdate && <p className="text-sm text-amber-700">Keine Berechtigung für diese Aktion.</p>}
      <div className="flex gap-2"><button className="border px-3 py-2 disabled:opacity-50" disabled={!canUpdate || edit.isPending} title={!canUpdate ? NO_PERMISSION_MESSAGE : undefined} onClick={() => { const errors: Record<string, string> = {}; if (!name.trim()) errors.name = 'Name ist erforderlich.'; if (parsedResult.error) errors.geojson = parsedResult.error; setValidation(errors); if (Object.keys(errors).length || !parsedResult.parsed) return; edit.mutate({ name: name.trim(), geojson: parsedResult.parsed }) }}>Speichern</button><Link className="border px-3 py-2" to={`/areas/${id}`}>Abbrechen</Link></div>
      {validation.name && <p className="text-sm text-red-700">{validation.name}</p>}
    </div>

    <div className="rounded border bg-white p-4 space-y-2"><h2 className="font-medium">Geometrie</h2><p className="text-sm text-slate-600">Kartenvorschau der aktuellen Geometrie. Für Änderungen bitte GeoJSON manuell bearbeiten.</p>
      {parsedResult.parsed ? <>
        <div className="h-72 overflow-hidden rounded border"><MapContainer center={DEFAULT_CENTER} zoom={6} className="h-full w-full"><TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} /><GeoJSON data={parsedResult.parsed as GeoJSON.GeoJsonObject} /><FitBoundsToGeoJson geojson={parsedResult.parsed} autoFitEnabled={!hasAutoFitted} onAutoFitDone={() => setHasAutoFitted(true)} fitTrigger={fitTrigger} /></MapContainer></div>
        <button type="button" className="border px-3 py-2" onClick={() => setFitTrigger((value) => value + 1)}>Auf Fläche zentrieren</button>
      </> : <p className="text-sm text-slate-700">Keine gültige Geometrie vorhanden.</p>}
      <label className="block text-sm font-medium">GeoJSON manuell bearbeiten</label><textarea rows={12} value={geojsonText} onChange={(e) => setGeojsonText(e.target.value)} disabled={!canUpdate} />
      {validation.geojson && <p className="text-sm text-red-700">{validation.geojson}</p>}
    </div>

    <div className="rounded border border-red-200 bg-red-50 p-4 space-y-2"><h2 className="font-medium">Danger Zone</h2><button className="bg-red-600 text-white px-3 py-2 disabled:opacity-50" disabled={!canDelete} title={!canDelete ? NO_PERMISSION_MESSAGE : undefined} onClick={() => window.confirm('Fläche wirklich löschen?') && remove.mutate()}>Fläche löschen</button></div>
  </section>
}
