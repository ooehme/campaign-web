import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { ApiError } from '../api/client'
import { GeoJSON, MapContainer, Marker, Popup, TileLayer, useMapEvents } from 'react-leaflet'
import { createPosterLocation, deleteAssignment, deletePosterLocation, getAssignment, listAssignmentBuildings, listCampaignAreas, listCampaignTeams, listPosterLocations, updateAssignment, updatePosterLocation } from '../api/endpoints'
import { useAuth } from '../auth/AuthContext'
import { AssignmentBuildingSelector } from '../components/AssignmentBuildingSelector'
import { getAreaMaskGeometry, getAreaPositions, MAP_PANES, MapLayerPanes, MapMask, MapViewportController } from '../components/MapViewport'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import { ASSIGNMENT_STATUSES, MAP_ATTRIBUTION, MAP_TILE_URL, POSTER_LOCATION_STATUSES } from '../utils/constants'
import { assignmentStatusLabel, assignmentTypeLabel } from '../utils/assignment'
import { getAreaUsageOptions, getGeometryFromAreaGeoJson } from '../utils/campaignAreaMap'
import { posterLocationIcon } from '../utils/mapIcons'
import { can, canPermission, NO_PERMISSION_MESSAGE, permissionErrorMessage } from '../utils/permissions'
import { PERMISSIONS } from '../utils/permissionKeys'
import type { Area, Assignment, AssignmentBuilding, AssignmentHouseholdTargeting, LetterboxDistributionConfig, PosterLocation, PosterLocationStatus } from '../types/models'

const DEFAULT_CENTER: [number, number] = [51.1657, 10.4515]

const assignmentEditSchema = z.object({
  title: z.string().min(1, 'Titel ist erforderlich.'),
  description: z.string().optional(),
  boundaryAreaId: z.string().optional(),
  targetAreaId: z.string().optional(),
  teamId: z.string().optional(),
  status: z.enum(ASSIGNMENT_STATUSES),
  startsAt: z.string().optional(),
  dueAt: z.string().optional(),
  householdTargeting: z.enum(['all_households', 'selected_buildings']).optional(),
})

type AssignmentEditValues = z.infer<typeof assignmentEditSchema>

const firstValidationMessage = (details: unknown) => {
  if (!details || typeof details !== 'object') return null
  const errors = (details as { errors?: unknown }).errors
  if (!errors || typeof errors !== 'object') return null
  const firstMessages = Object.values(errors as Record<string, unknown>).flatMap((value) => Array.isArray(value) ? value : [value])
  const message = firstMessages.find((value): value is string => typeof value === 'string' && value.length > 0)
  return message ?? null
}

const requestErrorMessage = (error: unknown) => {
  if (!(error instanceof ApiError)) return permissionErrorMessage(error)
  if (error.status === 401) return 'Bitte erneut anmelden.'
  if (error.status === 403) return 'Keine Berechtigung für diese Aktion.'
  if (error.status === 404) return 'Auftrag nicht gefunden.'
  if (error.status === 422) return firstValidationMessage(error.details) ?? 'Bitte prüfen Sie die Formularfelder.'
  if (error.status >= 500) return 'Serverfehler beim Speichern des Auftrags.'
  return permissionErrorMessage(error)
}

const toDateTimeLocal = (value?: string | null) => value ? String(value).slice(0, 16) : ''
const toOptionalNumber = (value?: string) => value ? Number(value) : null
const boundaryAreaIdForTarget = (targetAreaOptions: ReturnType<typeof getAreaUsageOptions>, targetAreaId?: string) =>
  targetAreaOptions.find((option) => String(option.area.id) === targetAreaId)?.boundaryAreaId ?? null
const isLetterboxConfig = (config: Assignment['typeConfig'] | Assignment['type_config']): config is LetterboxDistributionConfig =>
  Boolean(config && 'householdTargeting' in config)
const normalizeHouseholdTargeting = (value: unknown): AssignmentHouseholdTargeting =>
  value === 'selected_buildings' ? 'selected_buildings' : 'all_households'
const areaBuildingId = (value: unknown) =>
  value && typeof value === 'object' && 'id' in value && typeof value.id === 'number' ? value.id : null
