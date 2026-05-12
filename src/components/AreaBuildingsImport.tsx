import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import L from 'leaflet'
import { CircleMarker, GeoJSON, useMap } from 'react-leaflet'
import { ApiError } from '../api/client'
import { importAreaBuildingsFromOsm, listAreaBuildings } from '../api/endpoints'
import type { ImportAreaBuildingsProgress } from '../api/endpoints'
import type { Area, AreaBuilding, GeoJsonInput } from '../types/models'
import { can, NO_PERMISSION_MESSAGE } from '../utils/permissions'

const IMPORT_LABEL = 'Gebäude aus OSM erfassen'

const buildingKey = (building: AreaBuilding, index = 0) =>
  building.id ? `id:${building.id}` : building.osm_id ? `${building.osm_type ?? 'osm'}:${building.osm_id}` : `row:${index}`

const normalizeBuildings = (area?: Area | null): AreaBuilding[] =>
  (area?.area_buildings ?? area?.buildings ?? []) as AreaBuilding[]

const stringValue = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : undefined

const formatImportProgress = (progress: ImportAreaBuildingsProgress | null) => {
  if (!progress?.chunks_total) return null
  if (progress.event === 'waiting_for_overpass_slot') return 'Warte auf freien Overpass-Slot ...'
  const processed = progress.chunks_processed ?? Math.max((progress.chunk ?? 1) - 1, 0)
  const current = progress.event === 'chunk_started' && progress.chunk ? progress.chunk : processed
  const percent = Math.round((processed / progress.chunks_total) * 100)
  return `Chunk ${current} / ${progress.chunks_total}${Number.isFinite(percent) ? ` (${percent} %)` : ''}`
}

export const useAreaBuildings = (areaId?: number) => useQuery({
  queryKey: ['area-buildings', areaId],
  queryFn: () => listAreaBuildings(areaId as number),
  enabled: Boolean(areaId),
  retry: false,
})

const getBuildingGeometry = (building: AreaBuilding): GeoJsonInput | null => {
  const geometry = building.geojson ?? building.geometry
  if (!geometry || typeof geometry !== 'object') return null
  const type = (geometry as { type?: unknown }).type
  return type === 'Feature' || type === 'FeatureCollection' || type === 'Polygon' || type === 'MultiPolygon'
    ? geometry
    : null
}

const getBuildingBounds = (building?: AreaBuilding | null) => {
  const geometry = building ? getBuildingGeometry(building) : null
  if (!geometry) return null
  try {
    const bounds = L.geoJSON(geometry as GeoJSON.GeoJsonObject).getBounds()
    return bounds.isValid() ? bounds : null
  } catch {
    return null
  }
}

const getBuildingPoint = (building: AreaBuilding): [number, number] | null => {
  const latValue = building.lat ?? building.latitude
  const lngValue = building.lng ?? building.longitude
  const lat = typeof latValue === 'string' ? Number(latValue) : latValue
  const lng = typeof lngValue === 'string' ? Number(lngValue) : lngValue
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat as number, lng as number] : null
}

const getHouseNumber = (building: AreaBuilding) =>
  stringValue(building.address?.housenumber)
  ?? stringValue(building.housenumber)
  ?? stringValue(building.house_number)
  ?? stringValue(building.addr_housenumber)
  ?? stringValue(building.metadata?.osm_tags?.['addr:housenumber'])
  ?? stringValue(building.properties?.['addr:housenumber'])
  ?? 'ohne Nr.'

const getStreet = (building: AreaBuilding) =>
  stringValue(building.address?.street)
  ?? stringValue(building.street)
  ?? stringValue(building.addr_street)
  ?? stringValue(building.metadata?.osm_tags?.['addr:street'])
  ?? stringValue(building.properties?.['addr:street'])
  ?? ''

const getPostcode = (building: AreaBuilding) =>
  stringValue(building.address?.postcode)
  ?? stringValue(building.metadata?.osm_tags?.['addr:postcode'])
  ?? stringValue(building.properties?.['addr:postcode'])
  ?? ''

