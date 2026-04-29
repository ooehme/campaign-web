import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { deleteTask, getTask, getTaskEventsByPage, listCampaignAreas, listCampaignTeams, updateTask } from '../api/endpoints'
import { ApiError } from '../api/client'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import { TASK_STATUSES } from '../utils/constants'
import { can, NO_PERMISSION_MESSAGE, permissionErrorMessage } from '../utils/permissions'

const optionalCoordinateSchema = z.preprocess((value) => (value === '' || value == null ? undefined : value), z.coerce.number()).optional()
const taskSchema = z.object({
  title: z.string().min(1), description: z.string().optional(), status: z.enum(['open', 'assigned', 'in_progress', 'done', 'cancelled']), priority: z.coerce.number().min(1).max(5),
  latitude: optionalCoordinateSchema.refine((value) => value == null || (value >= -90 && value <= 90), 'Latitude must be between -90 and 90'),
  longitude: optionalCoordinateSchema.refine((value) => value == null || (value >= -180 && value <= 180), 'Longitude must be between -180 and 180'),
  boundary_area_id: z.coerce.number().optional(), area_id: z.coerce.number().optional(), assigned_team_id: z.coerce.number().optional(), due_at: z.string().optional(), payload_json: z.string().optional(),
})
type TaskFormValues = z.infer<typeof taskSchema>

