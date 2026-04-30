import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { ApiError } from '../api/client'
import { createTask, getCampaign, listCampaignAreas, listCampaignTeams } from '../api/endpoints'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import { TASK_STATUSES } from '../utils/constants'
import { can, NO_PERMISSION_MESSAGE } from '../utils/permissions'

const formSchema = z.object({
  title: z.string().min(1, 'Titel ist erforderlich.'),
  type: z.string().optional(),
  description: z.string().optional(),
  briefing: z.string().optional(),
  status: z.enum(['open', 'assigned', 'in_progress', 'done', 'cancelled']),
  priority: z.coerce.number().min(1).max(5),
  boundary_area_id: z.string().optional(),
  area_id: z.string().optional(),
  assigned_team_id: z.string().optional(),
  payload_json: z.string().optional(),
  due_at: z.string().optional(),
  completed_at: z.string().optional(),
})
type FormValues = z.infer<typeof formSchema>

const errorFieldMap: Record<string, keyof FormValues> = {
  title: 'title',
  type: 'type',
  description: 'description',
  briefing: 'briefing',
  status: 'status',
  priority: 'priority',
  boundary_area_id: 'boundary_area_id',
  area_id: 'area_id',
  assigned_team_id: 'assigned_team_id',
  payload: 'payload_json',
  due_at: 'due_at',
  completed_at: 'completed_at',
}

const parseJsonInput = (value?: string) => {
  if (!value?.trim()) return undefined
  try { return JSON.parse(value) } catch { throw new Error('Payload muss valides JSON sein.') }
}

