import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CircleMarker, GeoJSON } from 'react-leaflet'
import { ApiError } from '../api/client'
import { importAreaBuildingsFromOsm } from '../api/endpoints'
import type { Area, AreaBuilding, GeoJsonInput } from '../types/models'
import { can, NO_PERMISSION_MESSAGE } from '../utils/permissions'

const IMPORT_LABEL = 'Gebäude aus OSM erfassen'

const buildingKey = (building: AreaBuilding, index = 0) =>
  building.id ? `id:${building.id}` : building.osm_id ? `${building.osm_type ?? 'osm'}:${building.osm_id}` : `row:${index}`

const normalizeBuildings = (area?: Area | null): AreaBuilding[] =>
  (area?.area_buildings ?? area?.buildings ?? []) as AreaBuilding[]

const getBuildingGeometry = (building: AreaBuilding): GeoJsonInput | null => {
  const geometry = building.geojson ?? building.geometry
  if (!geometry || typeof geometry !== 'object') return null
  const type = (geometry as { type?: unknown }).type
  return type === 'Feature' || type === 'FeatureCollection' || type === 'Polygon' || type === 'MultiPolygon'
    ? geometry
    : null
}

const getBuildingPoint = (building: AreaBuilding): [number, number] | null => {
  const latValue = building.lat ?? building.latitude
  const lngValue = building.lng ?? building.longitude
  const lat = typeof latValue === 'string' ? Number(latValue) : latValue
  const lng = typeof lngValue === 'string' ? Number(lngValue) : lngValue
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat as number, lng as number] : null
}

const getHouseNumber = (building: AreaBuilding) =>
  building.housenumber ?? building.house_number ?? building.addr_housenumber ?? building.properties?.['addr:housenumber'] ?? 'ohne Nr.'

const getStreet = (building: AreaBuilding) =>
  building.street ?? building.addr_street ?? building.properties?.['addr:street'] ?? ''

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

const mergeBuildings = (existing: AreaBuilding[], imported: AreaBuilding[]) => {
  const byKey = new Map<string, AreaBuilding>()
  existing.forEach((building, index) => byKey.set(buildingKey(building, index), building))
  imported.forEach((building, index) => byKey.set(buildingKey(building, index), building))
  return Array.from(byKey.values())
}

export function AreaBuildingsLayer({ buildings }: { buildings: AreaBuilding[] }) {
  return <>
    {buildings.map((building, index) => {
      const geometry = getBuildingGeometry(building)
      if (geometry) {
        return <GeoJSON
          key={buildingKey(building, index)}
          data={geometry as GeoJSON.GeoJsonObject}
          style={() => ({ color: '#7c2d12', fillColor: '#fb923c', fillOpacity: 0.35, weight: 1.5 })}
        />
      }

      const point = getBuildingPoint(building)
      return point ? <CircleMarker
        key={buildingKey(building, index)}
        center={point}
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
}: {
  area: Area
  hasValidPolygon: boolean
  disabledReason?: string
}) {
  const qc = useQueryClient()
  const [successMessage, setSuccessMessage] = useState('')
  const buildings = useMemo(() => normalizeBuildings(area), [area])
  const canManageBuildings = can(area.can?.manage_buildings)

  const importMutation = useMutation({
    mutationFn: () => importAreaBuildingsFromOsm(area.id),
    onMutate: () => setSuccessMessage(''),
    onSuccess: (imported) => {
      const merged = mergeBuildings(buildings, imported)
      qc.setQueryData<Area>(['area', area.id], (current) => current
        ? { ...current, area_buildings: merged, buildings: merged, building_count: merged.length }
        : current)
      qc.invalidateQueries({ queryKey: ['area', area.id] })
      qc.invalidateQueries({ queryKey: ['areas-pool'] })
      qc.invalidateQueries({ queryKey: ['campaign-areas'] })
      setSuccessMessage(`${imported.length} Gebäude aus OSM erfasst.`)
    },
  })

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
        <p className="text-sm text-slate-600">Erfasste Gebäude: {area.building_count ?? buildings.length}</p>
      </div>
      <button
        type="button"
        className="border px-3 py-2 disabled:opacity-50"
        disabled={disabled}
        title={title}
        onClick={() => importMutation.mutate()}
      >
        {importMutation.isPending ? 'Gebäude werden aus OSM geladen ...' : IMPORT_LABEL}
      </button>
    </div>

    {successMessage && <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">{successMessage}</p>}
    {importMutation.isError && <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{formatImportError(importMutation.error)}</p>}

    {buildings.length > 0 ? (
      <div className="max-h-64 overflow-auto rounded border">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr><th className="p-2">Hausnummer</th><th className="p-2">Straße</th><th className="p-2">OSM</th></tr>
          </thead>
          <tbody>
            {buildings.map((building, index) => (
              <tr key={buildingKey(building, index)} className="border-t">
                <td className="p-2">{String(getHouseNumber(building))}</td>
                <td className="p-2">{String(getStreet(building) || '—')}</td>
                <td className="p-2">{building.osm_type && building.osm_id ? `${building.osm_type}/${building.osm_id}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : <p className="text-sm text-slate-600">Noch keine Gebäude für diese Fläche erfasst.</p>}
  </div>
}

export const getAreaBuildings = normalizeBuildings
