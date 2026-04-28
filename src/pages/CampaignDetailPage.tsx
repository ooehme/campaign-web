import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link, useParams } from 'react-router-dom'
import { z } from 'zod'
import {
  addTeamUser,
  createArea,
  createTask,
  createTeam,
  deleteArea,
  deleteTask,
  deleteTeam,
  getAreas,
  getCampaign,
  getTasks,
  getTeams,
  removeTeamUser,
  updateArea,
  updateTeam,
  updateTeamUser,
} from '../api/endpoints'
import { MapPanel } from '../components/MapPanel'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import type { TaskStatus, TeamRole } from '../types/models'
import { TASK_STATUSES, TEAM_ROLES } from '../utils/constants'

const geoJsonSchema = z.object({
  type: z.enum(['Polygon', 'MultiPolygon']),
  coordinates: z.array(z.unknown()),
})

const areaSchema = z.object({
  name: z.string().min(1),
  geojson: z.string().refine((value) => {
    try {
      geoJsonSchema.parse(JSON.parse(value))
      return true
    } catch {
      return false
    }
  }, 'GeoJSON must be valid Polygon or MultiPolygon JSON.'),
})

const teamSchema = z.object({ name: z.string().min(1) })
const membershipSchema = z.object({ user_id: z.coerce.number().int().positive(), role: z.enum(['member', 'lead', 'admin']) })
const taskSchema = z.object({
  title: z.string().min(1),
  status: z.enum(['open', 'assigned', 'in_progress', 'done', 'cancelled']),
  priority: z.coerce.number().min(1).max(5),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
})
type TaskFormValues = z.infer<typeof taskSchema>

