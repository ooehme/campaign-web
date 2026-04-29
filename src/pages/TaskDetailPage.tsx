import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { deleteTask, getTask, getTaskEventsByPage, updateTask } from '../api/endpoints'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import { TASK_STATUSES } from '../utils/constants'

const optionalCoordinateSchema = z.preprocess(
  (value) => (value === '' || value == null ? undefined : value),
  z.coerce.number(),
).optional()

const taskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['open', 'assigned', 'in_progress', 'done', 'cancelled']),
  priority: z.coerce.number().min(1).max(5),
  latitude: optionalCoordinateSchema.refine((value) => value == null || (value >= -90 && value <= 90), 'Latitude must be between -90 and 90'),
  longitude: optionalCoordinateSchema.refine((value) => value == null || (value >= -180 && value <= 180), 'Longitude must be between -180 and 180'),
})

type TaskFormValues = z.infer<typeof taskSchema>

const taskToFormValues = (task: {
  title: string
  description?: string | null
  status: TaskFormValues['status']
  priority: number
  latitude?: number | null
  longitude?: number | null
}): TaskFormValues => ({
  title: task.title,
  description: String(task.description ?? ''),
  status: task.status,
  priority: task.priority,
  latitude: typeof task.latitude === 'number' ? task.latitude : undefined,
  longitude: typeof task.longitude === 'number' ? task.longitude : undefined,
})

const renderJsonBlock = (value: unknown) => {
  if (value == null) {
    return <p className="text-sm text-slate-500">None</p>
  }

  return <pre className="overflow-x-auto rounded bg-slate-50 p-2 text-xs">{JSON.stringify(value, null, 2)}</pre>
}

const areaLabel = (task: { area?: { id: number; name?: string | null } | null }) =>
  task.area?.name ?? (typeof task.area?.id === 'number' ? `Area #${task.area.id}` : 'Unassigned area')

const teamLabel = (task: { assigned_team?: { id: number; name?: string | null } | null }) =>
  task.assigned_team?.name ?? (typeof task.assigned_team?.id === 'number' ? `Team #${task.assigned_team.id}` : 'Unassigned team')

