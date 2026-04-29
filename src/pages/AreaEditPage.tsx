import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import L from 'leaflet'
import { GeoJSON, MapContainer, Marker, Polygon, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { deleteArea, getArea, updateArea } from '../api/endpoints'
import { ErrorState, LoadingState } from '../components/UiState'
import type { Area, GeoJsonPolygon, GeoJsonShape } from '../types/models'
import { MAP_ATTRIBUTION, MAP_TILE_URL } from '../utils/constants'
import { can, NO_PERMISSION_MESSAGE } from '../utils/permissions'

const DEFAULT_CENTER: [number, number] = [51.1657, 10.4515]
const FIT_BOUNDS_PADDING: [number, number] = [32, 32]
const FIT_BOUNDS_MAX_ZOOM = 18
const EMPTY_POLYGON_TEXT = '{"type":"Polygon","coordinates":[]}'
const markerIcon = L.divIcon({ className: 'rounded-full border border-slate-700 bg-white text-xs', html: '⬤', iconSize: [18, 18], iconAnchor: [9, 9] })
const middleMarkerIcon = L.divIcon({
  className: 'rounded-full border-2 border-blue-700 bg-blue-100 shadow',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

type LatLngTuple = [number, number]

const polygonToPoints = (shape: GeoJsonPolygon): LatLngTuple[] => shape.coordinates[0].slice(0, -1).map(([lng, lat]) => [lat, lng])

const pointsToPolygon = (points: LatLngTuple[]): GeoJsonPolygon | null => {
  if (points.length < 3) return null
  const ring = points.map(([lat, lng]) => [lng, lat] as [number, number])
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first)
  return ring.length >= 4 ? { type: 'Polygon', coordinates: [ring] } : null
}

const getEdgeMidpoint = (first: LatLngTuple, second: LatLngTuple): LatLngTuple => [(first[0] + second[0]) / 2, (first[1] + second[1]) / 2]

const parseGeojsonText = (value: string): { parsed?: GeoJsonShape; error?: string } => {
  try {
    const parsed = JSON.parse(value) as GeoJsonShape
    if (!parsed || (parsed.type !== 'Polygon' && parsed.type !== 'MultiPolygon')) return { error: 'Die Geometrie ist ungültig.' }
    if (!Array.isArray(parsed.coordinates) || parsed.coordinates.length === 0) return { error: 'Die Geometrie ist ungültig.' }
    if (parsed.type === 'Polygon' && (!Array.isArray(parsed.coordinates[0]) || parsed.coordinates[0].length < 4)) return { error: 'Bitte eine gültige Fläche zeichnen.' }
    return { parsed }
  } catch {
    return { error: 'GeoJSON ist kein valides JSON.' }
  }
}

function EditMapClicks({ enabled, onAdd }: { enabled: boolean; onAdd: (p: LatLngTuple) => void }) {
  useMapEvents({
    click: (event) => {
      if (enabled) onAdd([event.latlng.lat, event.latlng.lng])
    },
  })
  return null
}

function FitBoundsToGeoJson({ geojson, fitTrigger, autoFitEnabled, onAutoFitDone }: { geojson?: GeoJsonShape; fitTrigger: number; autoFitEnabled: boolean; onAutoFitDone: () => void }) {
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
    if (!autoFitEnabled || !bounds) return
    map.fitBounds(bounds, { padding: FIT_BOUNDS_PADDING, maxZoom: FIT_BOUNDS_MAX_ZOOM })
    onAutoFitDone()
  }, [autoFitEnabled, bounds, map, onAutoFitDone])

  useEffect(() => {
    if (!bounds || fitTrigger < 1) return
    map.fitBounds(bounds, { padding: FIT_BOUNDS_PADDING, maxZoom: FIT_BOUNDS_MAX_ZOOM })
  }, [bounds, fitTrigger, map])

  return null
}

