import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import type { LatLngBoundsExpression } from 'leaflet'
import { ApiError } from '../api/client'
import { deleteArea, getArea } from '../api/endpoints'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import type { Area, AreaAssignmentRef, GeoJsonFeature, GeoJsonFeatureCollection, GeoJsonShape } from '../types/models'
import { MAP_ATTRIBUTION, MAP_TILE_URL } from '../utils/constants'
import { can, NO_PERMISSION_MESSAGE } from '../utils/permissions'

const DEFAULT_CENTER: [number, number] = [51.1657, 10.4515]

const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleString('de-DE') : '—')

const isFiniteCoordinatePair = (pair: unknown): pair is [number, number] =>
  Array.isArray(pair) && pair.length >= 2 && Number.isFinite(pair[0]) && Number.isFinite(pair[1])

const getAreaGeometry = (geojson?: GeoJsonShape | GeoJsonFeature | GeoJsonFeatureCollection | null): GeoJsonShape | GeoJsonFeatureCollection | null => {
  if (!geojson) return null
  if (geojson.type === 'Feature') return geojson.geometry ?? null
  return geojson
}

const isPolygonGeometry = (geojson?: GeoJsonShape | GeoJsonFeatureCollection | null): geojson is Extract<GeoJsonShape, { type: 'Polygon' }> =>
  Boolean(geojson && geojson.type === 'Polygon' && Array.isArray(geojson.coordinates))

const isMultiPolygonGeometry = (geojson?: GeoJsonShape | GeoJsonFeatureCollection | null): geojson is Extract<GeoJsonShape, { type: 'MultiPolygon' }> =>
  Boolean(geojson && geojson.type === 'MultiPolygon' && Array.isArray(geojson.coordinates))

const getGeoJsonBoundsSafely = (geojson?: GeoJsonShape | GeoJsonFeatureCollection | null): LatLngBoundsExpression | null => {
  const points: [number, number][] = []

  if (isPolygonGeometry(geojson)) {
    geojson.coordinates.flat().forEach((pair) => {
      if (!isFiniteCoordinatePair(pair)) return
      const [lng, lat] = pair
      points.push([lat, lng])
    })
  }

  if (isMultiPolygonGeometry(geojson)) {
    geojson.coordinates.flat(2).forEach((pair) => {
      if (!isFiniteCoordinatePair(pair)) return
      const [lng, lat] = pair
      points.push([lat, lng])
    })
  }

  if (geojson && geojson.type === 'FeatureCollection') {
    geojson.features.forEach((feature) => {
      if (!feature.geometry) return
      const bounds = getGeoJsonBoundsSafely(feature.geometry)
      if (Array.isArray(bounds)) points.push(...(bounds as [number, number][]))
    })
  }

  return points.length > 2 ? points : null
}

const getGeometrySummary = (geojson?: GeoJsonShape | GeoJsonFeatureCollection | null) => {
  if (isPolygonGeometry(geojson)) {
    return {
      valid: Boolean(getGeoJsonBoundsSafely(geojson)),
      type: 'Polygon',
      rings: geojson.coordinates.length,
      points: geojson.coordinates[0]?.length ?? 0,
    }
  }

  if (isMultiPolygonGeometry(geojson)) {
    return {
      valid: Boolean(getGeoJsonBoundsSafely(geojson)),
      type: 'MultiPolygon',
      rings: geojson.coordinates.reduce((acc, polygon) => acc + polygon.length, 0),
      points: geojson.coordinates[0]?.[0]?.length ?? 0,
    }
  }

  if (geojson?.type === 'FeatureCollection') return { valid: Boolean(getGeoJsonBoundsSafely(geojson)), type: 'FeatureCollection', rings: geojson.features.length, points: null as number | null }
  return { valid: false, type: 'unbekannt', rings: null as number | null, points: null as number | null }
}

function FitBounds({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap()
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [16, 16] })
  }, [bounds, map])
  return null
}

