import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GeoJSON, MapContainer, TileLayer } from 'react-leaflet'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { deleteArea, getArea, importAreaBuildingsFromOsm } from '../api/endpoints'
import { AreaBuildingsImport, AreaBuildingsLayer, AreaOsmChunkLayer, getAreaBuildings, useAreaBuildings } from '../components/AreaBuildingsImport'
import type { AreaOsmChunkReloadPayload } from '../components/AreaBuildingsImport'
import { getAreaMaskGeometry, getAreaPositions, MAP_PANES, MapLayerPanes, MapMask, MapViewportController } from '../components/MapViewport'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import type { Area, AreaAssignmentRef } from '../types/models'
import { extractGeometry, getGeometryStats } from '../utils/areaGeometry'
import { MAP_ATTRIBUTION, MAP_TILE_URL } from '../utils/constants'
import { can, NO_PERMISSION_MESSAGE } from '../utils/permissions'

const DEFAULT_CENTER: [number, number] = [51.1657, 10.4515]

const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleString('de-DE') : '—')

const formatChunkImportError = (error: unknown) => {
  if (!(error instanceof ApiError)) return 'Chunk konnte nicht aus OSM geladen werden.'
  const payload = error.details as { message?: string; error?: string; errors?: Record<string, string[] | string> } | undefined
  const firstError = Object.values(payload?.errors ?? {})[0]
  const errorDetail = Array.isArray(firstError) ? firstError[0] : firstError
  return payload?.message ?? payload?.error ?? errorDetail ?? 'Chunk konnte nicht aus OSM geladen werden.'
}