const assignmentBuildingAreaBuildingId = (assignmentBuilding: AssignmentBuilding) =>
  assignmentBuilding.area_building_id ?? assignmentBuilding.areaBuildingId ?? areaBuildingId(assignmentBuilding.area_building) ?? areaBuildingId(assignmentBuilding.areaBuilding)
const assignmentAreaBuildingIds = (assignment: Assignment) => {
  if (Array.isArray(assignment.area_building_ids)) return assignment.area_building_ids.filter((id): id is number => Number.isFinite(id))
  if (Array.isArray(assignment.area_buildings)) return assignment.area_buildings.flatMap((building) => typeof building.id === 'number' ? [building.id] : [])
  if (Array.isArray(assignment.assignment_buildings)) {
    return assignment.assignment_buildings.flatMap((entry) => {
      if ('area_building_id' in entry && Number.isFinite(entry.area_building_id)) return [entry.area_building_id as number]
      if ('areaBuildingId' in entry && Number.isFinite(entry.areaBuildingId)) return [entry.areaBuildingId as number]
      const nestedId = areaBuildingId('area_building' in entry ? entry.area_building : undefined)
      if (nestedId) return [nestedId]
      const directId = areaBuildingId(entry)
      if (directId) return [directId]
      return []
    })
  }
  return []
}

function PosterLocationMapClicks({ enabled, onAdd }: { enabled: boolean; onAdd: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (event) => {
      if (enabled) onAdd(Number(event.latlng.lat.toFixed(6)), Number(event.latlng.lng.toFixed(6)))
    },
  })
  return null
}

