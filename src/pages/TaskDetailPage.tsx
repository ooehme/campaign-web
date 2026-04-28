import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { deleteTask, getTask, getTaskEvents, updateTask } from '../api/endpoints'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import { TASK_STATUSES } from '../utils/constants'

const taskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['open', 'assigned', 'in_progress', 'done', 'cancelled']),
  priority: z.coerce.number().min(1).max(5),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
})

export function TaskDetailPage() {
  const { taskId } = useParams()
  const id = Number(taskId)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const taskQuery = useQuery({ queryKey: ['task', id], queryFn: () => getTask(id), enabled: Number.isFinite(id) })
  const eventsQuery = useQuery({ queryKey: ['task-events', id], queryFn: () => getTaskEvents(id), enabled: Number.isFinite(id) })

  const form = useForm({ resolver: zodResolver(taskSchema) })

  const updateMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => updateTask(id, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', id] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteTask(id),
    onSuccess: () => navigate('/campaigns'),
  })

  if (taskQuery.isLoading) return <LoadingState />
  if (taskQuery.isError) return <ErrorState message={(taskQuery.error as Error).message} />
  if (!taskQuery.data) return <EmptyState message="Task not found." />

  const task = taskQuery.data

  if (!form.getValues('title')) {
    form.reset({
      title: task.title,
      description: String(task.description ?? ''),
      status: task.status,
      priority: task.priority,
      latitude: typeof task.latitude === 'number' ? task.latitude : undefined,
      longitude: typeof task.longitude === 'number' ? task.longitude : undefined,
    })
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Task #{task.id}: {task.title}</h1>
        <Link className="text-blue-600" to={`/campaigns/${task.campaign_id}`}>Back to campaign</Link>
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
        <h2 className="mb-2 font-medium">Task events</h2>
        {eventsQuery.isLoading && <LoadingState />}
        {eventsQuery.isError && <ErrorState message={(eventsQuery.error as Error).message} />}
        {eventsQuery.data && eventsQuery.data.length === 0 && <EmptyState message="No events for this task." />}
        {eventsQuery.data && eventsQuery.data.length > 0 && (
          <ul className="space-y-2 text-sm">
            {eventsQuery.data.map((event) => (
              <li key={event.id} className="rounded border p-2">
                <p className="font-medium">{event.type}</p>
                <p className="text-slate-600">{event.created_at ?? 'n/a'}</p>
                <pre className="overflow-x-auto text-xs">{JSON.stringify(event.payload ?? {}, null, 2)}</pre>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
