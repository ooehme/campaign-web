import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { z } from 'zod'
import {
  createTaskPoint,
  deleteTask,
  deleteTaskPoint,
  getTask,
  getTaskEventsByPage,
  listCampaignAreas,
  listCampaignTeams,
  listTaskPoints,
  updateTask,
  updateTaskPoint,
} from '../api/endpoints'
import { ApiError } from '../api/client'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import { MAP_ATTRIBUTION, MAP_TILE_URL, TASK_STATUSES } from '../utils/constants'
import { can, canPermission, NO_PERMISSION_MESSAGE, permissionErrorMessage } from '../utils/permissions'
import { getGeometryFromPayload } from '../utils/geojson'
import { GeoJSON, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { Area, TaskPoint } from '../types/models'

const DEFAULT_CENTER: [number, number] = [51.1657, 10.4515]

const taskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  briefing: z.string().optional(),
  status: z.enum(['open', 'assigned', 'in_progress', 'done', 'cancelled']),
  priority: z.coerce.number().min(1).max(5),
  boundary_area_id: z.coerce.number().optional(),
  area_id: z.coerce.number().optional(),
  assigned_team_id: z.coerce.number().optional(),
  due_at: z.string().optional(),
  payload_json: z.string().optional(),
})

const pointSchema = z.object({
  id: z.number().optional(),
  label: z.string().max(255).optional().nullable(),
  description: z.string().optional().nullable(),
  latitude: z.coerce.number().min(-90, 'Breitengrad muss zwischen -90 und 90 liegen.').max(90, 'Breitengrad muss zwischen -90 und 90 liegen.'),
  longitude: z.coerce.number().min(-180, 'Längengrad muss zwischen -180 und 180 liegen.').max(180, 'Längengrad muss zwischen -180 und 180 liegen.'),
  sort_order: z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)), z.number().optional()),
  payload_json: z.string().optional(),
})

type TaskFormValues = z.infer<typeof taskSchema>
type PointFormValues = z.infer<typeof pointSchema>

const parseJsonInput = (value?: string) => {
  if (!value?.trim()) return undefined
  try { return JSON.parse(value) } catch { throw new Error('Bitte gültiges JSON eingeben.') }
}

const requestErrorMessage = (error: unknown) => {
  if (!(error instanceof ApiError)) return permissionErrorMessage(error)
  if (error.status === 401) return 'Bitte erneut anmelden.'
  if (error.status === 403) return 'Keine Berechtigung für diese Aktion.'
  if (error.status === 404) return 'Auftrag oder Kampagne nicht gefunden.'
  if (error.status >= 500) return 'Serverfehler beim Speichern des Auftrags.'
  return permissionErrorMessage(error)
}

function FitMap({ areas, points }: { areas: Area[]; points: TaskPoint[] }) {
  const map = useMap()
  useEffect(() => {
    const positions: [number, number][] = []
    for (const area of areas) {
      const geo = getGeometryFromPayload(area.geojson)
      if (!geo) continue
      const coordinates = geo.type === 'Polygon' ? geo.coordinates.flat() : geo.coordinates.flat(2)
      for (const [lng, lat] of coordinates) positions.push([lat, lng])
    }
    for (const point of points) positions.push([point.latitude, point.longitude])
    if (positions.length > 0) map.fitBounds(positions, { padding: [30, 30] })
  }, [areas, points, map])
  return null
}

function MapClickPicker({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) })
  return null
}

