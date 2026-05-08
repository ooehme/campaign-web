import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import type { Path } from 'leaflet'
import { ApiError } from '../api/client'
import { importAreaBuildingsFromOsm, listAreaBuildings } from '../api/endpoints'
import type { Area, AreaBuilding, AssignmentHouseholdTargeting, GeoJsonInput } from '../types/models'
import { MAP_ATTRIBUTION, MAP_TILE_URL } from '../utils/constants'
import { getAreaGeometryBoundsSafely, getGeometryFromAreaGeoJson } from '../utils/campaignAreaMap'
import { NO_PERMISSION_MESSAGE } from '../utils/permissions'

const DEFAULT_CENTER: [number, number] = [51.1657, 10.4515]
const EMPTY_FALLBACK_BUILDINGS: AreaBuilding[] = []

const getBuildingId = (building: AreaBuilding) => typeof building.id === 'number' ? building.id : null
const stringValue = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : undefined
const getHouseNumber = (building: AreaBuilding) =>
  stringValue(building.address?.housenumber)
  ?? stringValue(building.housenumber)
  ?? stringValue(building.house_number)
  ?? stringValue(building.addr_housenumber)
  ?? stringValue(building.metadata?.osm_tags?.['addr:housenumber'])
  ?? stringValue(building.properties?.['addr:housenumber'])
  ?? '-'
const getStreet = (building: AreaBuilding) =>
  stringValue(building.address?.street)
  ?? stringValue(building.street)
  ?? stringValue(building.addr_street)
  ?? stringValue(building.metadata?.osm_tags?.['addr:street'])
  ?? stringValue(building.properties?.['addr:street'])
  ?? ''
const getBuildingType = (building: AreaBuilding) =>
  stringValue(building.building_type)
  ?? stringValue(building.type)
  ?? stringValue(building.metadata?.osm_tags?.building)
  ?? stringValue(building.properties?.building)
  ?? stringValue(building.properties?.['building:use'])
  ?? '-'
const getAddress = (building: AreaBuilding) => {
  const address = [getStreet(building), getHouseNumber(building)].filter((value) => value && value !== '-').join(' ')
  return stringValue(building.label) ?? (address || '-')
}

const getBuildingGeometry = (building: AreaBuilding): GeoJsonInput | null => {
  const geometry = building.geojson ?? building.geometry
  if (!geometry || typeof geometry !== 'object') return null
  const type = (geometry as { type?: unknown }).type
  return type === 'Feature' || type === 'FeatureCollection' || type === 'Polygon' || type === 'MultiPolygon' ? geometry : null
}

const getBuildingPoint = (building: AreaBuilding): [number, number] | null => {
  const latValue = building.lat ?? building.latitude
  const lngValue = building.lng ?? building.longitude
  const lat = typeof latValue === 'string' ? Number(latValue) : latValue
  const lng = typeof lngValue === 'string' ? Number(lngValue) : lngValue
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat as number, lng as number] : null
}

const buildingStyle = (selected: boolean, interactive: boolean) => ({
  color: selected ? '#1d4ed8' : '#64748b',
  fillColor: selected ? '#60a5fa' : '#cbd5e1',
  fillOpacity: selected ? 0.48 : 0.28,
  opacity: 0.95,
  weight: selected ? 3 : interactive ? 2 : 1.5,
})

const hoverStyle = (selected: boolean) => ({
  color: selected ? '#1e40af' : '#334155',
  fillColor: selected ? '#3b82f6' : '#94a3b8',
  fillOpacity: selected ? 0.58 : 0.38,
  weight: 3,
})

const formatLoadError = (error: unknown) => {
  if (!(error instanceof ApiError)) return 'Gebäude konnten nicht geladen werden.'
  if (error.status === 401) return 'Bitte erneut anmelden, um Gebäude zu laden.'
  if (error.status === 403) return 'Keine Berechtigung, Gebäude dieses Zielgebiets zu laden.'
  if (error.status === 404) return 'Für dieses Zielgebiet wurde keine Gebäude-API gefunden.'
  if (error.status >= 500) return 'Serverfehler beim Laden der Gebäude.'
  return 'Gebäude konnten nicht geladen werden.'
}

