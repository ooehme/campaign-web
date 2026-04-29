import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useParams } from 'react-router-dom'
import { z } from 'zod'
import {
  addUserToTeam,
  attachAreaToCampaign,
  attachTeamToCampaign,
  createAreaForCampaign,
  createTask,
  createTeamForCampaign,
  detachAreaFromCampaign,
  detachTeamFromCampaign,
  deleteTask,
  getCampaign,
  getTasksPage,
  listAreas,
  listCampaignAreas,
  listCampaignTeams,
  listTeams,
  removeUserFromTeam,
  updateArea,
  updateTeam,
  updateTeamUser,
} from '../api/endpoints'
import { MapPanel } from '../components/MapPanel'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import type { TaskStatus, TeamRole } from '../types/models'
import { TASK_STATUSES, TEAM_ROLES } from '../utils/constants'

const geoJsonSchema = z.object({ type: z.enum(['Polygon', 'MultiPolygon']), coordinates: z.array(z.unknown()) })
const areaSchema = z.object({ name: z.string().min(1), geojson: z.string().refine((value) => { try { geoJsonSchema.parse(JSON.parse(value)); return true } catch { return false } }, 'GeoJSON must be valid Polygon or MultiPolygon JSON.') })
const teamSchema = z.object({ name: z.string().min(1) })
const membershipSchema = z.object({ user_id: z.coerce.number().int().positive(), role: z.enum(['member', 'lead', 'admin']), display_name: z.string().optional(), notes: z.string().optional() })
const taskSchema = z.object({ title: z.string().min(1), status: z.enum(['open', 'assigned', 'in_progress', 'done', 'cancelled']), priority: z.coerce.number().min(1).max(5), area_id: z.coerce.number().int().positive().optional(), assigned_team_id: z.coerce.number().int().positive().optional() })
type TaskFormValues = z.infer<typeof taskSchema>

