import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { deleteTeam, detachTeamFromCampaign, getTeam, listTeamAssignments } from '../api/endpoints'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import type { Campaign, Team, TeamMembership, TeamRole } from '../types/models'
import { assignmentDueAt } from '../utils/assignment'
import { can, NO_PERMISSION_MESSAGE } from '../utils/permissions'

const roleLabel: Record<TeamRole, string> = { lead: 'Teamleiter', member: 'Mitglied' }

const normalizeMembers = (team: Team): TeamMembership[] => {
  const members = (team.members as unknown[] | undefined) ?? team.users ?? []
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
  const assignedCampaigns = Array.isArray(teamQuery.data?.campaigns) ? (teamQuery.data.campaigns as Campaign[]) : null
  const assignmentsQuery = useQuery({ queryKey: ['assignments', 'team', id], queryFn: () => listTeamAssignments(id, { per_page: 100 }), enabled: Number.isFinite(id) })

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
    if (error.status === 403) return <ErrorState title="Team nicht freigegeben" message="Ihr Konto darf dieses Team nicht anzeigen." actionLabel="Zur Teamliste" actionTo="/teams" />
    return <ErrorState message="Serverfehler beim Laden oder Speichern des Teams." />
  }

  const team = teamQuery.data as Team
  const members = normalizeMembers(team)
  const leads = members.filter((m) => m.role === 'lead')
  const canUpdateTeam = can(team.can?.update)
  const canDeleteTeam = can(team.can?.delete)
  const canDetach = can(team.can?.detach_from_campaign)
  const assignmentSummary = team.assigned_assignment_summary
  const assignments = assignmentsQuery.data?.data ?? []

  return <section className="space-y-4">
    <Link to="/teams" className="text-sm text-blue-600">Zurück zu Teams</Link>
    <div className="rounded border bg-white p-4 flex items-center justify-between">
      <h1 className="text-3xl font-semibold">{team.name ?? '-'}</h1>
      <div className="flex gap-2">
        <Link className={`border px-3 py-2 ${!canUpdateTeam ? 'pointer-events-none opacity-50' : ''}`} title={!canUpdateTeam ? NO_PERMISSION_MESSAGE : undefined} to={`/teams/${id}/edit`}>Team bearbeiten</Link>
        <button className="bg-red-600 text-white disabled:opacity-50 px-3 py-2" disabled={!canDeleteTeam} title={!canDeleteTeam ? NO_PERMISSION_MESSAGE : undefined} onClick={() => window.confirm('Team löschen?') && deleteMutation.mutate()}>Team löschen</button>
      </div>
    </div>
    {success && <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">{success}</p>}

    <div className="rounded border bg-white p-4"><h2 className="font-medium">Team-Übersicht</h2><p>ID: {team.id}</p><p>Erstellt: {team.created_at ?? 'nicht verfügbar'}</p><p>Aktualisiert: {team.updated_at ?? 'nicht verfügbar'}</p></div>

    <div className="rounded border bg-white p-4 space-y-2">
      <details>
        <summary className="cursor-pointer font-medium">Mitglieder ({members.length})</summary>
        <div className="mt-3 space-y-2">
          {members.length === 0 && <EmptyState message="Noch keine Mitglieder im Team." />}
          {leads.length === 0 && <p className="text-sm text-amber-700">Kein Teamleiter zugewiesen.</p>}
          {members.length > 0 && <div className="overflow-auto"><table className="min-w-[640px] w-full text-sm"><thead><tr className="text-left"><th>Benutzer</th><th>E-Mail</th><th>Rolle</th><th>Anzeigename</th><th>Notizen</th></tr></thead><tbody>{members.map((member) => <tr key={member.user.id} className="border-t"><td>{member.user.name} {member.role === 'lead' && <span className="ml-1 rounded bg-amber-100 px-2 py-0.5 text-xs">Teamleiter</span>}</td><td>{member.user.email}</td><td><span className="rounded border px-2 py-0.5 text-xs">{roleLabel[member.role]}</span></td><td>{member.display_name ?? '-'}</td><td>{member.notes ?? '-'}</td></tr>)}</tbody></table></div>}
        </div>
      </details>
    </div>

    <div className="rounded border bg-white p-4 space-y-2"><h2 className="font-medium">Zugewiesene Kampagnen</h2>
      {assignedCampaigns === null && <EmptyState message="Dieses Team ist noch keiner Kampagne zugewiesen." />}
      {assignedCampaigns?.length === 0 && <EmptyState message="Dieses Team ist noch keiner Kampagne zugewiesen." />}
      {assignedCampaigns && assignedCampaigns.length > 0 && assignedCampaigns.map((campaign) => <div key={campaign.id} className="flex items-center justify-between border rounded p-2"><Link className="text-blue-600" to={`/campaigns/${campaign.id}`}>{campaign.name}</Link><span>{campaign.status ?? '-'}</span><button className="border disabled:opacity-50 px-2 py-1" disabled={!canDetach} title={!canDetach ? NO_PERMISSION_MESSAGE : undefined} onClick={() => detachMutation.mutate(campaign.id)}>Trennen</button></div>)}
    </div>

    <div className="rounded border bg-white p-4 space-y-2">
      <h2 className="font-medium">Auftrags-Zusammenfassung</h2>
      {!assignmentSummary && <EmptyState message="Keine Auftrags-Zusammenfassung verfügbar." />}
      {assignmentSummary && <ul className="text-sm space-y-1"><li>total: {assignmentSummary.total ?? 0}</li><li>draft: {assignmentSummary.draft ?? 0}</li><li>active: {assignmentSummary.active ?? 0}</li><li>paused: {assignmentSummary.paused ?? 0}</li><li>completed: {assignmentSummary.completed ?? 0}</li><li>cancelled: {assignmentSummary.cancelled ?? 0}</li></ul>}
    </div>

    <div className="rounded border bg-white p-4 space-y-2">
      <details>
        <summary className="cursor-pointer font-medium">Zugehörige Aufträge</summary>
        <div className="mt-3 space-y-2">
          <Link className="text-sm text-blue-600" to={`/teams/${id}/assignments`}>Alle Team-Aufträge anzeigen</Link>
          {assignmentsQuery.isLoading && <LoadingState />}
          {!assignmentsQuery.isLoading && assignments.length === 0 && <EmptyState message="Keine Aufträge für dieses Team gefunden." />}
          {assignments.length > 0 && <div className="overflow-auto"><table className="min-w-[640px] w-full text-sm"><thead><tr className="text-left"><th>Titel</th><th>Status</th><th>Typ</th><th>Fällig</th></tr></thead><tbody>{assignments.map((assignment) => <tr key={assignment.id} className="border-t"><td><Link className="text-blue-600" to={`/assignments/${assignment.id}`}>{assignment.title}</Link></td><td>{assignment.status}</td><td>{assignment.type}</td><td>{assignmentDueAt(assignment) ?? '-'}</td></tr>)}</tbody></table></div>}
        </div>
      </details>
    </div>
  </section>
}