const getCity = (building: AreaBuilding) =>
  stringValue(building.address?.city)
  ?? stringValue(building.city)
  ?? stringValue(building.addr_city)
  ?? stringValue(building.metadata?.osm_tags?.['addr:city'])
  ?? stringValue(building.properties?.['addr:city'])
  ?? ''

const formatImportError = (error: unknown) => {
  if (!(error instanceof ApiError)) return 'Gebäude konnten nicht aus OSM importiert werden.'
  const payload = error.details as { message?: string; error?: string; errors?: Record<string, string[]> } | undefined
  const apiMessage = payload?.message ?? payload?.error ?? Object.values(payload?.errors ?? {})[0]?.[0]
  if (error.status === 401) return 'Bitte erneut anmelden, um Gebäude zu importieren.'
  if (error.status === 403) return 'Keine Berechtigung, Gebäude für diese Fläche zu verwalten.'
  if (error.status === 404) return 'Import-Endpunkt oder Fläche wurde nicht gefunden.'
  if (error.status === 408 || error.status === 504) return 'OSM/Overpass hat nicht rechtzeitig geantwortet. Bitte später erneut versuchen.'
  if (error.status === 413) return 'Das Zielgebiet ist für den OSM-Import zu groß.'
  if (error.status === 422) return apiMessage ?? 'Das Zielgebiet ist ungültig oder kann nicht importiert werden.'
  if (error.status >= 500) return apiMessage ?? 'OSM/Overpass ist gerade nicht erreichbar oder der Import ist fehlgeschlagen.'
  return apiMessage ?? 'Gebäude konnten nicht aus OSM importiert werden.'
}

function FocusBuilding({ building, focusKey }: { building?: AreaBuilding | null; focusKey?: number }) {
  const map = useMap()

  useEffect(() => {
    if (!building) return
    const bounds = getBuildingBounds(building)
    if (bounds) {
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 19 })
      return
    }
    const point = getBuildingPoint(building)
    if (point) map.setView(point, Math.max(map.getZoom(), 18))
  }, [building, focusKey, map])

  return null
}

export function AreaBuildingsLayer({ buildings, focusedBuildingId, focusKey, pane }: { buildings: AreaBuilding[]; focusedBuildingId?: number | null; focusKey?: number; pane?: string }) {
  const focusedBuilding = useMemo(
    () => buildings.find((building) => building.id === focusedBuildingId) ?? null,
    [buildings, focusedBuildingId],
  )

  return <>
    <FocusBuilding building={focusedBuilding} focusKey={focusKey} />
    {buildings.map((building, index) => {
      const geometry = getBuildingGeometry(building)
      if (geometry) {
        return <GeoJSON
          key={buildingKey(building, index)}
          data={geometry as GeoJSON.GeoJsonObject}
          pane={pane}
          style={() => ({ color: '#7c2d12', fillColor: '#fb923c', fillOpacity: 0.35, weight: 1.5 })}
        />
      }

      const point = getBuildingPoint(building)
      return point ? <CircleMarker
        key={buildingKey(building, index)}
        center={point}
        pane={pane}
        radius={4}
        pathOptions={{ color: '#7c2d12', fillColor: '#fb923c', fillOpacity: 0.85, weight: 1 }}
      /> : null
    })}
  </>
}