export function TaskDetailPage() {
  const { taskId } = useParams()
  const id = Number(taskId)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [eventsPage, setEventsPage] = useState(1)

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: '',
      description: '',
      status: 'open',
      priority: 3,
      latitude: undefined,
      longitude: undefined,
    },
  })

  const taskQuery = useQuery({
    queryKey: ['task', id],
    queryFn: () => getTask(id),
    enabled: Number.isFinite(id),
  })

  const eventsQuery = useQuery({
    queryKey: ['task-events', id, eventsPage],
    queryFn: () => getTaskEventsByPage(id, { page: eventsPage, per_page: 100 }),
    enabled: Number.isFinite(id),
  })

  useEffect(() => {
    if (!taskQuery.data) {
      return
    }

    form.reset(taskToFormValues(taskQuery.data))
  }, [form, taskQuery.data?.id])

  const updateMutation = useMutation({
    mutationFn: (values: TaskFormValues) => updateTask(id, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', id] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteTask(id),
    onSuccess: () => navigate('/campaigns'),
  })

  if (!Number.isFinite(id)) {
    return <ErrorState message="Invalid task id in URL." />
  }

  if (taskQuery.isLoading) {
    return <LoadingState />
  }

  if (taskQuery.isError) {
    return <ErrorState message={(taskQuery.error as Error).message} />
  }

  if (!taskQuery.data) {
    return <EmptyState message="Task not found (404)." />
  }

  const task = taskQuery.data
  const hasCoordinates = typeof task.latitude === 'number' && typeof task.longitude === 'number'
  const hasPayload = task.payload != null

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Task #{task.id}: {task.title}</h1>
        <Link className="text-blue-600" to={`/campaigns/${task.campaign_id}`}>Back to campaign</Link>
      </div>

      <div className="rounded border bg-white p-4">
        <h2 className="mb-3 font-medium">Task overview</h2>
        <dl className="grid gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-slate-500">Title</dt>
            <dd className="font-medium">{task.title}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Campaign</dt>
            <dd>{task.campaign_id}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Area</dt>
            <dd>{areaLabel(task)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Assigned team</dt>
            <dd>{teamLabel(task)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Status</dt>
            <dd>{task.status}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Priority</dt>
            <dd>{task.priority}</dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-slate-500">Description</dt>
            <dd>{task.description?.trim() ? task.description : 'No description'}</dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-slate-500">Coordinates</dt>
            <dd>{hasCoordinates ? `${task.latitude}, ${task.longitude}` : 'Not set'}</dd>
          </div>
          <div className="md:col-span-2">
            <dt className="mb-1 text-slate-500">Payload</dt>
            <dd>{hasPayload ? renderJsonBlock(task.payload) : <p className="text-sm text-slate-500">None</p>}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded border bg-white p-4">
        <h2 className="mb-2 font-medium">Edit task</h2>
        <form className="space-y-2" onSubmit={form.handleSubmit((values) => updateMutation.mutate(values))}>
          <input {...form.register('title')} />
          <textarea rows={3} {...form.register('description')} />
          <div className="grid grid-cols-2 gap-2">
            <select {...form.register('status')}>
              {TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}
            </select>
            <input type="number" min={1} max={5} {...form.register('priority')} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" step="any" placeholder="Latitude" {...form.register('latitude')} />
            <input type="number" step="any" placeholder="Longitude" {...form.register('longitude')} />
          </div>
          <div className="flex gap-2">
            <button className="bg-slate-900 text-white" type="submit">Save</button>
            <button className="bg-red-600 text-white" type="button" onClick={() => deleteMutation.mutate()}>Delete</button>
          </div>
        </form>
        {(updateMutation.isError || deleteMutation.isError) && <ErrorState message={(updateMutation.error as Error)?.message ?? (deleteMutation.error as Error)?.message ?? 'API Error'} />}
      </div>

      <div className="rounded border bg-white p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-medium">Task events</h2>
          <button
            className="rounded border px-2 py-1 text-sm"
            type="button"
            onClick={() => eventsQuery.refetch()}
            disabled={eventsQuery.isFetching}
          >
            {eventsQuery.isFetching ? 'Refreshing…' : 'Refresh events'}
          </button>
        </div>
        {eventsQuery.isLoading && <LoadingState />}
        {eventsQuery.isError && <ErrorState message={(eventsQuery.error as Error).message} />}
        {eventsQuery.data && (
          <p className="mb-2 text-xs text-slate-500">
            Page {eventsQuery.data.meta.current_page} of {eventsQuery.data.meta.last_page} · {eventsQuery.data.meta.total} total events
          </p>
        )}
        {eventsQuery.data && eventsQuery.data.data.length === 0 && <EmptyState message="No task events yet." />}
        {eventsQuery.data && eventsQuery.data.data.length > 0 && (
          <ul className="space-y-2 text-sm">
            {eventsQuery.data.data.map((event) => (
              <li key={event.id} className="rounded border p-2">
                <p className="font-medium">{event.type}</p>
                <p className="text-slate-600">{event.created_at ?? 'n/a'}</p>
                <pre className="overflow-x-auto text-xs">{JSON.stringify(event.payload ?? {}, null, 2)}</pre>
              </li>
            ))}
          </ul>
        )}
        {eventsQuery.data && eventsQuery.data.meta.last_page > 1 && (
          <div className="mt-3 flex items-center gap-2">
            <button type="button" className="border px-2 py-1 disabled:opacity-50" onClick={() => setEventsPage((page) => Math.max(1, page - 1))} disabled={eventsPage <= 1}>Previous</button>
            <span className="text-xs text-slate-500">Page {eventsQuery.data.meta.current_page} of {eventsQuery.data.meta.last_page}</span>
            <button type="button" className="border px-2 py-1 disabled:opacity-50" onClick={() => setEventsPage((page) => Math.min(eventsQuery.data?.meta.last_page ?? page, page + 1))} disabled={eventsPage >= eventsQuery.data.meta.last_page}>Next</button>
          </div>
        )}
      </div>
    </section>
  )
}
