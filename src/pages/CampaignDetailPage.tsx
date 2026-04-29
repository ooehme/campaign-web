import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useParams } from 'react-router-dom'
import { z } from 'zod'
import {
  addUserToTeam,
  attachTeamToCampaign,
  createTask,
  createTeamForCampaign,
  deleteTeam,
  detachTeamFromCampaign,
  deleteTask,
  getCampaign,
  getTasksPage,
  listCampaignAreas,
  listCampaignTeams,
  listTeams,
  listUsers,
  removeUserFromTeam,
  updateTeam,
  updateTeamUser,
} from '../api/endpoints'
import { MapPanel } from '../components/MapPanel'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import type { TaskStatus, TeamRole } from '../types/models'
import { TASK_STATUSES, TEAM_ROLES } from '../utils/constants'
import { can, NO_PERMISSION_MESSAGE, permissionErrorMessage } from '../utils/permissions'

const teamSchema = z.object({ name: z.string().min(1) })
const membershipSchema = z.object({ user_id: z.coerce.number().int().positive(), role: z.enum(['member', 'lead', 'admin']), display_name: z.string().optional(), notes: z.string().optional() })
const taskSchema = z.object({ title: z.string().min(1), status: z.enum(['open', 'assigned', 'in_progress', 'done', 'cancelled']), priority: z.coerce.number().min(1).max(5), area_id: z.coerce.number().int().positive().optional(), assigned_team_id: z.coerce.number().int().positive().optional() })

type TaskFormValues = z.infer<typeof taskSchema>

type TeamMember = { id: number; name?: string; email?: string; pivot?: { role?: TeamRole; display_name?: string | null; notes?: string | null } }