const formatImportError = (error: unknown) => {
  if (!(error instanceof ApiError)) return 'Gebäude konnten nicht aus OSM importiert werden.'
  if (error.status === 403) return NO_PERMISSION_MESSAGE
  if (error.status === 408 || error.status === 504) return 'OSM/Overpass hat nicht rechtzeitig geantwortet. Bitte später erneut versuchen.'
  if (error.status === 413) return 'Das Zielgebiet ist für den OSM-Import zu groß.'
  if (error.status === 422) return 'Das Zielgebiet ist ungültig oder kann nicht importiert werden.'
  if (error.status >= 500) return 'OSM/Overpass ist gerade nicht erreichbar oder der Import ist fehlgeschlagen.'
  return 'Gebäude konnten nicht aus OSM importiert werden.'
}

function FitBuildingsMap({ targetArea, buildings }: { targetArea: Area; buildings: AreaBuilding[] }) {
  const map = useMap()
  const bounds = useMemo(() => {
    const areaBounds = getAreaGeometryBoundsSafely(targetArea.geojson)
    if (areaBounds?.length) return areaBounds as LatLngBoundsExpression
    const points = buildings.flatMap((building) => {
      const point = getBuildingPoint(building)
      return point ? [point] : []
    })
    return points.length ? points as LatLngBoundsExpression : null
  }, [buildings, targetArea.geojson])

  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 17 })
  }, [bounds, map])

  return null
}

export function AssignmentBuildingsLayer({
  buildings,
  householdTargeting,
  selectedIds,
  onSelectedIdsChange,
  disabled = false,
  selectedOnly = false,
}: {
  buildings: AreaBuilding[]
  householdTargeting: AssignmentHouseholdTargeting | undefined
  selectedIds: number[]
  onSelectedIdsChange?: (ids: number[]) => void
  disabled?: boolean
  selectedOnly?: boolean
}) {
  const interactive = householdTargeting === 'selected_buildings' && !disabled && Boolean(onSelectedIdsChange)
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const visibleBuildings = selectedOnly ? buildings.filter((building) => {
    const id = getBuildingId(building)
    return Boolean(id && selectedSet.has(id))
  }) : buildings
  const toggleBuilding = (building: AreaBuilding) => {
    const id = getBuildingId(building)
    if (!id || !interactive || !onSelectedIdsChange) return
    onSelectedIdsChange(selectedSet.has(id) ? selectedIds.filter((entry) => entry !== id) : [...selectedIds, id])
  }

  return <>
    {visibleBuildings.map((building, index) => {
      const id = getBuildingId(building)
      const selected = Boolean(id && selectedSet.has(id))
      const geometry = getBuildingGeometry(building)
      const popup = <Popup>
        <div className="space-y-1 text-sm">
          <p className="font-medium">{getAddress(building)}</p>
          <p>Gebäudetyp: {String(getBuildingType(building))}</p>
          <p>OSM-ID: {building.osm_type && building.osm_id ? `${building.osm_type}/${building.osm_id}` : '-'}</p>
          <p>Status: {selected ? 'ausgewählt' : 'nicht ausgewählt'}</p>
          {householdTargeting === 'selected_buildings' && onSelectedIdsChange && <button type="button" className="mt-1 border px-2 py-1 disabled:opacity-50" disabled={disabled || !id} onClick={() => toggleBuilding(building)}>{selected ? 'Auswahl entfernen' : 'Auswählen'}</button>}
        </div>
      </Popup>

      if (geometry) {
        return <GeoJSON
          key={`${id ?? index}-${selected}`}
          data={geometry as GeoJSON.GeoJsonObject}
          style={() => buildingStyle(selected, interactive)}
          eventHandlers={{
            click: () => toggleBuilding(building),
            mouseover: (event) => {
              if (interactive) (event.target as Path).setStyle(hoverStyle(selected))
            },
            mouseout: (event) => {
              const layer = event.target as Path
              layer.setStyle(buildingStyle(selected, interactive))
            },
          }}
        >{popup}</GeoJSON>
      }

      const point = getBuildingPoint(building)
      return point ? <CircleMarker
        key={`${id ?? index}-${selected}`}
        center={point}
        radius={selected ? 6 : 4}
        pathOptions={buildingStyle(selected, interactive)}
        eventHandlers={{ click: () => toggleBuilding(building) }}
      >{popup}</CircleMarker> : null
    })}
  </>
}

