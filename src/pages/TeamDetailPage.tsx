import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { deleteTeam, detachTeamFromCampaign, getTeam, listCampaignTasks, listCampaigns } from '../api/endpoints'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import type { Campaign, Task, TeamMembership, TeamRole } from '../types/models'
import { can, NO_PERMISSION_MESSAGE } from '../utils/permissions'

const roleLabel: Record<TeamRole, string> = { admin: 'Team-Admin', lead: 'Teamleiter', member: 'Mitglied' }

const normalizeMembers = (team: Record<string, unknown>): TeamMembership[] => {
  const members = (team.members as unknown[]) ?? (team.users as unknown[]) ?? []
  return members.map((item) => {
    const row = item as Record<string, unknown>
    const pivot = (row.pivot as Record<string, unknown> | undefined) ?? row
    return {
      user: { id: Number(row.id), name: String(row.name ?? '-'), email: String(row.email ?? '-') },
      role: String(pivot.role ?? 'member') as TeamRole,
      display_name: (pivot.display_name as string | null | undefined) ?? null,
      notes: (pivot.notes as string | null | undefined) ?? null,
    }
  })
}

export function TeamDetailPage() {
  const { teamId } = useParams()
  const id = Number(teamId)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [success, setSuccess] = useState('')
  const teamQuery = useQuery({ queryKey: ['team', id], queryFn: () => getTeam(id), enabled: Number.isFinite(id) })
  const campaignsQuery = useQuery({ queryKey: ['campaigns'], queryFn: () => listCampaigns({ per_page: 100 }) })

  const assignedCampaigns = useMemo(() => {
    const team = teamQuery.data as Record<string, unknown> | undefined
    if (!team) return null
    if (Array.isArray(team.campaigns)) return team.campaigns as Campaign[]
    if (!campaignsQuery.data) return null
    return campaignsQuery.data.data.filter((campaign) => Array.isArray(campaign.teams) && (campaign.teams as Array<Record<string, unknown>>).some((t) => Number(t.id) === id))
  }, [teamQuery.data, campaignsQuery.data, id])

  const tasksQuery = useQuery({
    queryKey: ['team-related-tasks', id, assignedCampaigns?.map((c) => c.id).join(',')],
    enabled: Array.isArray(assignedCampaigns) && assignedCampaigns.length > 0,
    queryFn: async () => {
      const rows = await Promise.all(assignedCampaigns!.slice(0, 10).map((campaign) => listCampaignTasks(campaign.id, { per_page: 100 })))
      return rows.flatMap((resp) => resp.data).filter((task) => Number(task.assigned_team_id) === id)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteTeam(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams-pool'] })
      navigate('/teams')
    },
  })

  const detachMutation = useMutation({ mutationFn: (campaignId: number) => detachTeamFromCampaign(campaignId, id), onSuccess: () => { setSuccess('Team wurde von Kampagne entfernt.'); teamQuery.refetch() } })

  if (teamQuery.isLoading) return <LoadingState />
  if (teamQuery.isError) {
    const error = teamQuery.error as ApiError
    if (error.status === 404) return <ErrorState message="Team nicht gefunden." />
    if (error.status === 403) return <ErrorState message="Keine Berechtigung für diese Aktion." />
    return <ErrorState message="Serverfehler beim Laden oder Speichern des Teams." />
  }

  const team = teamQuery.data as Record<string, unknown>
  const members = normalizeMembers(team)
  const leads = members.filter((m) => m.role === 'lead')
  const canUpdateTeam = can((team.can as Record<string, unknown> | undefined)?.update as boolean | undefined)
  const canDeleteTeam = can((team.can as Record<string, unknown> | undefined)?.delete as boolean | undefined)
  const canDetach = can((team.can as Record<string, unknown> | undefined)?.detach_from_campaign as boolean | undefined)

  return <section className="space-y-4">
    <Link to="/teams" className="text-sm text-blue-600">← Zurück zu Teams</Link>
    <div className="rounded border bg-white p-4 flex items-center justify-between">
      <h1 className="text-3xl font-semibold">{String(team.name)}</h1>
      <div className="flex gap-2">
        <Link className={`border px-3 py-2 ${!canUpdateTeam ? 'pointer-events-none opacity-50' : ''}`} title={!canUpdateTeam ? NO_PERMISSION_MESSAGE : undefined} to={`/teams/${id}/edit`}>Team bearbeiten</Link>
        <button className="bg-red-600 text-white disabled:opacity-50 px-3 py-2" disabled={!canDeleteTeam} title={!canDeleteTeam ? NO_PERMISSION_MESSAGE : undefined} onClick={() => window.confirm('Team löschen?') && deleteMutation.mutate()}>Team löschen</button>
      </div>
    </div>
    {success && <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">{success}</p>}

    <div className="rounded border bg-white p-4"><h2 className="font-medium">Team-Übersicht</h2><p>ID: {String(team.id)}</p><p>Name: {String(team.name)}</p><p>Erstellt: {String(team.created_at ?? 'nicht verfügbar')}</p><p>Aktualisiert: {String(team.updated_at ?? 'nicht verfügbar')}</p></div>

    <div className="rounded border bg-white p-4 space-y-2">
      <h2 className="font-medium">Mitglieder</h2>
      {members.length === 0 && <EmptyState message="Noch keine Mitglieder im Team." />}
      {leads.length === 0 && <p className="text-sm text-amber-700">Kein Teamleiter zugewiesen.</p>}
      {members.length > 0 && <div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th>Benutzer</th><th>E-Mail</th><th>Rolle</th><th>Anzeigename</th><th>Notizen</th><th>Aktionen</th></tr></thead><tbody>{members.map((member) => <tr key={member.user.id} className="border-t"><td>{member.user.name} {member.role === 'lead' && <span className="ml-1 rounded bg-amber-100 px-2 py-0.5 text-xs">Teamleiter</span>}</td><td>{member.user.email}</td><td><span className="rounded border px-2 py-0.5 text-xs">{roleLabel[member.role]}</span></td><td>{member.display_name ?? '-'}</td><td>{member.notes ?? '-'}</td><td><Link to={`/teams/${id}/edit`} className="border px-2 py-1 text-xs">Mitglied bearbeiten</Link><Link to={`/teams/${id}/edit`} className="ml-2 border px-2 py-1 text-xs">Mitglied entfernen</Link></td></tr>)}</tbody></table></div>}
    </div>

    <div className="rounded border bg-white p-4 space-y-2"><h2 className="font-medium">Zugewiesene Kampagnen</h2>
      {assignedCampaigns === null && <p className="text-sm text-slate-600">Zugewiesene Kampagnen werden von der API noch nicht auf dieser Team-Detailseite bereitgestellt.</p>}
      {assignedCampaigns?.length === 0 && <EmptyState message="Dieses Team ist noch keiner Kampagne zugewiesen." />}
      {assignedCampaigns && assignedCampaigns.length > 0 && assignedCampaigns.map((campaign) => <div key={campaign.id} className="flex items-center justify-between border rounded p-2"><Link className="text-blue-600" to={`/campaigns/${campaign.id}`}>{campaign.name}</Link><span>{campaign.status ?? '-'}</span><button className="border disabled:opacity-50 px-2 py-1" disabled={!canDetach} title={!canDetach ? NO_PERMISSION_MESSAGE : undefined} onClick={() => detachMutation.mutate(campaign.id)}>Trennen</button></div>)}
    </div>

    <div className="rounded border bg-white p-4 space-y-2"><h2 className="font-medium">Offene / zugehörige Aufträge</h2>
      {Array.isArray(assignedCampaigns) && assignedCampaigns.length > 10 && <p className="text-sm text-slate-600">Es werden maximal 10 Kampagnen berücksichtigt, um unnötige API-Aufrufe zu vermeiden.</p>}
      {tasksQuery.isLoading && <LoadingState />}
      {!tasksQuery.isLoading && assignedCampaigns === null && <p className="text-sm text-slate-600">Aufträge für dieses Team können mit der aktuellen API noch nicht direkt geladen werden.</p>}
      {!tasksQuery.isLoading && tasksQuery.data?.length === 0 && <EmptyState message="Keine offenen Aufträge für dieses Team gefunden." />}
      {tasksQuery.data && tasksQuery.data.length > 0 && <div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th>Titel</th><th>Status</th><th>Priorität</th><th>Kampagne</th><th>Fällig</th></tr></thead><tbody>{tasksQuery.data.map((task: Task) => <tr key={task.id} className="border-t"><td><Link className="text-blue-600" to={`/tasks/${task.id}`}>{task.title}</Link></td><td>{task.status}</td><td>{task.priority}</td><td>{assignedCampaigns?.find((c) => c.id === task.campaign_id)?.name ?? task.campaign_id}</td><td>{task.due_at ?? '-'}</td></tr>)}</tbody></table></div>}
    </div>
  </section>
}
