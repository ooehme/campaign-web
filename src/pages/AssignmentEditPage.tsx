import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { ApiError } from '../api/client'
import { deleteAssignment, getAssignment, listCampaignAreas, listCampaignTeams, updateAssignment } from '../api/endpoints'
import { AssignmentBuildingSelector } from '../components/AssignmentBuildingSelector'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import { ASSIGNMENT_STATUSES } from '../utils/constants'
import { assignmentStatusLabel, assignmentTypeLabel } from '../utils/assignment'
import { getAreaUsageOptions } from '../utils/campaignAreaMap'
import { can, NO_PERMISSION_MESSAGE, permissionErrorMessage } from '../utils/permissions'
import type { Area, Assignment, AssignmentHouseholdTargeting, LetterboxDistributionConfig } from '../types/models'

const assignmentEditSchema = z.object({
  title: z.string().min(1, 'Titel ist erforderlich.'),
  description: z.string().optional(),
  boundaryAreaId: z.string().optional(),
  targetAreaId: z.string().optional(),
  teamId: z.string().optional(),
  status: z.enum(ASSIGNMENT_STATUSES),
  startsAt: z.string().optional(),
  dueAt: z.string().optional(),
  householdTargeting: z.enum(['all_households', 'selected_buildings', 'commercial_only', 'residential_only']).optional(),
})

type AssignmentEditValues = z.infer<typeof assignmentEditSchema>

const requestErrorMessage = (error: unknown) => {
  if (!(error instanceof ApiError)) return permissionErrorMessage(error)
  if (error.status === 401) return 'Bitte erneut anmelden.'
  if (error.status === 403) return 'Keine Berechtigung für diese Aktion.'
  if (error.status === 404) return 'Auftrag nicht gefunden.'
  if (error.status === 422) return 'Bitte prüfen Sie die Formularfelder.'
  if (error.status >= 500) return 'Serverfehler beim Speichern des Auftrags.'
  return permissionErrorMessage(error)
}

const toDateTimeLocal = (value?: string | null) => value ? String(value).slice(0, 16) : ''
const toOptionalNumber = (value?: string) => value ? Number(value) : null
const boundaryAreaIdForTarget = (targetAreaOptions: ReturnType<typeof getAreaUsageOptions>, targetAreaId?: string) =>
  targetAreaOptions.find((option) => String(option.area.id) === targetAreaId)?.boundaryAreaId ?? null
const isLetterboxConfig = (config: Assignment['typeConfig'] | Assignment['type_config']): config is LetterboxDistributionConfig =>
  Boolean(config && 'householdTargeting' in config)
const assignmentAreaBuildingIds = (assignment: Assignment) => {
  if (Array.isArray(assignment.area_building_ids)) return assignment.area_building_ids.filter((id): id is number => Number.isFinite(id))
  if (Array.isArray(assignment.area_buildings)) return assignment.area_buildings.flatMap((building) => typeof building.id === 'number' ? [building.id] : [])
  if (Array.isArray(assignment.assignment_buildings)) {
    return assignment.assignment_buildings.flatMap((entry) => {
      if ('area_building_id' in entry && Number.isFinite(entry.area_building_id)) return [entry.area_building_id as number]
      if ('areaBuildingId' in entry && Number.isFinite(entry.areaBuildingId)) return [entry.areaBuildingId as number]
      if ('area_building' in entry && typeof entry.area_building?.id === 'number') return [entry.area_building.id]
      return []
    })
  }
  return []
}

export function AssignmentEditPage() {
  const { assignmentId } = useParams()
  const id = Number(assignmentId)
  const navigate = useNavigate()
  const qc = useQueryClient()
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
  const campaignId = assignment?.campaignId ?? assignment?.campaign_id
  const areasQuery = useQuery({ queryKey: ['campaign-areas', campaignId], queryFn: () => listCampaignAreas(campaignId!, { per_page: 100 }), enabled: Boolean(campaignId), retry: false })
  const teamsQuery = useQuery({ queryKey: ['campaign-teams', campaignId], queryFn: () => listCampaignTeams(campaignId!, { per_page: 100 }), enabled: Boolean(campaignId), retry: false })
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
    form.reset({
      title: assignment.title,
      description: String(assignment.description ?? ''),
      boundaryAreaId: String(boundaryAreaId ?? ''),
      targetAreaId,
      teamId: String(assignment.team?.id ?? assignment.teamId ?? assignment.team_id ?? ''),
      status: assignment.status,
      startsAt: toDateTimeLocal(assignment.startsAt ?? assignment.starts_at),
      dueAt: toDateTimeLocal(assignment.dueAt ?? assignment.due_at),
      householdTargeting: isLetterboxConfig(typeConfig) ? typeConfig.householdTargeting : 'all_households',
    })
    setAreaBuildingIds(assignmentAreaBuildingIds(assignment))
  }, [assignment, form, targetAreaOptions])

  useEffect(() => {
    const targetAreaId = form.getValues('targetAreaId')
    if (!targetAreaId || form.getValues('boundaryAreaId')) return
    const boundaryAreaId = boundaryAreaIdForTarget(targetAreaOptions, targetAreaId)
    if (boundaryAreaId) form.setValue('boundaryAreaId', String(boundaryAreaId))
  }, [form, targetAreaOptions])

  const invalidateAssignment = () => {
    qc.invalidateQueries({ queryKey: ['assignment', id] })
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
        payload.type_config = { ...typeConfig, householdTargeting: values.householdTargeting ?? typeConfig.householdTargeting }
        if (values.householdTargeting === 'selected_buildings') payload.area_building_ids = areaBuildingIds
      }
      return updateAssignment(id, payload)
    },
    onSuccess: () => {
      invalidateAssignment()
      navigate(`/assignments/${id}`)
    },
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
  const teams = teamsQuery.data?.data ?? []

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

      <form className="space-y-4 rounded border bg-white p-4" onSubmit={form.handleSubmit((values) => updateMutation.mutate(values))}>
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
              <option value="commercial_only">commercial_only</option>
              <option value="residential_only">residential_only</option>
            </select></label>
            {selectedTarget && <AssignmentBuildingSelector targetArea={selectedTarget} householdTargeting={householdTargeting} selectedIds={areaBuildingIds} onSelectedIdsChange={setAreaBuildingIds} disabled={!canUpdate} />}
          </div>
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