export function AssignmentBuildingSelector({
  targetArea,
  householdTargeting,
  selectedIds,
  onSelectedIdsChange,
  disabled = false,
  showImportButton = true,
  selectedOnly = false,
  fallbackBuildings = EMPTY_FALLBACK_BUILDINGS,
}: {
  targetArea: Area | null | undefined
  householdTargeting: AssignmentHouseholdTargeting | undefined
  selectedIds: number[]
  onSelectedIdsChange: (ids: number[]) => void
  disabled?: boolean
  showImportButton?: boolean
  selectedOnly?: boolean
  fallbackBuildings?: AreaBuilding[]
}) {
  const queryClient = useQueryClient()
  const targetAreaId = targetArea?.id
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const buildingsQuery = useQuery({
    queryKey: ['area-buildings', targetAreaId],
    queryFn: () => listAreaBuildings(targetAreaId as number),
    enabled: Boolean(targetAreaId),
    retry: false,
  })

  const importMutation = useMutation({
    mutationFn: () => importAreaBuildingsFromOsm(targetAreaId as number),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['area-buildings', targetAreaId] })
      queryClient.invalidateQueries({ queryKey: ['area', targetAreaId] })
      queryClient.invalidateQueries({ queryKey: ['campaign-areas'] })
    },
  })

  useEffect(() => {
    if (householdTargeting !== 'selected_buildings' && selectedIds.length > 0) onSelectedIdsChange([])
  }, [householdTargeting, onSelectedIdsChange, selectedIds.length])

  const buildings = useMemo(() => {
    const byId = new Map<number, AreaBuilding>()
    const anonymous: AreaBuilding[] = []
    for (const building of [...fallbackBuildings, ...(buildingsQuery.data ?? [])]) {
      const id = getBuildingId(building)
      if (id) byId.set(id, building)
      else anonymous.push(building)
    }
    return [...byId.values(), ...anonymous]
  }, [buildingsQuery.data, fallbackBuildings])

  if (!targetArea) return null

  const visibleBuildings = selectedOnly ? buildings.filter((building) => {
    const id = getBuildingId(building)
    return Boolean(id && selectedSet.has(id))
  }) : buildings
  const targetGeometry = getGeometryFromAreaGeoJson(targetArea.geojson)

  return <div className="space-y-3 rounded border bg-slate-50 p-3">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-medium">Gebäude im Zielgebiet</h2>
        <p className="text-sm text-slate-600">
          {householdTargeting === 'selected_buildings'
            ? `${selectedIds.length} von ${buildings.length} Gebäude(n) ausgewählt`
            : `${buildings.length} Gebäude verfügbar`}
        </p>
      </div>
      {showImportButton && (
        <button
          type="button"
          className="border bg-white px-3 py-2 disabled:opacity-50"
          disabled={!targetAreaId || importMutation.isPending}
          onClick={() => importMutation.mutate()}
        >
          {importMutation.isPending ? 'Gebäude werden aus OSM geladen ...' : 'Gebäude aus OSM erfassen'}
        </button>
      )}
    </div>

    {buildingsQuery.isLoading && <p className="text-sm text-slate-600">Gebäude werden geladen ...</p>}
    {buildingsQuery.isError && <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{formatLoadError(buildingsQuery.error)}</p>}
    {importMutation.isError && <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{formatImportError(importMutation.error)}</p>}
    {!buildingsQuery.isLoading && !buildingsQuery.isError && buildings.length === 0 && (
      <p className="rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">Für dieses Zielgebiet wurden noch keine Gebäude erfasst. Erfasse zuerst Gebäude aus OSM.</p>
    )}

    <div className="aspect-square w-full overflow-hidden rounded border bg-white">
      <MapContainer center={DEFAULT_CENTER} zoom={6} className="h-full w-full">
        <TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} />
        {targetGeometry && <GeoJSON data={targetGeometry as GeoJSON.GeoJsonObject} style={{ color: '#0f766e', fillColor: '#14b8a6', fillOpacity: 0.12, weight: 2 }} />}
        <AssignmentBuildingsLayer buildings={buildings} householdTargeting={householdTargeting} selectedIds={selectedIds} onSelectedIdsChange={onSelectedIdsChange} disabled={disabled} selectedOnly={selectedOnly} />
        <FitBuildingsMap targetArea={targetArea} buildings={visibleBuildings} />
      </MapContainer>
    </div>
  </div>
}