export function CampaignDetailPage() {
  const { campaignId } = useParams()
  const id = Number(campaignId)
  const qc = useQueryClient()
  const [areasPage, setAreasPage] = useState(1)
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [membershipDrafts, setMembershipDrafts] = useState<Record<number, { user_id: number; role: TeamRole; display_name: string; notes: string }>>({})

  useEffect(() => setAreasPage(1), [id])

  const campaignQuery = useQuery({ queryKey: ['campaign', id], queryFn: () => getCampaign(id), enabled: Number.isFinite(id) })
  const areasQuery = useQuery({ queryKey: ['campaign-areas', id, areasPage], queryFn: () => listCampaignAreas(id, { page: areasPage, per_page: 100 }), enabled: Number.isFinite(id) })
  const teamsQuery = useQuery({ queryKey: ['campaign-teams', id], queryFn: () => listCampaignTeams(id, { per_page: 100 }), enabled: Number.isFinite(id) })
  const teamsPoolQuery = useQuery({ queryKey: ['teams-pool'], queryFn: () => listTeams({ per_page: 100 }) })
  const tasksQuery = useQuery({ queryKey: ['tasks', id], queryFn: () => getTasksPage(id, { page: 1, per_page: 100 }), enabled: Number.isFinite(id) })
  const usersPoolQuery = useQuery({ queryKey: ['users-pool'], queryFn: () => listUsers({ per_page: 100 }) })

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

  const teamCreate = useMutation({ mutationFn: (values: { name: string }) => createTeamForCampaign(id, values), onSuccess: () => { refreshCampaign(); teamForm.reset() } })
  const teamPatch = useMutation({ mutationFn: ({ teamId, name }: { teamId: number; name: string }) => updateTeam(teamId, { name }), onSuccess: refreshCampaign })
  const teamDelete = useMutation({ mutationFn: (teamId: number) => deleteTeam(teamId), onSuccess: refreshCampaign })
  const membershipAdd = useMutation({ mutationFn: ({ teamId, user_id, role, display_name, notes }: { teamId: number; user_id: number; role: TeamRole; display_name?: string; notes?: string }) => addUserToTeam(teamId, { user_id, role, display_name, notes }), onSuccess: refreshCampaign })
  const membershipUpdate = useMutation({ mutationFn: ({ teamId, user_id, role, display_name, notes }: { teamId: number; user_id: number; role: TeamRole; display_name?: string; notes?: string }) => updateTeamUser(teamId, user_id, { role, display_name, notes }), onSuccess: refreshCampaign })
  const membershipDelete = useMutation({ mutationFn: ({ teamId, user_id }: { teamId: number; user_id: number }) => removeUserFromTeam(teamId, user_id), onSuccess: refreshCampaign })
  const taskCreate = useMutation({ mutationFn: (values: TaskFormValues) => createTask(id, values), onSuccess: () => { refreshCampaign(); taskForm.reset({ title: '', status: 'open', priority: 3 }) } })
  const taskDeleteMutation = useMutation({ mutationFn: deleteTask, onSuccess: refreshCampaign })

  const assignedAreas = areasQuery.data?.data ?? []
  const assignedTeams = teamsQuery.data?.data ?? []
  const usersError = usersPoolQuery.isError ? permissionErrorMessage(usersPoolQuery.error) : null

  if (campaignQuery.isLoading) return <LoadingState />
  if (campaignQuery.isError) return <ErrorState message={(campaignQuery.error as Error).message} />
  if (!campaignQuery.data) return <EmptyState message="Campaign not found." />

  const campaign = campaignQuery.data

  return <section className="space-y-6">
    <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Campaign: {campaign.name}</h1><Link to={`/campaigns/${id}/tasks`} className="text-blue-600">Open full task list</Link></div>
    <MapPanel tasks={tasksQuery.data?.data ?? []} areas={assignedAreas} />
    {usersError && <ErrorState message={usersError.includes('403') ? 'Keine Berechtigung, Benutzer zu laden.' : usersError} />}

    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-3 rounded border bg-white p-4"><h2 className="font-medium">Assigned areas</h2><p className="text-xs text-slate-500">Area management unchanged.</p></div>

      <div className="space-y-3 rounded border bg-white p-4">
        <h2 className="font-medium">Team detail</h2>
        <p className="text-xs text-slate-500">Team overview · Assigned campaigns · Members · Add member form · Edit member rows</p>
        <form className="space-y-2" onSubmit={teamForm.handleSubmit((values) => teamCreate.mutate(values))}><input placeholder="Team name" {...teamForm.register('name')} /><button className="bg-slate-900 text-white disabled:opacity-50" type="submit" disabled={!can(campaign.can?.create_team)} title={!can(campaign.can?.create_team) ? NO_PERMISSION_MESSAGE : undefined}>Create team and assign</button></form>
        <div className="grid grid-cols-2 gap-2"><select value={selectedTeamId} onChange={(e) => setSelectedTeamId(e.target.value)}><option value="">Select team to attach...</option>{(teamsPoolQuery.data?.data ?? []).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select><button type="button" className="border disabled:opacity-50" disabled={!can(campaign.can?.attach_team) || !selectedTeamId} title={!can(campaign.can?.attach_team) ? NO_PERMISSION_MESSAGE : undefined} onClick={() => selectedTeamId && attachTeamToCampaign(id, Number(selectedTeamId)).then(() => { setSelectedTeamId(''); refreshCampaign() })}>Attach selected</button></div>
        {assignedTeams.map((team) => {
          const members = ((team as { users?: TeamMember[] }).users ?? [])
          const disabledMembers = !can(team.can?.manage_members)
          return <div key={team.id} className="rounded border p-2 text-sm"><p className="font-medium">{team.name}</p><p className="text-xs text-slate-500">Assigned campaigns: current campaign #{id}</p><div className="mt-2 flex gap-2"><button type="button" className="border disabled:opacity-50" disabled={!can(team.can?.update)} title={!can(team.can?.update) ? NO_PERMISSION_MESSAGE : undefined} onClick={() => teamPatch.mutate({ teamId: team.id, name: team.name })}>Save team name</button><button type="button" className="bg-red-600 text-white disabled:opacity-50" disabled={!can(team.can?.delete)} title={!can(team.can?.delete) ? NO_PERMISSION_MESSAGE : undefined} onClick={() => teamDelete.mutate(team.id)}>Delete team</button><button type="button" className="bg-red-600 text-white disabled:opacity-50" onClick={() => detachTeamFromCampaign(id, team.id).then(refreshCampaign)} disabled={!can(campaign.can?.detach_team) || !can(team.can?.detach_from_campaign)} title={(!can(campaign.can?.detach_team) || !can(team.can?.detach_from_campaign)) ? NO_PERMISSION_MESSAGE : undefined}>Detach</button></div>
            <form className="mt-2 grid grid-cols-5 gap-2" onSubmit={membershipForm.handleSubmit((v) => membershipAdd.mutate({ teamId: team.id, user_id: v.user_id, role: v.role, display_name: v.display_name, notes: v.notes }))}>
              <select {...membershipForm.register('user_id', { valueAsNumber: true })} disabled={disabledMembers} title={disabledMembers ? NO_PERMISSION_MESSAGE : undefined}><option value="">Benutzer dem Team zuweisen</option>{(usersPoolQuery.data?.data ?? []).map((user) => <option key={user.id} value={user.id}>{user.name} ({user.email})</option>)}</select>
              <select {...membershipForm.register('role')} disabled={disabledMembers} title={disabledMembers ? NO_PERMISSION_MESSAGE : undefined}>{TEAM_ROLES.map((role) => <option key={role}>{role}</option>)}</select><input placeholder="display name" {...membershipForm.register('display_name')} disabled={disabledMembers} title={disabledMembers ? NO_PERMISSION_MESSAGE : undefined} /><input placeholder="notes" {...membershipForm.register('notes')} disabled={disabledMembers} title={disabledMembers ? NO_PERMISSION_MESSAGE : undefined} /><button className="border disabled:opacity-50" disabled={disabledMembers || usersPoolQuery.isError} title={disabledMembers ? NO_PERMISSION_MESSAGE : undefined} type="submit">Benutzer dem Team zuweisen</button></form>
            <h3 className="mt-3 font-medium">Members</h3>
            {members.length === 0 && <p className="text-xs text-slate-500">No members assigned.</p>}
            {members.map((member) => {
              const draft = membershipDrafts[member.id] ?? { user_id: member.id, role: member.pivot?.role ?? 'member', display_name: member.pivot?.display_name ?? '', notes: member.pivot?.notes ?? '' }
              return <div key={member.id} className="mt-2 grid grid-cols-5 gap-2"><span>{member.name ?? `User #${member.id}`}</span><select value={draft.role} onChange={(e) => setMembershipDrafts((prev) => ({ ...prev, [member.id]: { ...draft, role: e.target.value as TeamRole } }))} disabled={disabledMembers} title={disabledMembers ? NO_PERMISSION_MESSAGE : undefined}>{TEAM_ROLES.map((role) => <option key={role}>{role}</option>)}</select><input value={draft.display_name} onChange={(e) => setMembershipDrafts((prev) => ({ ...prev, [member.id]: { ...draft, display_name: e.target.value } }))} placeholder="display name" disabled={disabledMembers} title={disabledMembers ? NO_PERMISSION_MESSAGE : undefined} /><input value={draft.notes} onChange={(e) => setMembershipDrafts((prev) => ({ ...prev, [member.id]: { ...draft, notes: e.target.value } }))} placeholder="notes" disabled={disabledMembers} title={disabledMembers ? NO_PERMISSION_MESSAGE : undefined} /><div className="flex gap-1"><button type="button" className="border px-2" onClick={() => membershipUpdate.mutate({ teamId: team.id, user_id: member.id, role: draft.role, display_name: draft.display_name, notes: draft.notes })} disabled={disabledMembers} title={disabledMembers ? NO_PERMISSION_MESSAGE : undefined}>Mitglied bearbeiten</button><button type="button" className="border px-2" onClick={() => membershipDelete.mutate({ teamId: team.id, user_id: member.id })} disabled={disabledMembers} title={disabledMembers ? NO_PERMISSION_MESSAGE : undefined}>Mitglied entfernen</button></div></div>
            })}
          </div>
        })}
      </div>

      <div className="space-y-3 rounded border bg-white p-4"><h2 className="font-medium">Tasks</h2><form className="space-y-2" onSubmit={taskForm.handleSubmit((values) => taskCreate.mutate(values))}><input placeholder="Title" {...taskForm.register('title')} /><div className="grid grid-cols-2 gap-2"><select {...taskForm.register('status')}>{TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}</select><input type="number" min={1} max={5} placeholder="Priority 1-5" {...taskForm.register('priority')} /></div><div className="grid grid-cols-2 gap-2"><select {...taskForm.register('area_id')}><option value="">Select assigned area</option>{assignedAreas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select><select {...taskForm.register('assigned_team_id')}><option value="">Select assigned team</option>{assignedTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></div><button className="bg-slate-900 text-white disabled:opacity-50" type="submit" disabled={!can(campaign.can?.create_task)} title={!can(campaign.can?.create_task) ? NO_PERMISSION_MESSAGE : undefined}>Create task</button></form>{(tasksQuery.data?.data ?? []).map((task) => <div key={task.id} className="rounded border p-2 text-sm"><Link className="font-medium text-blue-600" to={`/tasks/${task.id}`}>{task.title}</Link><p>Status: {task.status} | Priority: {task.priority}</p><button type="button" className="mt-2 bg-red-600 text-white disabled:opacity-50" disabled={!can(task.can?.delete)} title={!can(task.can?.delete) ? NO_PERMISSION_MESSAGE : undefined} onClick={() => taskDeleteMutation.mutate(task.id)}>Delete</button></div>)}</div>
    </div>
  </section>
}