export function TaskCreatePage() {
  const { campaignId } = useParams()
  const id = Number(campaignId)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [topError, setTopError] = useState<string | null>(null)
  const [redirectToLogin, setRedirectToLogin] = useState(false)

  const campaignQuery = useQuery({ queryKey: ['campaign', id], queryFn: () => getCampaign(id), enabled: Number.isFinite(id), retry: false })
  const areasQuery = useQuery({ queryKey: ['campaign-areas', id], queryFn: () => listCampaignAreas(id, { per_page: 100 }), enabled: Number.isFinite(id), retry: false })
  const teamsQuery = useQuery({ queryKey: ['campaign-teams', id], queryFn: () => listCampaignTeams(id, { per_page: 100 }), enabled: Number.isFinite(id), retry: false })

  useEffect(() => {
    if (redirectToLogin) navigate('/login')
  }, [navigate, redirectToLogin])

  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { title: '', type: '', description: '', briefing: '', status: 'open', priority: 3, payload_json: '', due_at: '', completed_at: '' } })
  const selectedAreaId = form.watch('area_id')
  const selectedBoundaryId = form.watch('boundary_area_id')
  const campaignAreas = areasQuery.data?.data ?? []
  const boundaryAreas = campaignAreas.filter((a) => a.pivot?.usage === 'boundary')
  const targetAreas = campaignAreas.filter((a) => a.pivot?.usage === 'target')
  const selectedTarget = targetAreas.find((a) => String(a.id) === selectedAreaId)
  const boundaryConflict = useMemo(() => {
    if (!selectedAreaId || !selectedBoundaryId || !selectedTarget?.pivot?.boundary_area_id) return false
    return String(selectedTarget.pivot.boundary_area_id) !== selectedBoundaryId
  }, [selectedAreaId, selectedBoundaryId, selectedTarget])

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = parseJsonInput(values.payload_json)
      const requestPayload = {
        title: values.title,
        type: values.type || undefined,
        description: values.description || undefined,
        briefing: values.briefing || undefined,
        status: values.status,
        priority: values.priority,
        boundary_area_id: values.boundary_area_id ? Number(values.boundary_area_id) : undefined,
        area_id: values.area_id ? Number(values.area_id) : undefined,
        assigned_team_id: values.assigned_team_id ? Number(values.assigned_team_id) : undefined,
        payload,
        due_at: values.due_at || null,
        completed_at: values.completed_at || null,
      }
      return createTask(id, requestPayload)
    },
    onSuccess: (task) => {
      qc.invalidateQueries({ queryKey: ['tasks', id] })
      qc.invalidateQueries({ queryKey: ['campaign', id] })
      navigate(task?.id ? `/tasks/${task.id}` : `/campaigns/${id}`)
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) {
        setTopError('Unbekannter Fehler beim Speichern.')
        return
      }
      if (error.status === 401) setRedirectToLogin(true)
      else if (error.status === 403) setTopError('Keine Berechtigung für diese Aktion.')
      else if (error.status === 404) setTopError('Auftrag oder Kampagne nicht gefunden.')
      else if (error.status === 422) {
        setTopError('Bitte prüfen Sie die markierten Felder.')
        const issues = (error.details as { errors?: Record<string, string[] | string> } | undefined)?.errors ?? {}
        for (const [key, value] of Object.entries(issues)) {
          const formKey = errorFieldMap[key]
          if (!formKey) continue
          form.setError(formKey, { message: Array.isArray(value) ? value[0] : value })
        }
      } else if (error.status >= 500) setTopError('Serverfehler beim Speichern des Auftrags.')
      else setTopError(error.message)
    },
  })

  if (!Number.isFinite(id)) return <ErrorState message="Auftrag oder Kampagne nicht gefunden." />
  if (campaignQuery.isLoading) return <LoadingState />
  if (campaignQuery.isError) {
    const status = campaignQuery.error instanceof ApiError ? campaignQuery.error.status : 0
    if (status === 401) setRedirectToLogin(true)
    if (status === 403) return <ErrorState message="Keine Berechtigung für diese Aktion." />
    if (status === 404) return <ErrorState message="Auftrag oder Kampagne nicht gefunden." />
    return <ErrorState message="Kampagne konnte nicht geladen werden." />
  }
  const campaign = campaignQuery.data
  if (!campaign) return <ErrorState message="Auftrag oder Kampagne nicht gefunden." />

  return <section className="space-y-4">
    <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Auftrag erstellen</h1><Link className="text-blue-600" to={`/campaigns/${id}`}>Zur Kampagne</Link></div>
    {!can(campaign.can?.create_task) && <ErrorState message="Keine Berechtigung für diese Aktion." />}
    {topError && <ErrorState message={topError} />}
    {areasQuery.isError && <ErrorState message="Auftrag oder Kampagne nicht gefunden." />}
    {teamsQuery.isError && <ErrorState message="Auftrag oder Kampagne nicht gefunden." />}
    {!areasQuery.isLoading && !teamsQuery.isLoading && campaignAreas.length === 0 && <EmptyState message="Keine Flächen für diese Kampagne zugewiesen." />}
    <form className="space-y-2 rounded border bg-white p-4" onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}>
      <input placeholder="Titel *" {...form.register('title')} disabled={!can(campaign.can?.create_task)} title={!can(campaign.can?.create_task) ? NO_PERMISSION_MESSAGE : undefined} />
      {form.formState.errors.title?.message && <ErrorState message={form.formState.errors.title.message} />}
      <input placeholder="Typ" {...form.register('type')} disabled={!can(campaign.can?.create_task)} />
      <textarea rows={3} placeholder="Beschreibung" {...form.register('description')} disabled={!can(campaign.can?.create_task)} />
      <label className="block text-sm">Briefing</label>
      <textarea rows={4} placeholder="Konkrete Arbeitsanweisungen für diesen Auftrag." {...form.register('briefing')} disabled={!can(campaign.can?.create_task)} />
      <p className="text-xs text-slate-600">Konkrete Arbeitsanweisungen für diesen Auftrag.</p>
      <div className="grid grid-cols-2 gap-2"><select {...form.register('status')} disabled={!can(campaign.can?.create_task)}>{TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}</select><input type="number" min={1} max={5} {...form.register('priority')} disabled={!can(campaign.can?.create_task)} /></div>
      <div className="grid grid-cols-3 gap-2"><select {...form.register('boundary_area_id')} disabled={!can(campaign.can?.create_task)}><option value="">Begrenzung</option>{boundaryAreas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select><select {...form.register('area_id')} disabled={!can(campaign.can?.create_task)} onChange={(e) => { form.setValue('area_id', e.target.value); const autoBoundary = targetAreas.find((a) => String(a.id) === e.target.value)?.pivot?.boundary_area_id; if (autoBoundary && !form.getValues('boundary_area_id')) form.setValue('boundary_area_id', String(autoBoundary)) }}><option value="">Zielgebiet</option>{targetAreas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select><select {...form.register('assigned_team_id')} disabled={!can(campaign.can?.create_task)}><option value="">Team</option>{(teamsQuery.data?.data ?? []).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></div>
      {boundaryConflict && <p className="text-sm text-amber-700">Das Zielgebiet gehört nicht zur ausgewählten Begrenzung.</p>}
      <input type="datetime-local" {...form.register('due_at')} disabled={!can(campaign.can?.create_task)} />
      <input type="datetime-local" {...form.register('completed_at')} disabled={!can(campaign.can?.create_task)} />
      <textarea rows={6} placeholder="Payload JSON" {...form.register('payload_json')} disabled={!can(campaign.can?.create_task)} />
      {form.formState.errors.payload_json?.message && <ErrorState message={form.formState.errors.payload_json.message} />}
      <button className="bg-slate-900 px-3 py-1 text-white disabled:opacity-50" type="submit" disabled={!can(campaign.can?.create_task)}>Auftrag erstellen</button>
    </form>
  </section>
}