export function AreaBuildingsImport({
  area,
  hasValidPolygon,
  disabledReason,
  focusedBuildingId,
  onBuildingFocus,
}: {
  area: Area
  hasValidPolygon: boolean
  disabledReason?: string
  focusedBuildingId?: number | null
  onBuildingFocus?: (building: AreaBuilding) => void
}) {
  const qc = useQueryClient()
  const [successMessage, setSuccessMessage] = useState('')
  const [importProgress, setImportProgress] = useState<ImportAreaBuildingsProgress | null>(null)
  const embeddedBuildings = useMemo(() => normalizeBuildings(area), [area])
  const buildingsQuery = useAreaBuildings(area.id)
  const buildings = buildingsQuery.data ?? embeddedBuildings
  const canManageBuildings = can(area.can?.manage_buildings)

  const importMutation = useMutation({
    mutationFn: () => importAreaBuildingsFromOsm(area.id, { stream: true, onProgress: setImportProgress }),
    onMutate: () => {
      setSuccessMessage('')
      setImportProgress(null)
    },
    onSuccess: (imported) => {
      const merged = imported
      qc.setQueryData<AreaBuilding[]>(['area-buildings', area.id], merged)
      qc.setQueryData<Area>(['area', area.id], (current) => current
        ? { ...current, area_buildings: merged, buildings: merged, building_count: merged.length }
        : current)
      qc.invalidateQueries({ queryKey: ['area-buildings', area.id] })
      qc.invalidateQueries({ queryKey: ['area', area.id] })
      qc.invalidateQueries({ queryKey: ['areas-pool'] })
      qc.invalidateQueries({ queryKey: ['campaign-areas'] })
      setSuccessMessage(`${imported.length} Gebäude aus OSM erfasst.`)
    },
  })
  const importProgressLabel = formatImportProgress(importProgress)

  const disabled = Boolean(disabledReason) || !area.id || !hasValidPolygon || !canManageBuildings || importMutation.isPending
  const title = disabledReason
    ?? (!area.id ? 'Fläche zuerst speichern.'
      : !hasValidPolygon ? 'Für den Import ist ein gültiges Zielgebiet-Polygon erforderlich.'
        : !canManageBuildings ? NO_PERMISSION_MESSAGE
          : undefined)

  return <div className="rounded border bg-white p-4 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="font-medium">Gebäude</h2>
        <p className="text-sm text-slate-600">Erfasste Gebäude: {buildings.length || area.building_count || 0}</p>
      </div>
      <button
        type="button"
        className="border px-3 py-2 disabled:opacity-50"
        disabled={disabled}
        title={title}
        onClick={() => importMutation.mutate()}
      >
        {importMutation.isPending ? 'Gebäude werden erfasst ...' : IMPORT_LABEL}
      </button>
    </div>

    {importMutation.isPending && importProgressLabel && <p className="text-sm text-slate-600">{importProgressLabel}</p>}
    {successMessage && <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">{successMessage}</p>}
    {buildingsQuery.isLoading && <p className="text-sm text-slate-600">Gebäude werden geladen ...</p>}
    {buildingsQuery.isError && <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">Gebäude konnten nicht geladen werden.</p>}
    {importMutation.isError && <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{formatImportError(importMutation.error)}</p>}

    {buildings.length > 0 ? (
      <div className="max-h-64 overflow-auto rounded border">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr><th className="p-2">Straße</th><th className="p-2">Hausnummer</th><th className="p-2">PLZ</th><th className="p-2">Ort</th><th className="p-2">OSM</th></tr>
          </thead>
          <tbody>
            {buildings.map((building, index) => (
              <tr
                key={buildingKey(building, index)}
                className={`border-t ${building.id === focusedBuildingId ? 'bg-blue-50' : 'hover:bg-slate-50'} ${onBuildingFocus ? 'cursor-pointer' : ''}`}
                onClick={() => onBuildingFocus?.(building)}
              >
                <td className="p-2">{getStreet(building) || '—'}</td>
                <td className="p-2">{getHouseNumber(building)}</td>
                <td className="p-2">{getPostcode(building) || '—'}</td>
                <td className="p-2">{getCity(building) || '—'}</td>
                <td className="p-2">{building.osm_type && building.osm_id ? `${building.osm_type}/${building.osm_id}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : !buildingsQuery.isLoading && <p className="text-sm text-slate-600">Noch keine Gebäude für diese Fläche erfasst.</p>}
  </div>
}

export const getAreaBuildings = normalizeBuildings
