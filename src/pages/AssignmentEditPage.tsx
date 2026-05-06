import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { ApiError } from '../api/client'
import { deleteAssignment, getAssignment, listCampaignAreas, listCampaignTeams, updateAssignment } from '../api/endpoints'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import { ASSIGNMENT_STATUSES } from '../utils/constants'
import { assignmentStatusLabel, assignmentTypeLabel } from '../utils/assignment'
import { getAreaUsageOptions } from '../utils/campaignAreaMap'
import { can, NO_PERMISSION_MESSAGE, permissionErrorMessage } from '../utils/permissions'
import type { Assignment } from '../types/models'

const assignmentEditSchema = z.object({
  title: z.string().min(1, 'Titel ist erforderlich.'),
  description: z.string().optional(),
  boundaryAreaId: z.string().optional(),
  targetAreaId: z.string().optional(),
  teamId: z.string().optional(),
  status: z.enum(ASSIGNMENT_STATUSES),
  startsAt: z.string().optional(),
  dueAt: z.string().optional(),
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

export function AssignmentEditPage() {
  const { assignmentId } = useParams()
  const id = Number(assignmentId)
  const navigate = useNavigate()
  const qc = useQueryClient()

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
    },
  })

  const assignmentQuery = useQuery({ queryKey: ['assignment', id], queryFn: () => getAssignment(id), enabled: Number.isFinite(id), retry: false })
  const assignment = assignmentQuery.data
  const campaignId = assignment?.campaignId ?? assignment?.campaign_id
  const areasQuery = useQuery({ queryKey: ['campaign-areas', campaignId], queryFn: () => listCampaignAreas(campaignId!, { per_page: 100 }), enabled: Boolean(campaignId), retry: false })
  const teamsQuery = useQuery({ queryKey: ['campaign-teams', campaignId], queryFn: () => listCampaignTeams(campaignId!, { per_page: 100 }), enabled: Boolean(campaignId), retry: false })

  useEffect(() => {
    if (!assignment) return
    form.reset({
      title: assignment.title,
      description: String(assignment.description ?? ''),
      boundaryAreaId: String(assignment.boundaryAreaId ?? assignment.boundary_area_id ?? ''),
      targetAreaId: String(assignment.targetAreaId ?? assignment.target_area_id ?? ''),
      teamId: String(assignment.team?.id ?? assignment.teamId ?? assignment.team_id ?? ''),
      status: assignment.status,
      startsAt: toDateTimeLocal(assignment.startsAt ?? assignment.starts_at),
      dueAt: toDateTimeLocal(assignment.dueAt ?? assignment.due_at),
    })
  }, [assignment, form])

  const invalidateAssignment = () => {
    qc.invalidateQueries({ queryKey: ['assignment', id] })
    qc.invalidateQueries({ queryKey: ['assignments'] })
    qc.invalidateQueries({ queryKey: ['dashboard-campaign-assignments'] })
    if (campaignId) qc.invalidateQueries({ queryKey: ['campaign', campaignId] })
  }

  const updateMutation = useMutation({
    mutationFn: (values: AssignmentEditValues) => updateAssignment(id, {
      title: values.title,
      description: values.description || null,
      boundary_area_id: toOptionalNumber(values.boundaryAreaId),
      target_area_id: toOptionalNumber(values.targetAreaId),
      team_id: toOptionalNumber(values.teamId),
      status: values.status,
      starts_at: values.startsAt || null,
      due_at: values.dueAt || null,
    } as Partial<Assignment> & Record<string, unknown>),
    onSuccess: () => {
      invalidateAssignment()
      navigate(`/assignments/${id}`)
    },
  })

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
  const areas = areasQuery.data?.data ?? []
  const boundaryAreaOptions = getAreaUsageOptions(areas, 'boundary')
  const targetAreaOptions = getAreaUsageOptions(areas, 'target')
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
          <label className="block text-sm">Zielgebiet<select className="mt-1" {...form.register('targetAreaId')} disabled={!canUpdate || areasQuery.isLoading} onChange={(event) => { form.setValue('targetAreaId', event.target.value); const boundaryAreaId = targetAreaOptions.find((option) => String(option.area.id) === event.target.value)?.boundaryAreaId; if (boundaryAreaId) form.setValue('boundaryAreaId', String(boundaryAreaId)) }}><option value="">Kein Zielgebiet</option>{targetAreaOptions.map(({ area }) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
        </div>

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
