import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import L from 'leaflet'
import { CircleMarker, GeoJSON, Popup, Tooltip, useMap } from 'react-leaflet'
import { ApiError } from '../api/client'
import { importAreaBuildingsFromOsm, listAreaBuildings } from '../api/endpoints'
import type { ImportAreaBuildingsOptions, ImportAreaBuildingsProgress } from '../api/endpoints'
import type { Area, AreaBuilding, GeoJsonInput } from '../types/models'
import { MAP_PANES } from './MapViewport'
import { DEFAULT_OSM_IMPORT_CHUNK_SIZE_METERS, buildOsmImportChunks } from '../utils/osmImportChunks'
import { can, NO_PERMISSION_MESSAGE } from '../utils/permissions'

const IMPORT_LABEL = 'Gebäude aus OSM erfassen'
type ImportAreaBuildingsMutationInput = Pick<ImportAreaBuildingsOptions, 'startCursor' | 'singleBatch'> & { displayChunk?: number }
export type AreaOsmChunkReloadPayload = { chunk: number; cursor: number }

const buildingKey = (building: AreaBuilding, index = 0) =>
  building.id ? `id:${building.id}` : building.osm_id ? `${building.osm_type ?? 'osm'}:${building.osm_id}` : `row:${index}`

const normalizeBuildings = (area?: Area | null): AreaBuilding[] =>
  (area?.area_buildings ?? area?.buildings ?? []) as AreaBuilding[]

const stringValue = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : undefined