export function TaskDetailPage() {
  const { taskId } = useParams(); const id = Number(taskId); const navigate = useNavigate(); const qc = useQueryClient(); const [eventsPage, setEventsPage] = useState(1)
  const form = useForm<TaskFormValues>({ resolver: zodResolver(taskSchema), defaultValues: { title: '', description: '', status: 'open', priority: 3, payload_json: '' } })
  const taskQuery = useQuery({ queryKey: ['task', id], queryFn: () => getTask(id), enabled: Number.isFinite(id) })
  const areasQuery = useQuery({ queryKey: ['campaign-areas', taskQuery.data?.campaign_id], queryFn: () => listCampaignAreas(taskQuery.data!.campaign_id, { per_page: 100 }), enabled: !!taskQuery.data?.campaign_id })
  const teamsQuery = useQuery({ queryKey: ['campaign-teams', taskQuery.data?.campaign_id], queryFn: () => listCampaignTeams(taskQuery.data!.campaign_id, { per_page: 100 }), enabled: !!taskQuery.data?.campaign_id })
  const eventsQuery = useQuery({ queryKey: ['task-events', id, eventsPage], queryFn: () => getTaskEventsByPage(id, { page: eventsPage, per_page: 100 }), enabled: Number.isFinite(id) })

  useEffect(() => { if (!taskQuery.data) return; form.reset({ title: taskQuery.data.title, description: String(taskQuery.data.description ?? ''), status: taskQuery.data.status, priority: taskQuery.data.priority, latitude: taskQuery.data.latitude ?? undefined, longitude: taskQuery.data.longitude ?? undefined, boundary_area_id: taskQuery.data.boundary_area?.id ?? taskQuery.data.boundary_area_id ?? undefined, area_id: taskQuery.data.area?.id ?? taskQuery.data.target_area?.id ?? taskQuery.data.area_id ?? undefined, assigned_team_id: taskQuery.data.assigned_team?.id, due_at: taskQuery.data.due_at ? String(taskQuery.data.due_at).slice(0, 16) : '', payload_json: taskQuery.data.payload ? JSON.stringify(taskQuery.data.payload, null, 2) : '' }) }, [taskQuery.data?.id])

  const updateMutation = useMutation({ mutationFn: (values: TaskFormValues) => { const payload = values.payload_json?.trim() ? JSON.parse(values.payload_json) : undefined; const { payload_json, ...rest } = values; return updateTask(id, { ...rest, payload }) }, onSuccess: () => { qc.invalidateQueries({ queryKey: ['task', id] }); qc.invalidateQueries({ queryKey: ['tasks', taskQuery.data?.campaign_id] }); qc.invalidateQueries({ queryKey: ['task-events', id] }); eventsQuery.refetch() } })
  const deleteMutation = useMutation({ mutationFn: () => deleteTask(id), onSuccess: () => navigate('/campaigns') })

  if (!Number.isFinite(id)) return <ErrorState message="Invalid task id in URL." />
  if (taskQuery.isLoading) return <LoadingState />
  if (taskQuery.isError) return <ErrorState message={(taskQuery.error as Error).message} />
  if (!taskQuery.data) return <EmptyState message="Task not found (404)." />

  const task = taskQuery.data
  const campaignAreas = areasQuery.data?.data ?? []
  const boundaryAreas = campaignAreas.filter((a) => a.pivot?.usage === 'boundary')
  const targetAreas = campaignAreas.filter((a) => a.pivot?.usage === 'target')
  const selectedBoundary = form.watch('boundary_area_id')
  const filteredTargets = selectedBoundary ? targetAreas.filter((a) => !a.pivot?.boundary_area_id || a.pivot?.boundary_area_id === Number(selectedBoundary)) : targetAreas
  const selectedTargetId = form.watch('area_id')
  const selectedTargetArea = targetAreas.find((a) => a.id === Number(selectedTargetId))
  const editDisabled = !can(task.can?.update)
  const selectedMismatch = selectedBoundary && selectedTargetArea?.pivot?.boundary_area_id && Number(selectedBoundary) !== selectedTargetArea.pivot.boundary_area_id
  const updateErrorMessage = (() => {
    if (!(updateMutation.error instanceof ApiError)) return permissionErrorMessage(updateMutation.error)
    if (updateMutation.error.status !== 422) return permissionErrorMessage(updateMutation.error)
    const msg = updateMutation.error.message.toLowerCase()
    if (msg.includes('target') && msg.includes('campaign')) return 'Das gewählte Zielgebiet ist dieser Kampagne nicht zugewiesen.'
    if (msg.includes('boundary') && msg.includes('campaign')) return 'Die gewählte Begrenzung ist dieser Kampagne nicht zugewiesen.'
    if (msg.includes('target') && msg.includes('boundary')) return 'Das gewählte Zielgebiet gehört nicht zur ausgewählten Begrenzung.'
    if (msg.includes('usage')) return 'Ungültige Flächennutzung für diese Zuweisung.'
    return updateMutation.error.message
  })()
  return <section className="space-y-4"><div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Task #{task.id}: {task.title}</h1><Link className="text-blue-600" to={`/campaigns/${task.campaign_id}`}>Back to campaign</Link></div>
    <div className="rounded border bg-white p-4"><h2 className="mb-3 font-medium">Task overview</h2><p>Status: {task.status} · Priority: {task.priority}</p><p>Begrenzung: {task.boundary_area?.name ?? 'Keine Begrenzung zugewiesen.'}</p><p>Zielgebiet: {(task.target_area?.name ?? task.area?.name) ?? 'Kein Zielgebiet zugewiesen.'}</p></div>
    <div className="rounded border bg-white p-4"><h2 className="mb-2 font-medium">Edit task form</h2><form className="space-y-2" onSubmit={form.handleSubmit((values) => updateMutation.mutate(values))}><input {...form.register('title')}  disabled={editDisabled} title={editDisabled ? NO_PERMISSION_MESSAGE : undefined} /><textarea rows={3} {...form.register('description')}  disabled={editDisabled} title={editDisabled ? NO_PERMISSION_MESSAGE : undefined} />
      <div className="grid grid-cols-2 gap-2"><select {...form.register('status')} disabled={!can(task.can?.change_status)} title={!can(task.can?.change_status) ? NO_PERMISSION_MESSAGE : undefined}>{TASK_STATUSES.map((s) => <option key={s}>{s}</option>)}</select><input type="number" min={1} max={5} {...form.register('priority')}  disabled={editDisabled} title={editDisabled ? NO_PERMISSION_MESSAGE : undefined} /></div>
      <p className='text-xs text-slate-500'>Zielgebiete können optional einer Begrenzung zugeordnet sein.</p><div className="grid grid-cols-3 gap-2"><select {...form.register('boundary_area_id')} disabled={editDisabled}><option value="">Begrenzung auswählen</option>{boundaryAreas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select><select {...form.register('area_id', { onChange: (e) => { const selected = targetAreas.find((a) => a.id === Number(e.target.value)); if (selected?.pivot?.boundary_area_id && !form.getValues('boundary_area_id')) form.setValue('boundary_area_id', selected.pivot.boundary_area_id) } })} disabled={editDisabled}><option value="">Zielgebiet auswählen</option>{filteredTargets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select><select {...form.register('assigned_team_id')} disabled={editDisabled || !can(task.can?.assign_team)} title={!can(task.can?.assign_team) ? NO_PERMISSION_MESSAGE : undefined}><option value="">Assigned team</option>{(teamsQuery.data?.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
      {selectedMismatch && <ErrorState message="Die ausgewählte Kombination aus Begrenzung und Zielgebiet ist nicht konsistent." />}
      <div className="grid grid-cols-2 gap-2"><input type="number" step="any" placeholder="Latitude" {...form.register('latitude')}  disabled={editDisabled} title={editDisabled ? NO_PERMISSION_MESSAGE : undefined} /><input type="number" step="any" placeholder="Longitude" {...form.register('longitude')}  disabled={editDisabled} title={editDisabled ? NO_PERMISSION_MESSAGE : undefined} /></div>
      <input type="datetime-local" {...form.register('due_at')}  disabled={editDisabled} title={editDisabled ? NO_PERMISSION_MESSAGE : undefined} />
      <textarea rows={6} placeholder="Payload JSON" {...form.register('payload_json')}  disabled={editDisabled} title={editDisabled ? NO_PERMISSION_MESSAGE : undefined} />
      <div className="flex gap-2"><button className="bg-slate-900 text-white disabled:opacity-50" disabled={!can(task.can?.update)} title={!can(task.can?.update) ? NO_PERMISSION_MESSAGE : undefined} type="submit">Save</button><button className="bg-red-600 text-white disabled:opacity-50" disabled={!can(task.can?.delete)} title={!can(task.can?.delete) ? NO_PERMISSION_MESSAGE : undefined} type="button" onClick={() => deleteMutation.mutate()}>Delete</button></div>
    </form>{updateMutation.isError && <ErrorState message={updateErrorMessage} />}{deleteMutation.isError && <ErrorState message={permissionErrorMessage(deleteMutation.error)} />}</div>
    <div className="rounded border bg-white p-4"><h2 className="font-medium">Events</h2>{eventsQuery.data?.data.map((event) => <div key={event.id}><p>{event.event_type}</p></div>)}<div className="mt-2 flex gap-2"><button type="button" className="border px-2" onClick={() => setEventsPage((p) => Math.max(1, p - 1))}>Previous</button><button type="button" className="border px-2" onClick={() => setEventsPage((p) => p + 1)}>Next</button></div></div>
  </section>
}