export function CampaignDetailPage() {
  const { campaignId } = useParams()
  const id = Number(campaignId)
  const qc = useQueryClient()

  const campaignQuery = useQuery({ queryKey: ['campaign', id], queryFn: () => getCampaign(id), enabled: Number.isFinite(id) })
  const areasQuery = useQuery({ queryKey: ['areas', id], queryFn: () => getAreas(id), enabled: Number.isFinite(id) })
  const teamsQuery = useQuery({ queryKey: ['teams', id], queryFn: () => getTeams(id), enabled: Number.isFinite(id) })
  const tasksQuery = useQuery({ queryKey: ['tasks', id], queryFn: () => getTasks(id), enabled: Number.isFinite(id) })

  const areaForm = useForm({ resolver: zodResolver(areaSchema), defaultValues: { name: '', geojson: '{"type":"Polygon","coordinates":[]}' } })
  const teamForm = useForm({ resolver: zodResolver(teamSchema), defaultValues: { name: '' } })
  const membershipForm = useForm({ resolver: zodResolver(membershipSchema), defaultValues: { user_id: 0, role: 'member' as TeamRole } })
  const taskForm = useForm<TaskFormValues>({ resolver: zodResolver(taskSchema), defaultValues: { title: '', status: 'open' as TaskStatus, priority: 3, latitude: undefined, longitude: undefined } })

  const refreshCampaign = () => {
    qc.invalidateQueries({ queryKey: ['areas', id] })
    qc.invalidateQueries({ queryKey: ['teams', id] })
    qc.invalidateQueries({ queryKey: ['tasks', id] })
  }

  const areaCreate = useMutation({ mutationFn: (values: { name: string; geojson: string }) => createArea(id, { name: values.name, geojson: JSON.parse(values.geojson) }), onSuccess: () => { refreshCampaign(); areaForm.reset() } })
  const areaDelete = useMutation({ mutationFn: deleteArea, onSuccess: refreshCampaign })
  const areaPatch = useMutation({ mutationFn: ({ areaId, name, geojson }: { areaId: number; name: string; geojson: string }) => updateArea(areaId, { name, geojson: JSON.parse(geojson) }), onSuccess: refreshCampaign })

  const teamCreate = useMutation({ mutationFn: (values: { name: string }) => createTeam(id, values), onSuccess: () => { refreshCampaign(); teamForm.reset() } })
  const teamPatch = useMutation({ mutationFn: ({ teamId, name }: { teamId: number; name: string }) => updateTeam(teamId, { name }), onSuccess: refreshCampaign })
  const teamDeleteMutation = useMutation({ mutationFn: deleteTeam, onSuccess: refreshCampaign })

  const membershipAdd = useMutation({ mutationFn: ({ teamId, user_id, role }: { teamId: number; user_id: number; role: TeamRole }) => addTeamUser(teamId, user_id, role) })
  const membershipUpdate = useMutation({ mutationFn: ({ teamId, user_id, role }: { teamId: number; user_id: number; role: TeamRole }) => updateTeamUser(teamId, user_id, role) })
  const membershipDelete = useMutation({ mutationFn: ({ teamId, user_id }: { teamId: number; user_id: number }) => removeTeamUser(teamId, user_id) })

  const taskCreate = useMutation({ mutationFn: (values: TaskFormValues) => createTask(id, values), onSuccess: () => { refreshCampaign(); taskForm.reset() } })
  const taskDeleteMutation = useMutation({ mutationFn: deleteTask, onSuccess: refreshCampaign })

  if (campaignQuery.isLoading) return <LoadingState />
  if (campaignQuery.isError) return <ErrorState message={(campaignQuery.error as Error).message} />
  if (!campaignQuery.data) return <EmptyState message="Campaign not found." />

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Campaign: {campaignQuery.data.name}</h1>
        <Link to={`/campaigns/${id}/tasks`} className="text-blue-600">Open full task list</Link>
      </div>

      <MapPanel tasks={tasksQuery.data ?? []} areas={areasQuery.data ?? []} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 rounded border bg-white p-4">
          <h2 className="font-medium">Areas</h2>
          <form className="space-y-2" onSubmit={areaForm.handleSubmit((values) => areaCreate.mutate(values))}>
            <input placeholder="Area name" {...areaForm.register('name')} />
            <textarea rows={4} placeholder='{"type":"Polygon","coordinates":[]}' {...areaForm.register('geojson')} />
            <button className="bg-slate-900 text-white" type="submit">Create area</button>
          </form>
          {areaForm.formState.errors.geojson && <ErrorState message={areaForm.formState.errors.geojson.message ?? 'Invalid GeoJSON'} />}
          {(areasQuery.data ?? []).map((area) => (
            <div key={area.id} className="rounded border p-2 text-sm">
              <p className="font-medium">{area.name}</p>
              <div className="mt-2 flex gap-2">
                <button className="border" onClick={() => areaPatch.mutate({ areaId: area.id, name: area.name, geojson: JSON.stringify(area.geojson ?? { type: 'Polygon', coordinates: [] }) })}>Patch</button>
                <button className="bg-red-600 text-white" onClick={() => areaDelete.mutate(area.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3 rounded border bg-white p-4">
          <h2 className="font-medium">Teams + membership</h2>
          <form className="space-y-2" onSubmit={teamForm.handleSubmit((values) => teamCreate.mutate(values))}>
            <input placeholder="Team name" {...teamForm.register('name')} />
            <button className="bg-slate-900 text-white" type="submit">Create team</button>
          </form>

          {(teamsQuery.data ?? []).map((team) => (
            <div key={team.id} className="rounded border p-2 text-sm">
              <p className="font-medium">{team.name}</p>
              <div className="mt-2 flex gap-2">
                <button className="border" onClick={() => teamPatch.mutate({ teamId: team.id, name: team.name })}>Patch</button>
                <button className="bg-red-600 text-white" onClick={() => teamDeleteMutation.mutate(team.id)}>Delete</button>
              </div>
              <form className="mt-2 grid grid-cols-3 gap-2" onSubmit={membershipForm.handleSubmit((values) => membershipAdd.mutate({ teamId: team.id, user_id: values.user_id, role: values.role }))}>
                <input type="number" placeholder="user_id" {...membershipForm.register('user_id')} />
                <select {...membershipForm.register('role')}>
                  {TEAM_ROLES.map((role) => <option key={role}>{role}</option>)}
                </select>
                <button className="border" type="submit">Add user</button>
              </form>
              <div className="mt-2 flex gap-2">
                <button className="border" onClick={() => membershipUpdate.mutate({ teamId: team.id, user_id: Number(membershipForm.getValues('user_id')), role: membershipForm.getValues('role') })}>Update role</button>
                <button className="border" onClick={() => membershipDelete.mutate({ teamId: team.id, user_id: Number(membershipForm.getValues('user_id')) })}>Remove user</button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3 rounded border bg-white p-4">
          <h2 className="font-medium">Tasks</h2>
          <form className="space-y-2" onSubmit={taskForm.handleSubmit((values) => taskCreate.mutate(values))}>
            <input placeholder="Title" {...taskForm.register('title')} />
            <div className="grid grid-cols-2 gap-2">
              <select {...taskForm.register('status')}>
                {TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}
              </select>
              <input type="number" min={1} max={5} placeholder="Priority 1-5" {...taskForm.register('priority')} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" step="any" placeholder="Latitude" {...taskForm.register('latitude')} />
              <input type="number" step="any" placeholder="Longitude" {...taskForm.register('longitude')} />
            </div>
            <button className="bg-slate-900 text-white" type="submit">Create task</button>
          </form>
          {taskForm.formState.errors.latitude && <ErrorState message={taskForm.formState.errors.latitude.message ?? 'Invalid latitude'} />}
          {taskForm.formState.errors.longitude && <ErrorState message={taskForm.formState.errors.longitude.message ?? 'Invalid longitude'} />}

          {(tasksQuery.data ?? []).map((task) => (
            <div key={task.id} className="rounded border p-2 text-sm">
              <Link className="font-medium text-blue-600" to={`/tasks/${task.id}`}>{task.title}</Link>
              <p>Status: {task.status} | Priority: {task.priority}</p>
              <button className="mt-2 bg-red-600 text-white" onClick={() => taskDeleteMutation.mutate(task.id)}>Delete</button>
            </div>
          ))}
        </div>
      </div>

      {(areaCreate.isError || teamCreate.isError || taskCreate.isError) && (
        <ErrorState message={(areaCreate.error as Error)?.message ?? (teamCreate.error as Error)?.message ?? (taskCreate.error as Error)?.message ?? 'API Error'} />
      )}
    </section>
  )
}