const formatImportProgress = (progress: ImportAreaBuildingsProgress | null) => {
  if (progress?.event === 'import_started') return 'OSM-Import wird vorbereitet ...'
  if (progress?.complete === true) return 'OSM-Import abgeschlossen.'
  if (!progress?.chunks_total) {
    if (progress?.message) return progress.message
    if (progress?.complete === false && progress.next_chunk) return `OSM-Import läuft, nächster Chunk: ${progress.next_chunk}`
    if (progress?.cursor) return `OSM-Import läuft, Cursor ${progress.cursor} verarbeitet`
    return null
  }
  const processed = progress.chunks_processed ?? Math.max((progress.chunk ?? 1) - 1, 0)
  const current = progress.event === 'chunk_started' && progress.chunk ? progress.chunk : processed
  const percent = Math.round((processed / progress.chunks_total) * 100)
  const chunkLabel = `Chunk ${current} / ${progress.chunks_total}${Number.isFinite(percent) ? ` (${percent} %)` : ''}`
  const importedLabel = typeof progress.buildings_imported === 'number'
    ? `, ${progress.buildings_imported} Gebäude erfasst`
    : ''

  if (progress.event === 'waiting_for_overpass_slot') {
    const waitLabel = typeof progress.wait_seconds === 'number' ? ` (${progress.wait_seconds} s)` : ''
    return `Warte auf freien Overpass-Slot${waitLabel} - ${chunkLabel}${importedLabel}`
  }
  if (progress.event === 'overpass_retry_wait') {
    const waitLabel = typeof progress.wait_seconds === 'number' ? ` in ${progress.wait_seconds} s` : ''
    const attemptLabel = progress.attempt && progress.attempts_total ? ` (${progress.attempt}/${progress.attempts_total})` : ''
    const statusLabel = progress.http_status ? ` nach HTTP ${progress.http_status}` : ''
    return `Overpass-Retry${attemptLabel}${waitLabel}${statusLabel} - ${chunkLabel}${importedLabel}`
  }
  if (progress.event === 'chunk_started') return `Verarbeite ${chunkLabel}${importedLabel}`
  if (progress.event === 'chunk_finished') return `${chunkLabel} abgeschlossen${importedLabel}`
  return `${chunkLabel}${importedLabel}`
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
  const payload = error.details as { message?: string; error?: string; errors?: Record<string, string[] | string> } | undefined
  const firstError = Object.values(payload?.errors ?? {})[0]
  const errorDetail = Array.isArray(firstError) ? firstError[0] : firstError
  const apiMessage = payload?.message
  const apiFallback = payload?.error ?? errorDetail
  if (apiMessage) return apiMessage
  if (error.status === 401) return 'Bitte erneut anmelden, um Gebäude zu importieren.'
  if (error.status === 403) return 'Keine Berechtigung, Gebäude für diese Fläche zu verwalten.'
  if (error.status === 404) return 'Import-Endpunkt oder Fläche wurde nicht gefunden.'
  if (error.status === 408 || error.status === 504) return 'OSM/Overpass hat nicht rechtzeitig geantwortet. Bitte später erneut versuchen.'
  if (error.status === 413) return 'Das Zielgebiet ist für den OSM-Import zu groß.'
  if (error.status === 422) return apiFallback ?? 'Das Zielgebiet ist ungültig oder kann nicht importiert werden.'
  if (error.status >= 500) return apiFallback ?? 'OSM/Overpass ist gerade nicht erreichbar oder der Import ist fehlgeschlagen.'
  return apiFallback ?? 'Gebäude konnten nicht aus OSM importiert werden.'
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

export function AreaOsmChunkLayer({
  geojson,
  visible,
  disabled = false,
  pane = MAP_PANES.chunks,
  chunkSizeMeters = DEFAULT_OSM_IMPORT_CHUNK_SIZE_METERS,
  onChunkReload,
}: {
  geojson?: GeoJsonInput | null
  visible: boolean
  disabled?: boolean
  pane?: string
  chunkSizeMeters?: number
  onChunkReload?: (payload: AreaOsmChunkReloadPayload) => void
}) {
  const chunks = useMemo(
    () => visible ? buildOsmImportChunks(geojson, chunkSizeMeters) : { type: 'FeatureCollection' as const, features: [] },
    [chunkSizeMeters, geojson, visible],
  )

  if (!visible || chunks.features.length === 0) return null

  return <>
    {chunks.features.map((feature) => (
      <GeoJSON
        key={`osm-chunk-${feature.properties.chunk}`}
        pane={pane}
        data={feature as GeoJSON.GeoJsonObject}
        style={() => ({ color: '#ea580c', fillColor: '#fdba74', fillOpacity: 0.04, opacity: 0.95, weight: 1 })}
      >
        <Tooltip sticky>Chunk {feature.properties.chunk}</Tooltip>
        <Popup>
          <div className="space-y-2 text-sm">
            <p className="font-medium">Chunk {feature.properties.chunk}</p>
            {onChunkReload && (
              <button
                type="button"
                className="border px-2 py-1 disabled:opacity-50"
                disabled={disabled}
                onClick={() => onChunkReload({ chunk: feature.properties.chunk, cursor: feature.properties.cursor })}
              >
                Chunk neu laden
              </button>
            )}
          </div>
        </Popup>
      </GeoJSON>
    ))}
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
  const [chunkCursor, setChunkCursor] = useState('')
  const embeddedBuildings = useMemo(() => normalizeBuildings(area), [area])
  const buildingsQuery = useAreaBuildings(area.id)
  const buildings = buildingsQuery.data ?? embeddedBuildings
  const canManageBuildings = can(area.can?.manage_buildings)
  const selectedChunkCursor = Number(chunkCursor)
  const canImportSelectedChunk = Number.isInteger(selectedChunkCursor) && selectedChunkCursor > 0

  const importMutation = useMutation({
    mutationFn: (input?: ImportAreaBuildingsMutationInput) => importAreaBuildingsFromOsm(area.id, { onProgress: setImportProgress, ...input }),
    onMutate: () => {
      setSuccessMessage('')
      setImportProgress(null)
    },
    onSuccess: (imported, input) => {
      const merged = imported
      qc.setQueryData<AreaBuilding[]>(['area-buildings', area.id], merged)
      qc.setQueryData<Area>(['area', area.id], (current) => current
        ? { ...current, area_buildings: merged, buildings: merged, building_count: merged.length }
        : current)
      qc.invalidateQueries({ queryKey: ['area-buildings', area.id] })
      qc.invalidateQueries({ queryKey: ['area', area.id] })
      qc.invalidateQueries({ queryKey: ['areas-pool'] })
      qc.invalidateQueries({ queryKey: ['campaign-areas'] })
      setSuccessMessage(input?.singleBatch && input.startCursor
        ? `Chunk ${input.displayChunk ?? input.startCursor} neu geladen. ${imported.length} Gebäude verfügbar.`
        : `${imported.length} Gebäude aus OSM erfasst.`)
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
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="border px-3 py-2 disabled:opacity-50"
          disabled={disabled}
          title={title}
          onClick={() => importMutation.mutate({})}
        >
          {importMutation.isPending ? 'Gebäude werden erfasst ...' : IMPORT_LABEL}
        </button>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`area-${area.id}-osm-chunk`}>Chunk</label>
          <input
            id={`area-${area.id}-osm-chunk`}
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            className="w-24 border px-2 py-2"
            value={chunkCursor}
            disabled={disabled}
            placeholder="Chunk"
            onChange={(event) => setChunkCursor(event.target.value)}
          />
          <button
            type="button"
            className="border px-3 py-2 disabled:opacity-50"
            disabled={disabled || !canImportSelectedChunk}
            title={!canImportSelectedChunk ? 'Chunknummer eingeben.' : title}
            onClick={() => importMutation.mutate({ startCursor: selectedChunkCursor, singleBatch: true })}
          >
            Chunk laden
          </button>
        </div>
      </div>
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