export function AreaEditPage() {
  const { areaId } = useParams()
  const id = Number(areaId)
  const qc = useQueryClient()
  const navigate = useNavigate()

  const areaQuery = useQuery({
    queryKey: ['area', id],
    queryFn: () => getArea(id),
    enabled: Number.isFinite(id),
  })

  const [name, setName] = useState('')
  const [originalName, setOriginalName] = useState('')
  const [geojsonText, setGeojsonText] = useState(EMPTY_POLYGON_TEXT)
  const [originalGeometryText, setOriginalGeometryText] = useState(EMPTY_POLYGON_TEXT)
  const [points, setPoints] = useState<LatLngTuple[]>([])
  const [validation, setValidation] = useState<Record<string, string>>({})
  const [success, setSuccess] = useState('')
  const [hasAutoFitted, setHasAutoFitted] = useState(false)
  const [fitTrigger, setFitTrigger] = useState(0)
  const [editActive, setEditActive] = useState(false)
  const [drawMode, setDrawMode] = useState(false)
  const [singlePolygonMessage, setSinglePolygonMessage] = useState('')

  const parsedResult = useMemo(() => parseGeojsonText(geojsonText), [geojsonText])
  const area = areaQuery.data as Area | undefined
  const canUpdate = can(area?.can?.update)
  const canDelete = can(area?.can?.delete)
  const isMultiPolygon = parsedResult.parsed?.type === 'MultiPolygon'
  const hasUnsavedChanges = name.trim() !== originalName.trim() || geojsonText !== originalGeometryText

  useEffect(() => {
    if (!areaQuery.data) return
    const loadedGeometry = areaQuery.data.geojson ?? { type: 'Polygon', coordinates: [] }
    const loadedGeometryText = JSON.stringify(loadedGeometry, null, 2)
    setName(areaQuery.data.name ?? '')
    setOriginalName(areaQuery.data.name ?? '')
    setGeojsonText(loadedGeometryText)
    setOriginalGeometryText(loadedGeometryText)
    setPoints(
      loadedGeometry.type === 'Polygon' && Array.isArray(loadedGeometry.coordinates[0]) && loadedGeometry.coordinates[0].length > 0
        ? polygonToPoints(loadedGeometry as GeoJsonPolygon)
        : [],
    )
    setValidation({})
    setSuccess('')
    setHasAutoFitted(false)
    setFitTrigger(0)
    setEditActive(false)
    setDrawMode(false)
  }, [areaQuery.data])

  useEffect(() => {
    if (parsedResult.parsed?.type !== 'Polygon') return
    setPoints(polygonToPoints(parsedResult.parsed))
  }, [parsedResult.parsed])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [hasUnsavedChanges])

  const edit = useMutation({
    mutationFn: (payload: { name: string; geojson: GeoJsonShape }) => updateArea(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['area', id] })
      qc.invalidateQueries({ queryKey: ['areas-pool'] })
      qc.invalidateQueries({ queryKey: ['campaign-areas'] })
      setSuccess('Fläche erfolgreich gespeichert.')
    },
  })

  const remove = useMutation({
    mutationFn: () => deleteArea(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['areas-pool'] })
      qc.invalidateQueries({ queryKey: ['campaign-areas'] })
      navigate('/areas')
    },
  })

  if (areaQuery.isLoading) return <LoadingState />

  if (areaQuery.isError || !area) {
    const error = areaQuery.error as ApiError
    if (error?.status === 401) return <Navigate to="/login" replace />
    if (error?.status === 403) return <ErrorState message="Keine Berechtigung für diese Aktion." />
    if (error?.status === 404) return <ErrorState message="Fläche nicht gefunden." />
    return <ErrorState message="Serverfehler beim Laden oder Speichern der Fläche." />
  }

  const handleSave = () => {
    const errors: Record<string, string> = {}
    if (!name.trim()) errors.name = 'Name ist erforderlich.'
    if (!parsedResult.parsed) errors.geojson = parsedResult.error ?? 'Die Geometrie ist ungültig.'
    if (parsedResult.parsed?.type === 'MultiPolygon') errors.geojson = 'Die Fläche muss ein Polygon sein.'

    setValidation(errors)
    if (Object.keys(errors).length > 0 || !parsedResult.parsed) return

    edit.mutate(
      { name: name.trim(), geojson: parsedResult.parsed },
      {
        onSuccess: () => {
          setOriginalName(name.trim())
          setOriginalGeometryText(JSON.stringify(parsedResult.parsed, null, 2))
        },
        onError: (error) => {
          const apiError = error as ApiError
          if (apiError.status === 401) {
            navigate('/login')
            return
          }
          if (apiError.status === 422) {
            const details = (apiError.details as { errors?: Record<string, string[]> } | undefined)?.errors
            setValidation({
              name: details?.name?.[0] ?? '',
              geojson: details?.geojson?.[0] ?? '',
            })
          }
        },
      },
    )
  }

  return <section className="space-y-4">
    <Link to={`/areas/${id}`} className="text-sm text-blue-600">← Zurück zur Flächendetailseite</Link>
    <h1 className="text-2xl font-semibold">Fläche bearbeiten</h1>

    {hasUnsavedChanges && <p className="rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-700">Ungespeicherte Änderungen</p>}
    {!canUpdate && <p className="rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-700">Keine Berechtigung für diese Aktion.</p>}
    {success && <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">{success}</p>}

    <div className="rounded border bg-white p-4 space-y-2">
      <h2 className="font-medium">Basisdaten</h2>
      <label className="text-sm">Name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} disabled={!canUpdate} />
      {validation.name && <p className="text-sm text-red-700">{validation.name}</p>}
    </div>

    <div className="rounded border bg-white p-4 space-y-2">
      <h2 className="font-medium">Geometrie</h2>
      <p className="text-sm text-slate-600">Aktivieren Sie den Bearbeitungsmodus, um Punkte des Polygons auf der Karte zu verschieben, hinzuzufügen oder zu entfernen.</p>
      <p className="text-xs text-slate-600">Zum Hinzufügen eines Punktes den Zwischenpunkt auf einer Polygonkante ziehen oder anklicken.</p>
      <p className={`text-sm ${editActive ? "font-medium text-emerald-700" : "text-slate-600"}`}>{editActive ? "Bearbeitungsmodus aktiv" : "Bearbeitungsmodus aus"}</p>
      {editActive && <p className="text-xs text-slate-600">Punkte des Polygons können jetzt verschoben, hinzugefügt oder entfernt werden.</p>}
      {isMultiPolygon && <p className="rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-700">MultiPolygon-Bearbeitung ist noch nicht unterstützt.</p>}

      {parsedResult.parsed && <div className="h-72 overflow-hidden rounded border"><MapContainer center={DEFAULT_CENTER} zoom={6} className="h-full w-full">
        <TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} />
        {parsedResult.parsed.type === 'MultiPolygon' ? <GeoJSON data={parsedResult.parsed as GeoJSON.GeoJsonObject} /> : <>
          <EditMapClicks enabled={canUpdate && drawMode} onAdd={(point) => {
            if (points.length >= 3) { setSinglePolygonMessage("Es kann nur ein Polygon pro Fläche bearbeitet werden. Bitte vorhandenes Polygon zuerst löschen."); return }
            const next = [...points, point]
            setPoints(next)
            const polygon = pointsToPolygon(next)
            if (polygon) { setGeojsonText(JSON.stringify(polygon, null, 2)); setSinglePolygonMessage('') }
          }} />
          {points.length >= 3 && <Polygon positions={points} pathOptions={{ color: '#0f172a' }} />}
          {points.map((point, index) => <Marker
            key={`${index}-${point[0]}-${point[1]}`}
            icon={markerIcon}
            position={point}
            draggable={canUpdate && editActive}
            eventHandlers={{
              click: () => {
                if (!canUpdate || !editActive || points.length <= 3) return
                const next = points.filter((_, pointIndex) => pointIndex !== index)
                setPoints(next)
                const polygon = pointsToPolygon(next)
                if (polygon) { setGeojsonText(JSON.stringify(polygon, null, 2)); setSinglePolygonMessage('') }
              },
              dragend: (event) => {
                const latLng = (event.target as L.Marker).getLatLng()
                const next = [...points]
                next[index] = [latLng.lat, latLng.lng]
                setPoints(next)
                const polygon = pointsToPolygon(next)
                if (polygon) { setGeojsonText(JSON.stringify(polygon, null, 2)); setSinglePolygonMessage('') }
              },
            }}
          />)}
          {canUpdate && editActive && points.length >= 3 && points.map((point, index) => {
            const nextIndex = (index + 1) % points.length
            const midpoint = getEdgeMidpoint(point, points[nextIndex])
            return <Marker
              key={`mid-${index}-${midpoint[0]}-${midpoint[1]}`}
              icon={middleMarkerIcon}
              position={midpoint}
              draggable
              zIndexOffset={1000}
              eventHandlers={{
                click: () => {
                  const next = [...points]
                  next.splice(index + 1, 0, midpoint)
                  setPoints(next)
                  const polygon = pointsToPolygon(next)
                  if (polygon) { setGeojsonText(JSON.stringify(polygon, null, 2)); setSinglePolygonMessage('') }
                },
                dragend: (event) => {
                  const latLng = (event.target as L.Marker).getLatLng()
                  const next = [...points]
                  next.splice(index + 1, 0, [latLng.lat, latLng.lng])
                  setPoints(next)
                  const polygon = pointsToPolygon(next)
                  if (polygon) { setGeojsonText(JSON.stringify(polygon, null, 2)); setSinglePolygonMessage('') }
                },
              }}
            />
          })}
        </>}
        <FitBoundsToGeoJson geojson={parsedResult.parsed} fitTrigger={fitTrigger} autoFitEnabled={!hasAutoFitted} onAutoFitDone={() => setHasAutoFitted(true)} />
      </MapContainer></div>}

      <div className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={editActive} title={!canUpdate ? NO_PERMISSION_MESSAGE : undefined} className={`border px-3 py-2 disabled:opacity-50 ${editActive ? "bg-slate-900 text-white" : "bg-white"}`} disabled={!canUpdate || isMultiPolygon} onClick={() => { setEditActive((value) => !value); setDrawMode(false) }}>{editActive ? "Bearbeitung aktiv" : "Polygon bearbeiten"}</button>
        <button type="button" className={`border px-3 py-2 disabled:opacity-50 ${drawMode ? "bg-blue-900 text-white" : "bg-white"}`} title={!canUpdate ? NO_PERMISSION_MESSAGE : undefined} disabled={!canUpdate || isMultiPolygon} onClick={() => { setDrawMode((value) => !value); setEditActive(false) }}>{drawMode ? "Zeichnen aktiv" : "Polygon zeichnen"}</button>
        <button type="button" className="border px-3 py-2" onClick={() => setFitTrigger((value) => value + 1)}>Auf Fläche zentrieren</button>
        <button type="button" className="border px-3 py-2 disabled:opacity-50" disabled={!canUpdate} onClick={() => { setName(originalName); setGeojsonText(originalGeometryText); setValidation({}) }}>Polygon zurücksetzen</button>
        <button type="button" className="border px-3 py-2 disabled:opacity-50" disabled={!canUpdate || isMultiPolygon} title={!canUpdate ? NO_PERMISSION_MESSAGE : undefined} onClick={() => { if (!window.confirm('Polygon wirklich löschen?')) return; setPoints([]); setGeojsonText(EMPTY_POLYGON_TEXT); setDrawMode(true); setEditActive(false) }}>Polygon löschen</button>
      </div>

      <details>
        <summary className="cursor-pointer text-sm font-medium">GeoJSON manuell bearbeiten</summary>
        <textarea rows={12} value={geojsonText} onChange={(event) => setGeojsonText(event.target.value)} disabled={!canUpdate} />
      </details>
      {singlePolygonMessage && <p className="text-sm text-amber-700">{singlePolygonMessage}</p>}
      {validation.geojson && <p className="text-sm text-red-700">{validation.geojson}</p>}
      {edit.isError && (edit.error as ApiError)?.status !== 422 && <ErrorState message="Serverfehler beim Laden oder Speichern der Fläche." />}
    </div>

    <div className="flex gap-2">
      <button className="border px-3 py-2 disabled:opacity-50" disabled={!canUpdate || !hasUnsavedChanges || edit.isPending} onClick={handleSave} title={!canUpdate ? NO_PERMISSION_MESSAGE : undefined}>Speichern</button>
      <Link className="border px-3 py-2" to={`/areas/${id}`}>Abbrechen</Link>
    </div>

    <div className="rounded border border-red-200 bg-red-50 p-4 space-y-2">
      <h2 className="font-medium">Danger Zone</h2>
      <button className="bg-red-600 text-white px-3 py-2 disabled:opacity-50" disabled={!canDelete} title={!canDelete ? NO_PERMISSION_MESSAGE : undefined} onClick={() => window.confirm('Fläche wirklich löschen?') && remove.mutate()}>Fläche löschen</button>
    </div>
  </section>
}