export function AreaDetailPage() {
  const { areaId } = useParams()
  const id = Number(areaId)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [focusedBuildingId, setFocusedBuildingId] = useState<number | null>(null)
  const [buildingFocusKey, setBuildingFocusKey] = useState(0)
  const [showOsmChunks, setShowOsmChunks] = useState(false)
  const [chunkImportMessage, setChunkImportMessage] = useState('')
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
  const geometry = useMemo(() => extractGeometry(area?.geojson), [area?.geojson])
  const summary = useMemo(() => getGeometryStats(area?.geojson), [area?.geojson])
  const areaPositions = useMemo(() => getAreaPositions(area), [area])
  const areaMaskGeometry = useMemo(() => getAreaMaskGeometry([area]), [area])
  const buildingsQuery = useAreaBuildings(area?.id)
  const buildings = buildingsQuery.data ?? getAreaBuildings(area)
  const canUpdate = can(area?.can?.update)
  const canDelete = can(area?.can?.delete)
  const canManageBuildings = can(area?.can?.manage_buildings)
  const assignments = (area?.campaigns ?? area?.assignments) as AreaAssignmentRef[] | undefined
  const prettyGeoJson = useMemo(() => {
    try {
      return JSON.stringify(area?.geojson ?? null, null, 2)
    } catch {
      return JSON.stringify(null, null, 2)
    }
  }, [area?.geojson])

  const importChunkMutation = useMutation({
    mutationFn: ({ cursor }: AreaOsmChunkReloadPayload) => importAreaBuildingsFromOsm(id, { startCursor: cursor, singleBatch: true }),
    onMutate: () => setChunkImportMessage(''),
    onSuccess: (imported, { chunk }) => {
      qc.setQueryData(['area-buildings', id], imported)
      qc.setQueryData<Area>(['area', id], (current) => current
        ? { ...current, area_buildings: imported, buildings: imported, building_count: imported.length }
        : current)
      qc.invalidateQueries({ queryKey: ['area-buildings', id] })
      qc.invalidateQueries({ queryKey: ['area', id] })
      qc.invalidateQueries({ queryKey: ['areas-pool'] })
      qc.invalidateQueries({ queryKey: ['campaign-areas'] })
      setChunkImportMessage(`Chunk ${chunk} neu geladen. ${imported.length} Gebäude verfügbar.`)
    },
  })

  if (areaQuery.isLoading) return <LoadingState />
  if (areaQuery.isError || !area) {
    const error = areaQuery.error as ApiError
    if (error?.status === 401) return <Navigate to="/login" replace />
    if (error?.status === 403) {
      return (
        <ErrorState
          title="Fläche nicht freigegeben"
          message="Ihr Konto darf diese Fläche nicht anzeigen."
          description="Öffnen Sie den Flächen-Pool, um eine verfügbare Fläche auszuwählen."
          actionLabel="Zurück zum Flächen-Pool"
          actionTo="/areas"
        />
      )
    }
    if (error?.status === 404) return <ErrorState message="Fläche nicht gefunden." />
    return <ErrorState message="Serverfehler beim Laden oder Speichern der Fläche." />
  }

  return <section className="space-y-4">
    <Link to="/areas" className="text-sm text-blue-600">← Zurück zum Flächen-Pool</Link>
    <div className="rounded border bg-white p-4 flex items-center justify-between"><h1 className="text-3xl font-semibold">{area.name || '—'}</h1><div className="flex gap-2"><Link to={`/areas/${id}/edit`} className={`border px-3 py-2 ${!canUpdate ? 'pointer-events-none opacity-50' : ''}`} title={!canUpdate ? NO_PERMISSION_MESSAGE : undefined}>Bearbeiten</Link><button className="bg-red-600 text-white px-3 py-2 disabled:opacity-50" disabled={!canDelete} title={!canDelete ? NO_PERMISSION_MESSAGE : undefined} onClick={() => window.confirm(`Fläche "${area.name}" löschen?`) && remove.mutate()}>Löschen</button></div></div>

    <div className="rounded border bg-white p-4 space-y-1"><h2 className="font-medium">Übersicht</h2><p>ID: {area.id}</p><p>Erstellt: {formatDate(area.created_at)}</p><p>Aktualisiert: {formatDate(area.updated_at)}</p><p>GeoJSON-Typ: {summary.type}</p>{summary.valid && summary.type === 'Polygon' && <><p>Anzahl Ringe: {summary.rings}</p><p>Punkte (erste Außenlinie): {summary.firstOuterPoints}</p></>}{summary.valid && summary.type === 'MultiPolygon' && <><p>Anzahl Polygone: {summary.polygons}</p><p>Anzahl Ringe: {summary.rings}</p><p>Punkte (erstes Polygon, Außenlinie): {summary.firstOuterPoints}</p></>}</div>

    <div className="rounded border bg-white p-4 space-y-2">
      <details>
        <summary className="cursor-pointer font-medium">Kartenvorschau</summary>
        <div className="mt-3 space-y-2">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showOsmChunks} onChange={(event) => setShowOsmChunks(event.target.checked)} />
            OSM-Chunks
          </label>
          {chunkImportMessage && <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">{chunkImportMessage}</p>}
          {importChunkMutation.isPending && <p className="text-sm text-slate-600">Chunk wird neu geladen ...</p>}
          {importChunkMutation.isError && <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{formatChunkImportError(importChunkMutation.error)}</p>}
          {summary.valid && areaPositions.length > 0 && geometry ? <div className="aspect-square w-full overflow-hidden rounded border"><MapContainer center={DEFAULT_CENTER} zoom={6} maxBoundsViscosity={0.85} className="h-full w-full"><TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} /><MapLayerPanes /><MapMask geometry={areaMaskGeometry} /><GeoJSON pane={MAP_PANES.areas} data={geometry as GeoJSON.GeoJsonObject} /><AreaOsmChunkLayer geojson={area.geojson} visible={showOsmChunks} disabled={!canManageBuildings || importChunkMutation.isPending} onChunkReload={(payload) => importChunkMutation.mutate(payload)} /><AreaBuildingsLayer pane={MAP_PANES.buildings} buildings={buildings} focusedBuildingId={focusedBuildingId} focusKey={buildingFocusKey} /><MapViewportController fitPositions={areaPositions} constrainPositions={areaPositions} padding={[16, 16]} /></MapContainer></div> : <p className="text-sm text-slate-700">Keine darstellbare GeoJSON-Geometrie vorhanden (Polygon/MultiPolygon erwartet).</p>}
        </div>
      </details>
    </div>

    <AreaBuildingsImport
      area={area}
      hasValidPolygon={summary.valid && areaPositions.length > 0}
      focusedBuildingId={focusedBuildingId}
      onBuildingFocus={(building) => {
        setFocusedBuildingId(building.id ?? null)
        setBuildingFocusKey((value) => value + 1)
      }}
    />

    <div className="rounded border bg-white p-4"><details><summary className="cursor-pointer font-medium">GeoJSON</summary><pre className="mt-2 max-h-80 overflow-auto rounded border bg-slate-50 p-3 text-xs">{prettyGeoJson}</pre></details></div>

    <div className="rounded border bg-white p-4 space-y-2"><details><summary className="cursor-pointer font-medium">Kampagnen-Zuweisungen</summary><div className="mt-3 space-y-2">
      {!assignments && <p className="text-sm text-slate-600">Kampagnen-Zuweisungen werden von der API auf dieser Flächendetailseite noch nicht bereitgestellt.</p>}
      {Array.isArray(assignments) && assignments.length === 0 && <EmptyState message="Keine Kampagnen-Zuweisungen vorhanden." />}
      {Array.isArray(assignments) && assignments.length > 0 && assignments.map((entry, idx) => {
        const usage = entry.usage === 'boundary' ? 'Begrenzung' : entry.usage === 'target' ? 'Zielgebiet' : '—'
        const campaignId = entry.campaign_id ?? entry.id
        return <div key={`${campaignId ?? idx}`} className="rounded border p-2 text-sm"><p className="font-medium">{entry.campaign_name ?? entry.name ?? `Kampagne ${campaignId ?? '—'}`}</p><p>Nutzung: {usage}</p>{entry.boundary_area_id ? <p>Begrenzungsfläche ID: {entry.boundary_area_id}</p> : null}{entry.notes ? <p>Notizen: {entry.notes}</p> : null}{campaignId ? <Link className="text-blue-600" to={`/campaigns/${campaignId}`}>Zur Kampagne</Link> : null}</div>
      })}
    </div></details></div>
  </section>
}