export function AreaDetailPage() {
  const { areaId } = useParams()
  const id = Number(areaId)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const areaQuery = useQuery({ queryKey: ['area', id], queryFn: () => getArea(id), enabled: Number.isFinite(id) })

  const remove = useMutation({
    mutationFn: () => deleteArea(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['areas-pool'] })
      qc.invalidateQueries({ queryKey: ['campaign-areas'] })
      navigate('/areas')
    },
  })

  const area = areaQuery.data as Area | undefined
  const geometry = useMemo(() => getAreaGeometry(area?.geojson), [area?.geojson])
  const summary = useMemo(() => getGeometrySummary(geometry), [geometry])
  const bounds = useMemo(() => getGeoJsonBoundsSafely(geometry), [geometry])
  const canUpdate = can(area?.can?.update)
  const canDelete = can(area?.can?.delete)
  const assignments = (area?.campaigns ?? area?.assignments) as AreaAssignmentRef[] | undefined
  const prettyGeoJson = useMemo(() => {
    try {
      return JSON.stringify(area?.geojson ?? null, null, 2)
    } catch {
      return JSON.stringify(null, null, 2)
    }
  }, [area?.geojson])

  if (areaQuery.isLoading) return <LoadingState />
  if (areaQuery.isError || !area) {
    const error = areaQuery.error as ApiError
    if (error?.status === 401) return <Navigate to="/login" replace />
    if (error?.status === 403) return <ErrorState message="Keine Berechtigung für diese Aktion." />
    if (error?.status === 404) return <ErrorState message="Fläche nicht gefunden." />
    return <ErrorState message="Serverfehler beim Laden oder Speichern der Fläche." />
  }

  return <section className="space-y-4">
    <Link to="/areas" className="text-sm text-blue-600">← Zurück zum Flächen-Pool</Link>
    <div className="rounded border bg-white p-4 flex items-center justify-between"><h1 className="text-3xl font-semibold">{area.name || '—'}</h1><div className="flex gap-2"><Link to={`/areas/${id}/edit`} className={`border px-3 py-2 ${!canUpdate ? 'pointer-events-none opacity-50' : ''}`} title={!canUpdate ? NO_PERMISSION_MESSAGE : undefined}>Bearbeiten</Link><button className="bg-red-600 text-white px-3 py-2 disabled:opacity-50" disabled={!canDelete} title={!canDelete ? NO_PERMISSION_MESSAGE : undefined} onClick={() => window.confirm(`Fläche "${area.name}" löschen?`) && remove.mutate()}>Löschen</button></div></div>

    <div className="rounded border bg-white p-4 space-y-1"><h2 className="font-medium">Übersicht</h2><p>ID: {area.id}</p><p>Name: {area.name || '—'}</p><p>Erstellt: {formatDate(area.created_at)}</p><p>Aktualisiert: {formatDate(area.updated_at)}</p><p>GeoJSON-Typ: {summary.type}</p>{summary.rings !== null && <p>Anzahl Ringe: {summary.rings}</p>}{summary.points !== null && <p>Punkte (erste Außenlinie): {summary.points}</p>}</div>

    <div className="rounded border bg-white p-4 space-y-2"><h2 className="font-medium">Kartenvorschau</h2>
      {summary.valid && bounds && geometry ? <div className="h-80 overflow-hidden rounded border"><MapContainer center={DEFAULT_CENTER} zoom={6} className="h-full w-full"><TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} /><FitBounds bounds={bounds} /><GeoJSON data={geometry as GeoJSON.GeoJsonObject} /></MapContainer></div> : <p className="text-sm text-slate-700">Keine darstellbare GeoJSON-Geometrie vorhanden (Polygon/MultiPolygon erwartet).</p>}
    </div>

    <div className="rounded border bg-white p-4"><details><summary className="cursor-pointer font-medium">GeoJSON</summary><pre className="mt-2 max-h-80 overflow-auto rounded border bg-slate-50 p-3 text-xs">{prettyGeoJson}</pre></details></div>

    <div className="rounded border bg-white p-4 space-y-2"><h2 className="font-medium">Kampagnen-Zuweisungen</h2>
      {!assignments && <p className="text-sm text-slate-600">Kampagnen-Zuweisungen werden von der API auf dieser Flächendetailseite noch nicht bereitgestellt.</p>}
      {Array.isArray(assignments) && assignments.length === 0 && <EmptyState message="Keine Kampagnen-Zuweisungen vorhanden." />}
      {Array.isArray(assignments) && assignments.length > 0 && assignments.map((entry, idx) => {
        const usage = entry.usage === 'boundary' ? 'Begrenzung' : entry.usage === 'target' ? 'Zielgebiet' : '—'
        const campaignId = entry.campaign_id ?? entry.id
        return <div key={`${campaignId ?? idx}`} className="rounded border p-2 text-sm"><p className="font-medium">{entry.campaign_name ?? entry.name ?? `Kampagne ${campaignId ?? '—'}`}</p><p>Nutzung: {usage}</p>{entry.boundary_area_id ? <p>Begrenzungsfläche ID: {entry.boundary_area_id}</p> : null}{entry.notes ? <p>Notizen: {entry.notes}</p> : null}{campaignId ? <Link className="text-blue-600" to={`/campaigns/${campaignId}`}>Zur Kampagne</Link> : null}</div>
      })}
    </div>
  </section>
}