function GuidedPosterLocationEditor({
  assignmentId,
  targetArea,
  posterLocations,
  disabled,
  pending,
  error,
  onCreate,
  onUpdate,
  onDelete,
}: {
  assignmentId: number
  targetArea?: Area
  posterLocations: PosterLocation[]
  disabled: boolean
  pending: boolean
  error: unknown
  onCreate: (lat: number, lng: number) => void
  onUpdate: (posterLocationId: number, payload: Partial<PosterLocation>) => void
  onDelete: (posterLocationId: number) => void
}) {
  const targetGeometry = getGeometryFromAreaGeoJson(targetArea?.geojson)
  const targetPositions = useMemo(() => getAreaPositions(targetArea), [targetArea])
  const posterPositions = useMemo(() => posterLocations.map((posterLocation): [number, number] => [posterLocation.lat, posterLocation.lng]), [posterLocations])
  const fitPositions = targetPositions.length > 0 ? targetPositions : posterPositions
  const maskGeometry = useMemo(() => getAreaMaskGeometry([targetArea]), [targetArea])

  return (
    <div className="space-y-3 rounded border p-3">
      <div>
        <h2 className="font-medium">Plakatstandorte</h2>
        <p className="text-sm text-slate-600">
          {disabled ? 'Keine Berechtigung zum Bearbeiten der Standorte.' : 'Klick in die Karte legt einen geplanten Standort an. Marker können verschoben werden.'}
        </p>
      </div>

      <div className="aspect-square w-full overflow-hidden rounded border bg-white">
        <MapContainer center={DEFAULT_CENTER} zoom={6} maxBoundsViscosity={0.85} className="h-full w-full">
          <TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} />
          <MapLayerPanes />
          <MapMask geometry={maskGeometry} />
          {targetGeometry && <GeoJSON pane={MAP_PANES.target} data={targetGeometry as GeoJSON.GeoJsonObject} style={{ color: '#0f766e', fillColor: '#14b8a6', fillOpacity: 0.16, weight: 2 }} />}
          <PosterLocationMapClicks enabled={!disabled && !pending} onAdd={onCreate} />
          {posterLocations.map((posterLocation) => (
            <Marker
              key={posterLocation.id}
              pane={MAP_PANES.markers}
              position={[posterLocation.lat, posterLocation.lng]}
              icon={posterLocationIcon}
              draggable={!disabled && can(posterLocation.can?.update ?? true)}
              eventHandlers={{
                dragend: (event) => {
                  const latLng = event.target.getLatLng()
                  onUpdate(posterLocation.id, { lat: Number(latLng.lat.toFixed(6)), lng: Number(latLng.lng.toFixed(6)) })
                },
              }}
            >
              <Popup>
                <p className="font-medium">{posterLocation.label ?? `Standort #${posterLocation.id}`}</p>
                <p>Status: {posterLocation.status}</p>
                <p>{posterLocation.notes ?? '-'}</p>
              </Popup>
            </Marker>
          ))}
          {fitPositions.length > 0 && <MapViewportController fitPositions={fitPositions} constrainPositions={targetPositions.length > 0 ? targetPositions : fitPositions} />}
        </MapContainer>
      </div>

      {error ? <ErrorState message={requestErrorMessage(error)} /> : null}
      {posterLocations.length === 0 && <EmptyState message="Noch keine Plakatstandorte markiert." />}
      {posterLocations.length > 0 && (
        <div className="space-y-2">
          {posterLocations.map((posterLocation) => (
            <article key={posterLocation.id} className="rounded border bg-white p-3 text-sm">
              <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_160px]">
                <input
                  defaultValue={posterLocation.label ?? ''}
                  placeholder={`Standort #${posterLocation.id}`}
                  disabled={disabled || !can(posterLocation.can?.update ?? true)}
                  onBlur={(event) => onUpdate(posterLocation.id, { label: event.target.value.trim() || null })}
                />
                <select
                  defaultValue={posterLocation.status}
                  disabled={disabled || !can(posterLocation.can?.update ?? true)}
                  onChange={(event) => onUpdate(posterLocation.id, { status: event.target.value as PosterLocationStatus })}
                >
                  {POSTER_LOCATION_STATUSES.map((status) => <option key={status}>{status}</option>)}
                </select>
              </div>
              <textarea
                className="mt-2"
                rows={2}
                defaultValue={posterLocation.notes ?? ''}
                placeholder="Notizen"
                disabled={disabled || !can(posterLocation.can?.update ?? true)}
                onBlur={(event) => onUpdate(posterLocation.id, { notes: event.target.value.trim() || null })}
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-600">Koordinaten: {posterLocation.lat}, {posterLocation.lng}</p>
                <button
                  type="button"
                  className="border border-red-300 px-2 py-1 text-red-700 disabled:opacity-50"
                  disabled={disabled || !can(posterLocation.can?.delete ?? true)}
                  onClick={() => onDelete(posterLocation.id)}
                >
                  Standort entfernen
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-500">Auftrag #{assignmentId}</p>
    </div>
  )
}

export function AssignmentEditPage() {
  const { assignmentId } = useParams()
  const id = Number(assignmentId)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuth()
  const [areaBuildingIds, setAreaBuildingIds] = useState<number[]>([])

  const form = useForm<AssignmentEditValues>({
    resolver: zodResolver(assignmentEditSchema),
    defaultValues: {
      title: '',
      description: '',
      boundaryAreaId: '',
      targetAreaId: '',
      teamId: '',
      status: 'draft',
      startsAt: '',
      dueAt: '',
      householdTargeting: 'all_households',
    },
  })

  const assignmentQuery = useQuery({ queryKey: ['assignment', id], queryFn: () => getAssignment(id), enabled: Number.isFinite(id), retry: false })
  const assignment = assignmentQuery.data
  const assignmentTypeConfig = assignment?.typeConfig ?? assignment?.type_config
  const assignmentHouseholdTargeting = isLetterboxConfig(assignmentTypeConfig) ? normalizeHouseholdTargeting(assignmentTypeConfig.householdTargeting) : undefined
  const campaignId = assignment?.campaignId ?? assignment?.campaign_id
  const areasQuery = useQuery({ queryKey: ['campaign-areas', campaignId], queryFn: () => listCampaignAreas(campaignId!, { per_page: 100 }), enabled: Boolean(campaignId), retry: false })
  const teamsQuery = useQuery({ queryKey: ['campaign-teams', campaignId], queryFn: () => listCampaignTeams(campaignId!, { per_page: 100 }), enabled: Boolean(campaignId), retry: false })
  const assignmentBuildingsQuery = useQuery({
    queryKey: ['assignment-buildings', id],
    queryFn: () => listAssignmentBuildings(id),
    enabled: Boolean(Number.isFinite(id) && assignment?.type === 'letterbox_distribution' && assignmentHouseholdTargeting === 'selected_buildings'),
    retry: false,
  })
  const posterLocationsQuery = useQuery({
    queryKey: ['poster-locations', id],
    queryFn: () => listPosterLocations(id),
    enabled: Boolean(Number.isFinite(id) && assignment?.type === 'poster_guided'),
    retry: false,
  })
  const areas = useMemo(() => areasQuery.data?.data ?? [], [areasQuery.data?.data])
  const boundaryAreaOptions = useMemo(() => getAreaUsageOptions(areas, 'boundary'), [areas])
  const targetAreaOptions = useMemo(() => getAreaUsageOptions(areas, 'target'), [areas])
  const selectedTargetAreaId = form.watch('targetAreaId')
  const householdTargeting = form.watch('householdTargeting') as AssignmentHouseholdTargeting | undefined
  const selectedTarget = useMemo<Area | undefined>(() => targetAreaOptions.find((option) => String(option.area.id) === selectedTargetAreaId)?.area ?? assignment?.target_area ?? undefined, [assignment?.target_area, selectedTargetAreaId, targetAreaOptions])

  useEffect(() => {
    if (!assignment) return
    const targetAreaId = String(assignment.targetAreaId ?? assignment.target_area_id ?? '')
    const boundaryAreaId = assignment.boundaryAreaId ?? assignment.boundary_area_id ?? boundaryAreaIdForTarget(targetAreaOptions, targetAreaId)
    const typeConfig = assignment.typeConfig ?? assignment.type_config
    const linkedAreaBuildingIds = (assignmentBuildingsQuery.data ?? []).flatMap((assignmentBuilding) => {
      const id = assignmentBuildingAreaBuildingId(assignmentBuilding)
      return id ? [id] : []
    })
    form.reset({
      title: assignment.title,
      description: String(assignment.description ?? ''),
      boundaryAreaId: String(boundaryAreaId ?? ''),
      targetAreaId,
      teamId: String(assignment.team?.id ?? assignment.teamId ?? assignment.team_id ?? ''),
      status: assignment.status,
      startsAt: toDateTimeLocal(assignment.startsAt ?? assignment.starts_at),
      dueAt: toDateTimeLocal(assignment.dueAt ?? assignment.due_at),
      householdTargeting: isLetterboxConfig(typeConfig) ? normalizeHouseholdTargeting(typeConfig.householdTargeting) : 'all_households',
    })
    setAreaBuildingIds([...new Set([...assignmentAreaBuildingIds(assignment), ...linkedAreaBuildingIds])])
  }, [assignment, assignmentBuildingsQuery.data, form, targetAreaOptions])

  useEffect(() => {
    const targetAreaId = form.getValues('targetAreaId')
    if (!targetAreaId || form.getValues('boundaryAreaId')) return
    const boundaryAreaId = boundaryAreaIdForTarget(targetAreaOptions, targetAreaId)
    if (boundaryAreaId) form.setValue('boundaryAreaId', String(boundaryAreaId))
  }, [form, targetAreaOptions])

  useEffect(() => {
    if (householdTargeting !== 'selected_buildings' || areaBuildingIds.length > 0) form.clearErrors('householdTargeting')
  }, [areaBuildingIds.length, form, householdTargeting])

  const invalidateAssignment = () => {
    qc.invalidateQueries({ queryKey: ['assignment', id] })
    qc.invalidateQueries({ queryKey: ['assignment-buildings', id] })
    qc.invalidateQueries({ queryKey: ['poster-locations', id] })
    qc.invalidateQueries({ queryKey: ['assignments'] })
    qc.invalidateQueries({ queryKey: ['dashboard-campaign-assignments'] })
    if (campaignId) qc.invalidateQueries({ queryKey: ['campaign', campaignId] })
  }

  const updateMutation = useMutation({
    mutationFn: (values: AssignmentEditValues) => {
      const payload: Partial<Assignment> & Record<string, unknown> = {
        title: values.title,
        description: values.description || null,
        boundary_area_id: toOptionalNumber(values.boundaryAreaId),
        target_area_id: toOptionalNumber(values.targetAreaId),
        team_id: toOptionalNumber(values.teamId),
        status: values.status,
        starts_at: values.startsAt || null,
        due_at: values.dueAt || null,
      }
      const typeConfig = assignment?.typeConfig ?? assignment?.type_config
      if (assignment?.type === 'letterbox_distribution' && isLetterboxConfig(typeConfig)) {
        payload.type_config = { ...typeConfig, householdTargeting: values.householdTargeting ?? normalizeHouseholdTargeting(typeConfig.householdTargeting) }
        payload.area_building_ids = values.householdTargeting === 'selected_buildings' ? areaBuildingIds : []
      }
      return updateAssignment(id, payload)
    },
    onSuccess: () => {
      invalidateAssignment()
      navigate(`/assignments/${id}`)
    },
  })

  const createPosterLocationMutation = useMutation({
    mutationFn: ({ lat, lng }: { lat: number; lng: number }) => createPosterLocation(id, {
      lat,
      lng,
      status: 'planned',
      label: `Standort ${(posterLocationsQuery.data?.length ?? 0) + 1}`,
    }),
    onSuccess: invalidateAssignment,
  })
  const updatePosterLocationMutation = useMutation({
    mutationFn: ({ posterLocationId, payload }: { posterLocationId: number; payload: Partial<PosterLocation> }) => updatePosterLocation(posterLocationId, payload),
    onSuccess: invalidateAssignment,
  })
  const deletePosterLocationMutation = useMutation({
    mutationFn: (posterLocationId: number) => deletePosterLocation(posterLocationId),
    onSuccess: invalidateAssignment,
  })

  const targetAreaRegister = form.register('targetAreaId')
  const setTargetArea = (targetAreaId: string) => {
    const boundaryAreaId = boundaryAreaIdForTarget(targetAreaOptions, targetAreaId)
    form.setValue('targetAreaId', targetAreaId, { shouldDirty: true, shouldValidate: true })
    form.setValue('boundaryAreaId', boundaryAreaId ? String(boundaryAreaId) : '', { shouldDirty: true, shouldValidate: true })
    setAreaBuildingIds([])
  }

  const deleteMutation = useMutation({
    mutationFn: () => deleteAssignment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments'] })
      qc.invalidateQueries({ queryKey: ['dashboard-campaign-assignments'] })
      navigate('/assignments')
    },
  })

  if (!Number.isFinite(id)) return <ErrorState message="Auftrag nicht gefunden." />
  if (assignmentQuery.isLoading) return <LoadingState />
  if (assignmentQuery.isError) return <ErrorState message={requestErrorMessage(assignmentQuery.error)} />
  if (!assignment) return <EmptyState message="Auftrag nicht gefunden." />

  const canUpdate = can(assignment.can?.update)
  const canDelete = can(assignment.can?.delete)
  const canManagePosterLocations = canPermission(user?.can, PERMISSIONS.POSTER_LOCATIONS_MANAGE) && can(assignment.can?.manage_poster_locations ?? true)
  const teams = teamsQuery.data?.data ?? []
  const posterLocations = (posterLocationsQuery.data ?? assignment.posterLocations ?? []).slice().sort((a, b) => a.id - b.id)
  const posterLocationMutationError = createPosterLocationMutation.error ?? updatePosterLocationMutation.error ?? deletePosterLocationMutation.error

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-slate-500">Auftrag #{assignment.id}</p>
          <h1 className="text-2xl font-semibold">Auftrag bearbeiten</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="border px-3 py-2 text-sm" to={`/assignments/${assignment.id}`}>Detailansicht</Link>
          <Link className="border px-3 py-2 text-sm" to={campaignId ? `/campaigns/${campaignId}` : '/assignments'}>Zurück</Link>
        </div>
      </div>

      {!canUpdate && <ErrorState title="Bearbeiten nicht erlaubt" message={NO_PERMISSION_MESSAGE} />}
      {areasQuery.isError && <ErrorState message="Gebiete konnten nicht geladen werden." />}
      {teamsQuery.isError && <ErrorState message="Teams konnten nicht geladen werden." />}

      <form className="space-y-4 rounded border bg-white p-4" onSubmit={form.handleSubmit((values) => {
        if (assignment.type === 'letterbox_distribution' && values.householdTargeting === 'selected_buildings' && areaBuildingIds.length === 0) {
          form.setError('householdTargeting', { type: 'custom', message: 'Bitte mindestens ein Gebäude auswählen.' })
          return
        }
        updateMutation.mutate(values)
      })}>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm">Typ<input className="mt-1 bg-slate-100" value={assignmentTypeLabel[assignment.type]} disabled readOnly /></label>
          <label className="block text-sm">Status<select className="mt-1" {...form.register('status')} disabled={!can(assignment.can?.change_status)}>{ASSIGNMENT_STATUSES.map((status) => <option key={status} value={status}>{assignmentStatusLabel[status]}</option>)}</select></label>
        </div>

        <label className="block text-sm">Titel *<input className="mt-1" {...form.register('title')} disabled={!canUpdate} title={!canUpdate ? NO_PERMISSION_MESSAGE : undefined} /></label>
        {form.formState.errors.title?.message && <ErrorState message={form.formState.errors.title.message} />}

        <label className="block text-sm">Beschreibung<textarea className="mt-1" rows={4} {...form.register('description')} disabled={!canUpdate} /></label>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm">Begrenzungsgebiet<select className="mt-1" {...form.register('boundaryAreaId')} disabled={!canUpdate || areasQuery.isLoading}><option value="">Kein Begrenzungsgebiet</option>{boundaryAreaOptions.map(({ area }) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
          <label className="block text-sm">Zielgebiet<select className="mt-1" {...targetAreaRegister} disabled={!canUpdate || areasQuery.isLoading} onChange={(event) => { targetAreaRegister.onChange(event); setTargetArea(event.target.value) }}><option value="">Kein Zielgebiet</option>{targetAreaOptions.map(({ area }) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
        </div>

        {assignment.type === 'letterbox_distribution' && (
          <div className="space-y-3 rounded border p-3">
            <label className="block text-sm">Haushaltsauswahl<select className="mt-1" {...form.register('householdTargeting')} disabled={!canUpdate}>
              <option value="all_households">all_households</option>
              <option value="selected_buildings">selected_buildings</option>
            </select></label>
            {form.formState.errors.householdTargeting?.message && <ErrorState message={form.formState.errors.householdTargeting.message} />}
            {selectedTarget && <AssignmentBuildingSelector targetArea={selectedTarget} householdTargeting={householdTargeting} selectedIds={areaBuildingIds} onSelectedIdsChange={setAreaBuildingIds} disabled={!canUpdate} />}
          </div>
        )}

        {assignment.type === 'poster_guided' && (
          <GuidedPosterLocationEditor
            assignmentId={assignment.id}
            targetArea={selectedTarget}
            posterLocations={posterLocations}
            disabled={!canUpdate || !canManagePosterLocations}
            pending={createPosterLocationMutation.isPending || updatePosterLocationMutation.isPending || deletePosterLocationMutation.isPending}
            error={posterLocationMutationError}
            onCreate={(lat, lng) => createPosterLocationMutation.mutate({ lat, lng })}
            onUpdate={(posterLocationId, payload) => updatePosterLocationMutation.mutate({ posterLocationId, payload })}
            onDelete={(posterLocationId) => deletePosterLocationMutation.mutate(posterLocationId)}
          />
        )}

        <div className="grid gap-3 md:grid-cols-3">
          <label className="block text-sm">Team<select className="mt-1" {...form.register('teamId')} disabled={!can(assignment.can?.assign_team) || teamsQuery.isLoading}><option value="">Kein Team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
          <label className="block text-sm">Start<input className="mt-1" type="datetime-local" {...form.register('startsAt')} disabled={!canUpdate} /></label>
          <label className="block text-sm">Fällig<input className="mt-1" type="datetime-local" {...form.register('dueAt')} disabled={!canUpdate} /></label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="bg-slate-900 px-3 py-2 text-white disabled:opacity-50" type="submit" disabled={!canUpdate || updateMutation.isPending}>Speichern</button>
          <button type="button" className="border px-3 py-2 disabled:opacity-50" onClick={() => navigate(`/assignments/${assignment.id}`)}>Abbrechen</button>
          <button type="button" className="bg-red-600 px-3 py-2 text-white disabled:opacity-50" disabled={!canDelete || deleteMutation.isPending} title={!canDelete ? NO_PERMISSION_MESSAGE : undefined} onClick={() => window.confirm('Auftrag löschen?') && deleteMutation.mutate()}>Löschen</button>
        </div>
      </form>

      {updateMutation.isError && <ErrorState message={requestErrorMessage(updateMutation.error)} />}
      {deleteMutation.isError && <ErrorState message={requestErrorMessage(deleteMutation.error)} />}
    </section>
  )
}