export function CampaignDetailPage() {
  const { campaignId } = useParams()
  const id = Number(campaignId)
  const qc = useQueryClient()
  const [areasPage, setAreasPage] = useState(1)
  const [selectedAreaId, setSelectedAreaId] = useState('')
  const [selectedTeamId, setSelectedTeamId] = useState('')

  useEffect(() => setAreasPage(1), [id])

  const campaignQuery = useQuery({ queryKey: ['campaign', id], queryFn: () => getCampaign(id), enabled: Number.isFinite(id) })
  const areasQuery = useQuery({ queryKey: ['campaign-areas', id, areasPage], queryFn: () => listCampaignAreas(id, { page: areasPage, per_page: 100 }), enabled: Number.isFinite(id) })
  const teamsQuery = useQuery({ queryKey: ['campaign-teams', id], queryFn: () => listCampaignTeams(id, { per_page: 100 }), enabled: Number.isFinite(id) })
  const areasPoolQuery = useQuery({ queryKey: ['areas-pool'], queryFn: () => listAreas({ per_page: 100 }) })
  const teamsPoolQuery = useQuery({ queryKey: ['teams-pool'], queryFn: () => listTeams({ per_page: 100 }) })
  const tasksQuery = useQuery({ queryKey: ['tasks', id], queryFn: () => getTasksPage(id, { page: 1, per_page: 100 }), enabled: Number.isFinite(id) })

  const areaForm = useForm({ resolver: zodResolver(areaSchema), defaultValues: { name: '', geojson: '{"type":"Polygon","coordinates":[]}' } })
  const teamForm = useForm({ resolver: zodResolver(teamSchema), defaultValues: { name: '' } })
  const membershipForm = useForm({ resolver: zodResolver(membershipSchema), defaultValues: { user_id: 0, role: 'member' as TeamRole, display_name: '', notes: '' } })
  const taskForm = useForm<TaskFormValues>({ resolver: zodResolver(taskSchema), defaultValues: { title: '', status: 'open' as TaskStatus, priority: 3 } })

  const refreshCampaign = () => {
    qc.invalidateQueries({ queryKey: ['campaign-areas', id] })
    qc.invalidateQueries({ queryKey: ['campaign-teams', id] })
    qc.invalidateQueries({ queryKey: ['areas-pool'] })
    qc.invalidateQueries({ queryKey: ['teams-pool'] })
    qc.invalidateQueries({ queryKey: ['tasks', id] })
  }

  const areaCreate = useMutation({ mutationFn: (values: { name: string; geojson: string }) => createAreaForCampaign(id, { name: values.name, geojson: JSON.parse(values.geojson) }), onSuccess: () => { setAreasPage(1); refreshCampaign(); areaForm.reset() } })
  const areaPatch = useMutation({ mutationFn: ({ areaId, name, geojson }: { areaId: number; name: string; geojson: string }) => updateArea(areaId, { name, geojson: JSON.parse(geojson) }), onSuccess: refreshCampaign })
  const teamCreate = useMutation({ mutationFn: (values: { name: string }) => createTeamForCampaign(id, values), onSuccess: () => { refreshCampaign(); teamForm.reset() } })
  const teamPatch = useMutation({ mutationFn: ({ teamId, name }: { teamId: number; name: string }) => updateTeam(teamId, { name }), onSuccess: refreshCampaign })
  const membershipAdd = useMutation({ mutationFn: ({ teamId, user_id, role, display_name, notes }: { teamId: number; user_id: number; role: TeamRole; display_name?: string; notes?: string }) => addUserToTeam(teamId, { user_id, role, display_name, notes }) })
  const membershipUpdate = useMutation({ mutationFn: ({ teamId, user_id, role, display_name, notes }: { teamId: number; user_id: number; role: TeamRole; display_name?: string; notes?: string }) => updateTeamUser(teamId, user_id, { role, display_name, notes }) })
  const membershipDelete = useMutation({ mutationFn: ({ teamId, user_id }: { teamId: number; user_id: number }) => removeUserFromTeam(teamId, user_id) })
  const taskCreate = useMutation({ mutationFn: (values: TaskFormValues) => createTask(id, values), onSuccess: () => { refreshCampaign(); taskForm.reset({ title: '', status: 'open', priority: 3 }) } })
  const taskDeleteMutation = useMutation({ mutationFn: deleteTask, onSuccess: refreshCampaign })

  const assignedAreas = areasQuery.data?.data ?? []
  const assignedTeams = teamsQuery.data?.data ?? []
  const combinedError = useMemo(() => (areaCreate.error as Error)?.message ?? (teamCreate.error as Error)?.message ?? (taskCreate.error as Error)?.message ?? undefined, [areaCreate.error, teamCreate.error, taskCreate.error])

  if (campaignQuery.isLoading) return <LoadingState />
  if (campaignQuery.isError) return <ErrorState message={(campaignQuery.error as Error).message} />
  if (!campaignQuery.data) return <EmptyState message="Campaign not found." />

  return <section className="space-y-6">
    <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Campaign: {campaignQuery.data.name}</h1><Link to={`/campaigns/${id}/tasks`} className="text-blue-600">Open full task list</Link></div>
    <MapPanel tasks={tasksQuery.data?.data ?? []} areas={assignedAreas} />

    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-3 rounded border bg-white p-4">
        <h2 className="font-medium">Assigned areas</h2>
        <form className="space-y-2" onSubmit={areaForm.handleSubmit((values) => areaCreate.mutate(values))}>
          <input placeholder="Area name" {...areaForm.register('name')} />
          <textarea rows={4} placeholder='{"type":"Polygon","coordinates":[]}' {...areaForm.register('geojson')} />
          <button className="bg-slate-900 text-white" type="submit">Create area and assign</button>
        </form>
        <div className="grid grid-cols-2 gap-2">
          <select value={selectedAreaId} onChange={(e) => setSelectedAreaId(e.target.value)}><option value="">Select area to attach...</option>{(areasPoolQuery.data?.data ?? []).map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select>
          <button type="button" className="border" onClick={() => selectedAreaId && attachAreaToCampaign(id, Number(selectedAreaId)).then(() => { setSelectedAreaId(''); refreshCampaign() })}>Attach selected</button>
        </div>
        {areasQuery.isError && <ErrorState message={(areasQuery.error as Error).message} />}
        {areasQuery.data && assignedAreas.length === 0 && <p className="text-sm text-slate-500">No areas assigned to this campaign yet.</p>}
        {assignedAreas.map((area) => <div key={area.id} className="rounded border p-2 text-sm"><p className="font-medium">{area.name}</p><div className="mt-2 flex gap-2"><button type="button" className="border" onClick={() => areaPatch.mutate({ areaId: area.id, name: area.name, geojson: JSON.stringify(area.geojson ?? { type: 'Polygon', coordinates: [] }) })}>Update</button><button type="button" className="bg-red-600 text-white" onClick={() => detachAreaFromCampaign(id, area.id).then(refreshCampaign)}>Detach</button></div></div>)}
      </div>

      <div className="space-y-3 rounded border bg-white p-4">
        <h2 className="font-medium">Assigned teams + membership</h2>
        <form className="space-y-2" onSubmit={teamForm.handleSubmit((values) => teamCreate.mutate(values))}><input placeholder="Team name" {...teamForm.register('name')} /><button className="bg-slate-900 text-white" type="submit">Create team and assign</button></form>
        <div className="grid grid-cols-2 gap-2"><select value={selectedTeamId} onChange={(e) => setSelectedTeamId(e.target.value)}><option value="">Select team to attach...</option>{(teamsPoolQuery.data?.data ?? []).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select><button type="button" className="border" onClick={() => selectedTeamId && attachTeamToCampaign(id, Number(selectedTeamId)).then(() => { setSelectedTeamId(''); refreshCampaign() })}>Attach selected</button></div>
        {teamsQuery.data && assignedTeams.length === 0 && <p className="text-sm text-slate-500">No teams assigned to this campaign yet.</p>}
        {assignedTeams.map((team) => <div key={team.id} className="rounded border p-2 text-sm"><p className="font-medium">{team.name}</p><div className="mt-2 flex gap-2"><button type="button" className="border" onClick={() => teamPatch.mutate({ teamId: team.id, name: team.name })}>Update</button><button type="button" className="bg-red-600 text-white" onClick={() => detachTeamFromCampaign(id, team.id).then(refreshCampaign)}>Detach</button></div><form className="mt-2 grid grid-cols-5 gap-2" onSubmit={membershipForm.handleSubmit((v) => membershipAdd.mutate({ teamId: team.id, user_id: v.user_id, role: v.role, display_name: v.display_name, notes: v.notes }))}><input type="number" placeholder="user_id" {...membershipForm.register('user_id')} /><select {...membershipForm.register('role')}>{TEAM_ROLES.map((role) => <option key={role}>{role}</option>)}</select><input placeholder="display name" {...membershipForm.register('display_name')} /><input placeholder="notes" {...membershipForm.register('notes')} /><button className="border" type="submit">Add user</button></form><div className="mt-2 flex gap-2"><button type="button" className="border" onClick={() => membershipUpdate.mutate({ teamId: team.id, user_id: Number(membershipForm.getValues('user_id')), role: membershipForm.getValues('role'), display_name: membershipForm.getValues('display_name'), notes: membershipForm.getValues('notes') })}>Update user</button><button type="button" className="border" onClick={() => membershipDelete.mutate({ teamId: team.id, user_id: Number(membershipForm.getValues('user_id')) })}>Remove user</button></div></div>)}
      </div>

      <div className="space-y-3 rounded border bg-white p-4">
        <h2 className="font-medium">Tasks</h2>
        <form className="space-y-2" onSubmit={taskForm.handleSubmit((values) => taskCreate.mutate(values))}>
          <input placeholder="Title" {...taskForm.register('title')} />
          <div className="grid grid-cols-2 gap-2"><select {...taskForm.register('status')}>{TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}</select><input type="number" min={1} max={5} placeholder="Priority 1-5" {...taskForm.register('priority')} /></div>
          <div className="grid grid-cols-2 gap-2"><select {...taskForm.register('area_id')}><option value="">Select assigned area</option>{assignedAreas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select><select {...taskForm.register('assigned_team_id')}><option value="">Select assigned team</option>{assignedTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></div>
          <button className="bg-slate-900 text-white" type="submit">Create task</button>
        </form>
        {(tasksQuery.data?.data ?? []).map((task) => <div key={task.id} className="rounded border p-2 text-sm"><Link className="font-medium text-blue-600" to={`/tasks/${task.id}`}>{task.title}</Link><p>Status: {task.status} | Priority: {task.priority}</p><button type="button" className="mt-2 bg-red-600 text-white" onClick={() => taskDeleteMutation.mutate(task.id)}>Delete</button></div>)}
      </div>
    </div>
    {combinedError && <ErrorState message={combinedError} />}
  </section>
}
