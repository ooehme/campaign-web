import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import L from 'leaflet'
import { CircleMarker, GeoJSON, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { deleteArea, getArea, updateArea } from '../api/endpoints'
import { ErrorState, LoadingState } from '../components/UiState'
import type { Area, GeoJsonGeometry, GeoJsonInput } from '../types/models'
import { MAP_ATTRIBUTION, MAP_TILE_URL } from '../utils/constants'
import { can, NO_PERMISSION_MESSAGE } from '../utils/permissions'
import { getSuggestedAreaName, normalizeGeoJsonInput } from '../utils/geojson'
import { deleteVertex, getEditableMidpoints, getEditableVertices, insertMidpoint, moveVertex } from '../utils/areaEditorGeometry'

const DEFAULT_CENTER: [number, number] = [51.1657, 10.4515]
const FIT_BOUNDS_PADDING: [number, number] = [32, 32]
const FIT_BOUNDS_MAX_ZOOM = 18
const EMPTY_POLYGON_TEXT = '{"type":"Polygon","coordinates":[]}'
type LatLngTuple = [number, number]


function EditMapClicks({ enabled, onAdd }: { enabled: boolean; onAdd: (p: LatLngTuple) => void }) {
  useMapEvents({
    click: (event) => {
      if (enabled) onAdd([event.latlng.lat, event.latlng.lng])
    },
  })
  return null
}

function FitBoundsToGeoJson({ geojson, fitTrigger, autoFitEnabled, onAutoFitDone }: { geojson?: GeoJsonGeometry | GeoJsonInput; fitTrigger: number; autoFitEnabled: boolean; onAutoFitDone: () => void }) {
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
  const [validation, setValidation] = useState<Record<string, string>>({})
  const [success, setSuccess] = useState('')
  const [hasAutoFitted, setHasAutoFitted] = useState(false)
  const [fitTrigger, setFitTrigger] = useState(0)
  const [editActive, setEditActive] = useState(false)
  const [drawMode, setDrawMode] = useState(false)

  const parsedResult = useMemo(() => normalizeGeoJsonInput(geojsonText), [geojsonText])
  const editableGeometry = useMemo<GeoJsonGeometry | null>(() => {
    const preview = parsedResult.preview as GeoJsonInput | undefined
    if (!preview) return null
    if (preview.type === 'Feature') return (preview.geometry as GeoJsonGeometry | null) ?? null
    if (preview.type === 'FeatureCollection') return (preview.features?.[0]?.geometry as GeoJsonGeometry | null) ?? null
    return preview as GeoJsonGeometry
  }, [parsedResult.preview])
  const normalizedGeometryType = editableGeometry?.type
  const hasRenderableAreaGeometry = normalizedGeometryType === 'Polygon' || normalizedGeometryType === 'MultiPolygon'
  const shouldRenderEditHandles = editActive && hasRenderableAreaGeometry
  const areaGeometryFeature = useMemo<GeoJSON.Feature | null>(() => {
    if (!editableGeometry || !hasRenderableAreaGeometry) return null
    return { type: 'Feature', geometry: editableGeometry as GeoJSON.Geometry, properties: {} }
  }, [editableGeometry, hasRenderableAreaGeometry])
  const areaGeometryLayerKey = useMemo(() => `${normalizedGeometryType ?? 'none'}-${geojsonText}`, [geojsonText, normalizedGeometryType])
  const vertices = useMemo(() => (shouldRenderEditHandles && editableGeometry ? getEditableVertices(editableGeometry) : []), [editableGeometry, shouldRenderEditHandles])
  const midpoints = useMemo(() => (shouldRenderEditHandles && editableGeometry ? getEditableMidpoints(editableGeometry) : []), [editableGeometry, shouldRenderEditHandles])
  const editDebug = useMemo(
    () => ({
      parsedGeometryType: parsedResult.parsed?.type === 'Feature'
        ? parsedResult.parsed.geometry?.type
        : parsedResult.parsed?.type === 'FeatureCollection'
          ? parsedResult.parsed.features?.[0]?.geometry?.type
          : parsedResult.parsed?.type,
      normalizedGeometryType,
      verticesLength: vertices.length,
      midpointsLength: midpoints.length,
    }),
    [midpoints.length, normalizedGeometryType, parsedResult.parsed, vertices.length],
  )
  const area = areaQuery.data as Area | undefined
  const canUpdate = can(area?.can?.update)
  const canDelete = can(area?.can?.delete)
  const hasUnsavedChanges = name.trim() !== originalName.trim() || geojsonText !== originalGeometryText

  useEffect(() => {
    if (!areaQuery.data) return
    const sourceGeoJson = areaQuery.data.geojson as unknown
    const loadedGeometry = (sourceGeoJson && typeof sourceGeoJson === 'object' && (sourceGeoJson as { type?: unknown }).type === 'Feature'
      ? sourceGeoJson
      : { type: 'Feature', geometry: sourceGeoJson ?? { type: 'Polygon', coordinates: [] }, properties: {} }) as { type: 'Feature'; geometry?: unknown }
    const loadedGeometryText = JSON.stringify(loadedGeometry, null, 2)
    setName(areaQuery.data.name ?? '')
    setOriginalName(areaQuery.data.name ?? '')
    setGeojsonText(loadedGeometryText)
    setOriginalGeometryText(loadedGeometryText)
    setValidation({})
    setSuccess('')
    setHasAutoFitted(false)
    setFitTrigger(0)
    setEditActive(false)
    setDrawMode(false)
  }, [areaQuery.data])

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
    mutationFn: (payload: { name: string; geojson: GeoJsonInput }) => updateArea(id, payload),
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
      <p className="text-xs text-slate-500">
        Debug: parsed={editDebug.parsedGeometryType ?? 'n/a'} | normalized={editDebug.normalizedGeometryType ?? 'n/a'} | vertices={editDebug.verticesLength} | midpoints={editDebug.midpointsLength}
      </p>
      {parsedResult.preview && <div className="h-72 overflow-hidden rounded border"><MapContainer center={DEFAULT_CENTER} zoom={6} className="h-full w-full">
        <TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} />
        {areaGeometryFeature && <GeoJSON
          key={areaGeometryLayerKey}
          data={areaGeometryFeature}
          style={() => ({
            color: editActive ? '#0f766e' : '#2563eb',
            weight: editActive ? 3 : 2,
            fillColor: editActive ? '#14b8a6' : '#60a5fa',
            fillOpacity: 0.2,
          })}
        />}
        <EditMapClicks enabled={false} onAdd={() => {}} />
        {shouldRenderEditHandles && vertices.map((vertex) => <CircleMarker
            key={`${vertex.geometryType}-${vertex.polygonIndex}-${vertex.ringIndex}-${vertex.vertexIndex}-${vertex.coordinate[0]}-${vertex.coordinate[1]}`}
            center={[vertex.coordinate[1], vertex.coordinate[0]]}
            radius={6}
            pathOptions={{ color: '#1e293b', fillColor: '#ffffff', fillOpacity: 1, weight: 2 }}
            eventHandlers={{
              click: () => {
                if (!canUpdate || !editActive) return
                if (!editableGeometry) return
                const geometry = deleteVertex(editableGeometry, vertex)
                setGeojsonText(JSON.stringify(geometry, null, 2))
              },
              mousedown: (event) => {
                if (!canUpdate || !editActive || !editableGeometry) return
                const marker = event.target
                marker.dragging?.enable()
                marker.once('dragend', () => {
                  const latLng = marker.getLatLng()
                  const geometry = moveVertex(editableGeometry, vertex, [latLng.lng, latLng.lat])
                  setGeojsonText(JSON.stringify(geometry, null, 2))
                  marker.dragging?.disable()
                })
              },
            }}
          />)}
        {shouldRenderEditHandles && midpoints.map((midpoint) => <CircleMarker
              key={`mid-${midpoint.geometryType}-${midpoint.polygonIndex}-${midpoint.ringIndex}-${midpoint.vertexIndex}-${midpoint.coordinate[0]}-${midpoint.coordinate[1]}`}
              center={[midpoint.coordinate[1], midpoint.coordinate[0]]}
              radius={5}
              pathOptions={{ color: '#1d4ed8', fillColor: '#bfdbfe', fillOpacity: 1, weight: 2 }}
              eventHandlers={{
                click: () => {
                  if (!editableGeometry || !canUpdate || !editActive) return
                  const geometry = insertMidpoint(editableGeometry, midpoint)
                  setGeojsonText(JSON.stringify(geometry, null, 2))
                },
                mousedown: (event) => {
                  if (!canUpdate || !editActive || !editableGeometry) return
                  const marker = event.target
                  marker.dragging?.enable()
                  marker.once('dragend', () => {
                    const latLng = marker.getLatLng()
                    const geometry = insertMidpoint(editableGeometry, midpoint, [latLng.lng, latLng.lat])
                    setGeojsonText(JSON.stringify(geometry, null, 2))
                    marker.dragging?.disable()
                  })
                },
              }}
            />)}
        <FitBoundsToGeoJson geojson={parsedResult.preview} fitTrigger={fitTrigger} autoFitEnabled={!hasAutoFitted} onAutoFitDone={() => setHasAutoFitted(true)} />
      </MapContainer></div>}

      <div className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={editActive} title={!canUpdate ? NO_PERMISSION_MESSAGE : undefined} className={`border px-3 py-2 disabled:opacity-50 ${editActive ? "bg-slate-900 text-white" : "bg-white"}`} disabled={!canUpdate} onClick={() => { setEditActive((value) => !value); setDrawMode(false) }}>{editActive ? "Bearbeitung aktiv" : "Polygon bearbeiten"}</button>
        <button type="button" className={`border px-3 py-2 disabled:opacity-50 ${drawMode ? "bg-blue-900 text-white" : "bg-white"}`} title={!canUpdate ? NO_PERMISSION_MESSAGE : undefined} disabled onClick={() => { setDrawMode((value) => !value); setEditActive(false) }}>{drawMode ? "Zeichnen aktiv" : "Polygon zeichnen"}</button>
        <button type="button" className="border px-3 py-2" onClick={() => setFitTrigger((value) => value + 1)}>Auf Fläche zentrieren</button>
        <button type="button" className="border px-3 py-2 disabled:opacity-50" disabled={!canUpdate} onClick={() => { setName(originalName); setGeojsonText(originalGeometryText); setValidation({}) }}>Polygon zurücksetzen</button>
        <button type="button" className="border px-3 py-2 disabled:opacity-50" disabled={!canUpdate} title={!canUpdate ? NO_PERMISSION_MESSAGE : undefined} onClick={() => { if (!window.confirm('Polygon wirklich löschen?')) return; setGeojsonText(EMPTY_POLYGON_TEXT); setDrawMode(true); setEditActive(false) }}>Polygon löschen</button>
      </div>

      <details>
        <summary className="cursor-pointer text-sm font-medium">GeoJSON manuell bearbeiten</summary>
        <textarea rows={12} value={geojsonText} onChange={(event) => { const next = event.target.value; setGeojsonText(next); if (!name.trim()) { const normalized = normalizeGeoJsonInput(next); if (normalized.parsed) { const suggestion = getSuggestedAreaName(normalized.parsed); if (suggestion) setName(suggestion) } } }} disabled={!canUpdate} />
      </details>
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