export function TaskDetailPage() {
  const { taskId } = useParams()
  const id = Number(taskId)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [eventsPage, setEventsPage] = useState(1)
  const [pointFormError, setPointFormError] = useState<string | null>(null)

  const taskForm = useForm<TaskFormValues>({ resolver: zodResolver(taskSchema), defaultValues: { title: '', description: '', briefing: '', status: 'open', priority: 3, payload_json: '' } })
  const pointForm = useForm<PointFormValues>({ resolver: zodResolver(pointSchema), defaultValues: { label: '', description: '', latitude: DEFAULT_CENTER[0], longitude: DEFAULT_CENTER[1], sort_order: 0, payload_json: '' } })

  const taskQuery = useQuery({ queryKey: ['task', id], queryFn: () => getTask(id), enabled: Number.isFinite(id) })
  const pointsQuery = useQuery({ queryKey: ['task-points', id], queryFn: () => listTaskPoints(id), enabled: Number.isFinite(id) })
  const areasQuery = useQuery({ queryKey: ['campaign-areas', taskQuery.data?.campaign_id], queryFn: () => listCampaignAreas(taskQuery.data!.campaign_id, { per_page: 100 }), enabled: !!taskQuery.data?.campaign_id })
  const teamsQuery = useQuery({ queryKey: ['campaign-teams', taskQuery.data?.campaign_id], queryFn: () => listCampaignTeams(taskQuery.data!.campaign_id, { per_page: 100 }), enabled: !!taskQuery.data?.campaign_id })
  const eventsQuery = useQuery({ queryKey: ['task-events', id, eventsPage], queryFn: () => getTaskEventsByPage(id, { page: eventsPage, per_page: 100 }), enabled: Number.isFinite(id) })

  useEffect(() => {
    if (!taskQuery.data) return
    taskForm.reset({
      title: taskQuery.data.title,
      description: String(taskQuery.data.description ?? ''),
      status: taskQuery.data.status,
      briefing: String(taskQuery.data.briefing ?? ''),
      priority: taskQuery.data.priority,
      boundary_area_id: taskQuery.data.boundary_area?.id ?? taskQuery.data.boundary_area_id ?? undefined,
      area_id: taskQuery.data.target_area?.id ?? taskQuery.data.area?.id ?? taskQuery.data.area_id ?? undefined,
      assigned_team_id: taskQuery.data.assigned_team?.id,
      due_at: taskQuery.data.due_at ? String(taskQuery.data.due_at).slice(0, 16) : '',
      payload_json: taskQuery.data.payload ? JSON.stringify(taskQuery.data.payload, null, 2) : '',
    })
  }, [taskQuery.data, taskForm])

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['task', id] })
    queryClient.invalidateQueries({ queryKey: ['task-events', id] })
    queryClient.invalidateQueries({ queryKey: ['task-points', id] })
    queryClient.invalidateQueries({ queryKey: ['tasks', taskQuery.data?.campaign_id] })
  }

  const updateTaskMutation = useMutation({
    mutationFn: (values: TaskFormValues) => {
      const payload = parseJsonInput(values.payload_json)
      const { payload_json, ...rest } = values
      return updateTask(id, { ...rest, payload })
    },
    onSuccess: invalidateAll,
  })

  const createPointMutation = useMutation({ mutationFn: (payload: Partial<TaskPoint>) => createTaskPoint(id, payload), onSuccess: () => { invalidateAll(); pointForm.reset({ label: '', description: '', latitude: DEFAULT_CENTER[0], longitude: DEFAULT_CENTER[1], sort_order: 0, payload_json: '' }); setPointFormError(null) } })
  const updatePointMutation = useMutation({ mutationFn: (payload: { id: number; data: Partial<TaskPoint> }) => updateTaskPoint(payload.id, payload.data), onSuccess: invalidateAll })
  const deletePointMutation = useMutation({ mutationFn: (pointId: number) => deleteTaskPoint(pointId), onSuccess: invalidateAll })
  const deleteTaskMutation = useMutation({ mutationFn: () => deleteTask(id), onSuccess: () => navigate('/campaigns') })

  const task = taskQuery.data
  const points = useMemo(() => {
    const pointList = pointsQuery.data ?? task?.points ?? []
    return pointList.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }, [pointsQuery.data, task?.points])
  const campaignAreas = areasQuery.data?.data ?? []
  const boundaryArea = campaignAreas.find((a) => a.id === (task?.boundary_area?.id ?? task?.boundary_area_id))
  const targetArea = campaignAreas.find((a) => a.id === (task?.target_area?.id ?? task?.area?.id ?? task?.area_id))
  const mapAreas = [boundaryArea, targetArea].filter(Boolean) as Area[]
  const canManagePoints = canPermission(user?.can, 'task_points.manage') && can(task?.can?.manage_points ?? false)

  const pointOutsideHint = useMemo(() => {
    if (!targetArea?.geojson) return false
    return false
  }, [targetArea])


  useEffect(() => {
    const taskError = taskQuery.error
    const pointsError = pointsQuery.error
    const shouldRedirect =
      (taskError instanceof ApiError && taskError.status === 401) ||
      (pointsError instanceof ApiError && pointsError.status === 401)
    if (shouldRedirect) navigate('/login')
  }, [navigate, pointsQuery.error, taskQuery.error])

  if (!Number.isFinite(id)) return <ErrorState message="Auftrag nicht gefunden." />
  if (taskQuery.isLoading) return <LoadingState />
  if (taskQuery.isError) return <ErrorState message={requestErrorMessage(taskQuery.error)} />
  if (pointsQuery.isLoading) return <LoadingState />
  if (pointsQuery.isError) return <ErrorState message={requestErrorMessage(pointsQuery.error)} />
  if (!task) return <EmptyState message="Auftrag nicht gefunden." />

  const savePoint = (values: PointFormValues) => {
    try {
      const payload = parseJsonInput(values.payload_json)
      const pointPayload: Partial<TaskPoint> = { label: values.label ?? null, description: values.description ?? null, latitude: values.latitude, longitude: values.longitude, sort_order: values.sort_order, payload }
      if (values.id) updatePointMutation.mutate({ id: values.id, data: pointPayload })
      else createPointMutation.mutate(pointPayload)
      setPointFormError(null)
    } catch (error) {
      setPointFormError((error as Error).message)
    }
  }

  return <section className="space-y-4">
    <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Auftrag #{task.id}: {task.title}</h1><Link className="text-blue-600" to={`/campaigns/${task.campaign_id}`}>Zur Kampagne</Link></div>
    <div className="rounded border bg-white p-4"><h2 className="mb-2 font-medium">Übersicht</h2><p>Status: {task.status} · Priorität: {task.priority}</p></div>
    <div className="rounded border bg-white p-4"><h2 className="mb-2 font-medium">Begrenzung</h2><p>{boundaryArea?.name ?? 'Keine Begrenzung zugewiesen.'}</p></div>
    <div className="rounded border bg-white p-4"><h2 className="mb-2 font-medium">Zielgebiet</h2><p>{targetArea?.name ?? 'Kein Zielgebiet zugewiesen.'}</p></div>
    <div className="rounded border bg-white p-4"><h2 className="mb-2 font-medium">Team</h2><p>{task.assigned_team?.name ?? 'Kein Team zugewiesen.'}</p></div>
    <div className="rounded border bg-white p-4"><h2 className="mb-2 font-medium">Briefing</h2><p>{task.briefing?.trim() ? task.briefing : 'Kein Briefing hinterlegt.'}</p></div>

    <div className="rounded border bg-white p-4"><h2 className="mb-2 font-medium">Punkte / Marker</h2>{points.length === 0 ? <EmptyState message="Noch keine Punkte für diesen Auftrag vorhanden." /> : <div className="space-y-2">{points.map((point) => <article key={point.id} className="rounded border p-2 text-sm"><p className="font-medium">{point.label ?? `Punkt #${point.id}`}</p><p>{point.description ?? '—'}</p><p>Koordinaten: {point.latitude}, {point.longitude}</p><p>Sortierung: {point.sort_order ?? 0}</p><div className="mt-2 flex gap-2"><button type="button" className="border px-2 disabled:opacity-50" disabled={!canManagePoints || !can(point.can?.update)} title={!canManagePoints ? NO_PERMISSION_MESSAGE : undefined} onClick={() => pointForm.reset({ id: point.id, label: point.label ?? '', description: point.description ?? '', latitude: point.latitude, longitude: point.longitude, sort_order: point.sort_order ?? 0, payload_json: point.payload ? JSON.stringify(point.payload, null, 2) : '' })}>Punkt bearbeiten</button><button type="button" className="border px-2 disabled:opacity-50" disabled={!canManagePoints || !can(point.can?.delete)} title={!canManagePoints ? NO_PERMISSION_MESSAGE : undefined} onClick={() => deletePointMutation.mutate(point.id)}>Punkt entfernen</button></div></article>)}</div>}</div>

    <div className="rounded border bg-white p-4"><h2 className="mb-2 font-medium">Punkt hinzufügen / Punkt bearbeiten</h2><form className="space-y-2" onSubmit={pointForm.handleSubmit(savePoint)}><input placeholder="Label" {...pointForm.register('label')} disabled={!canManagePoints} title={!canManagePoints ? NO_PERMISSION_MESSAGE : undefined} /><textarea rows={2} placeholder="Beschreibung" {...pointForm.register('description')} disabled={!canManagePoints} title={!canManagePoints ? NO_PERMISSION_MESSAGE : undefined} /><div className="grid gap-2 md:grid-cols-2"><input type="number" step="any" placeholder="Breitengrad" {...pointForm.register('latitude')} disabled={!canManagePoints} /><input type="number" step="any" placeholder="Längengrad" {...pointForm.register('longitude')} disabled={!canManagePoints} /></div><input type="number" placeholder="Sortierung" {...pointForm.register('sort_order')} disabled={!canManagePoints} /><textarea rows={4} placeholder="Payload JSON" {...pointForm.register('payload_json')} disabled={!canManagePoints} /><button type="submit" className="bg-slate-900 px-3 py-1 text-white disabled:opacity-50" disabled={!canManagePoints} title={!canManagePoints ? NO_PERMISSION_MESSAGE : undefined}>{pointForm.watch('id') ? 'Punkt bearbeiten' : 'Punkt hinzufügen'}</button></form>{pointForm.formState.errors.latitude && <ErrorState message={pointForm.formState.errors.latitude.message ?? ''} />}{pointForm.formState.errors.longitude && <ErrorState message={pointForm.formState.errors.longitude.message ?? ''} />}{pointFormError && <ErrorState message={pointFormError} />}{pointOutsideHint && <p className="text-xs text-amber-700">Der Punkt liegt möglicherweise außerhalb des Zielgebiets.</p>}</div>

    <div className="rounded border bg-white p-4"><h2 className="mb-2 font-medium">Karte</h2><div className="h-96 overflow-hidden rounded border">{mapAreas.length === 0 && points.length === 0 ? <div className="p-3 text-sm text-slate-600">Keine Kartenobjekte für diesen Auftrag vorhanden.</div> : <MapContainer center={DEFAULT_CENTER} zoom={6} className="h-full w-full"><TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} /><MapClickPicker onPick={(lat, lng) => { pointForm.setValue('latitude', Number(lat.toFixed(6))); pointForm.setValue('longitude', Number(lng.toFixed(6))) }} />{mapAreas.map((area, index) => <GeoJSON key={area.id} data={area.geojson as GeoJSON.GeoJsonObject} style={{ color: index === 0 ? '#1d4ed8' : '#0f766e', weight: index === 0 ? 4 : 2, fillOpacity: index === 0 ? 0 : 0.2 }} />)}{points.map((point) => <Marker key={point.id} position={[point.latitude, point.longitude]} draggable={canManagePoints && can(point.can?.update)} eventHandlers={{ dragend: (event) => { const latLng = event.target.getLatLng(); updatePointMutation.mutate({ id: point.id, data: { latitude: latLng.lat, longitude: latLng.lng } }) } }}><Popup><p className="font-medium">{point.label ?? `Punkt #${point.id}`}</p><p>{point.description ?? '—'}</p><p>Koordinaten: {point.latitude}, {point.longitude}</p></Popup></Marker>)}<FitMap areas={mapAreas} points={points} /></MapContainer>}</div></div>

    <div className="rounded border bg-white p-4"><h2 className="mb-2 font-medium">Auftrag bearbeiten</h2><form className="space-y-2" onSubmit={taskForm.handleSubmit((values) => updateTaskMutation.mutate(values))}><input {...taskForm.register('title')} disabled={!can(task.can?.update)} title={!can(task.can?.update) ? NO_PERMISSION_MESSAGE : undefined} /><textarea rows={3} {...taskForm.register('description')} disabled={!can(task.can?.update)} title={!can(task.can?.update) ? NO_PERMISSION_MESSAGE : undefined} />
    <label className='block text-sm'>Briefing</label><textarea rows={4} {...taskForm.register('briefing')} disabled={!can(task.can?.update)} title={!can(task.can?.update) ? NO_PERMISSION_MESSAGE : undefined} /><p className='text-xs text-slate-600'>Konkrete Arbeitsanweisungen für diesen Auftrag.</p><div className="grid gap-2 md:grid-cols-2"><select {...taskForm.register('status')} disabled={!can(task.can?.change_status)} title={!can(task.can?.change_status) ? NO_PERMISSION_MESSAGE : undefined}>{TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}</select><input type="number" min={1} max={5} {...taskForm.register('priority')} disabled={!can(task.can?.update)} title={!can(task.can?.update) ? NO_PERMISSION_MESSAGE : undefined} /></div><div className="grid gap-2 md:grid-cols-3"><select {...taskForm.register('boundary_area_id')} disabled={!can(task.can?.update)}><option value="">Begrenzung auswählen</option>{campaignAreas.filter((a) => a.pivot?.usage === 'boundary').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select><select {...taskForm.register('area_id')} disabled={!can(task.can?.update)}><option value="">Zielgebiet auswählen</option>{campaignAreas.filter((a) => a.pivot?.usage === 'target').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select><select {...taskForm.register('assigned_team_id')} disabled={!can(task.can?.update) || !can(task.can?.assign_team)} title={!can(task.can?.assign_team) ? NO_PERMISSION_MESSAGE : undefined}><option value="">Assigned team</option>{(teamsQuery.data?.data ?? []).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></div><input type="datetime-local" {...taskForm.register('due_at')} disabled={!can(task.can?.update)} title={!can(task.can?.update) ? NO_PERMISSION_MESSAGE : undefined} /><textarea rows={6} placeholder="Payload JSON" {...taskForm.register('payload_json')} disabled={!can(task.can?.update)} title={!can(task.can?.update) ? NO_PERMISSION_MESSAGE : undefined} /><div className="flex gap-2"><button type="submit" className="bg-slate-900 text-white disabled:opacity-50" disabled={!can(task.can?.update)} title={!can(task.can?.update) ? NO_PERMISSION_MESSAGE : undefined}>Speichern</button><button type="button" className="bg-red-600 text-white disabled:opacity-50" disabled={!can(task.can?.delete)} title={!can(task.can?.delete) ? NO_PERMISSION_MESSAGE : undefined} onClick={() => deleteTaskMutation.mutate()}>Löschen</button></div></form>{updateTaskMutation.isError && <ErrorState message={requestErrorMessage(updateTaskMutation.error)} />}{deleteTaskMutation.isError && <ErrorState message={requestErrorMessage(deleteTaskMutation.error)} />}</div>

    <div className="rounded border bg-white p-4"><h2 className="font-medium">Ereignisse</h2>{eventsQuery.data?.data.map((event) => <div key={event.id}><p>{event.event_type}</p></div>)}<div className="mt-2 flex gap-2"><button type="button" className="border px-2" onClick={() => setEventsPage((page) => Math.max(1, page - 1))}>Previous</button><button type="button" className="border px-2" onClick={() => setEventsPage((page) => page + 1)}>Next</button></div></div>
  </section>
}
