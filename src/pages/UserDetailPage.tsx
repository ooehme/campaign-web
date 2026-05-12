import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { acceptTeamInvitation, declineTeamInvitation, deleteUser, getUser, listCurrentUserInvitations, listUserAssignments, listUserTeams } from '../api/endpoints'
import { useAuth } from '../auth/AuthContext'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import type { AssignmentStatus, TeamInvitation, TeamRole, UserAssignmentSummary } from '../types/models'
import { appRoleLabel } from '../utils/appRoles'
import { assignmentCampaignId, assignmentDueAt } from '../utils/assignment'
import { can, hasPermission, NO_PERMISSION_MESSAGE } from '../utils/permissions'
import { PERMISSIONS } from '../utils/permissionKeys'

const roleLabels: Record<TeamRole, string> = { lead: 'Teamleiter', member: 'Mitglied' }
const assignmentFilters: Array<{ key: 'all' | AssignmentStatus; label: string }> = [
  { key: 'all', label: 'alle' },
  { key: 'draft', label: 'Entwurf' },
  { key: 'active', label: 'aktiv' },
  { key: 'paused', label: 'pausiert' },
  { key: 'completed', label: 'abgeschlossen' },
  { key: 'cancelled', label: 'abgebrochen' },
]

export function UserDetailPage() {
  const { userId } = useParams()
  const id = Number(userId)
  const { user: currentUser } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [assignmentFilter, setAssignmentFilter] = useState<'all' | AssignmentStatus>('all')

  const userQuery = useQuery({ queryKey: ['user', id], queryFn: () => getUser(id), enabled: Number.isFinite(id), retry: false })
  const teamsQuery = useQuery({ queryKey: ['user', id, 'teams'], queryFn: () => listUserTeams(id), enabled: hasPermission(currentUser, PERMISSIONS.TEAMS_VIEW), retry: false })
  const assignmentsQuery = useQuery({ queryKey: ['assignments', 'user', id], queryFn: () => listUserAssignments(id), enabled: hasPermission(currentUser, PERMISSIONS.ASSIGNMENTS_VIEW), retry: false })

  const canViewInvitations = !!currentUser && currentUser.id === id
  const invitationsQuery = useQuery({ queryKey: ['user-invitations', id], queryFn: listCurrentUserInvitations, enabled: canViewInvitations, retry: false })
  const invitations = useMemo(() => (invitationsQuery.data ?? []).filter((inv: TeamInvitation) => inv.status === 'pending'), [invitationsQuery.data])

  const deleteMutation = useMutation({
    mutationFn: () => deleteUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['user', id] })
      navigate('/users')
    },
  })

  const invitationActionMutation = useMutation({
    mutationFn: ({ invitationId, action }: { invitationId: number; action: 'accept' | 'decline' }) =>
      action === 'accept' ? acceptTeamInvitation(invitationId) : declineTeamInvitation(invitationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-invitations'] })
      qc.invalidateQueries({ queryKey: ['user-invitations', id] })
      qc.invalidateQueries({ queryKey: ['user', id, 'teams'] })
      qc.invalidateQueries({ queryKey: ['auth', 'user'] })
      window.alert('Einladung wurde aktualisiert.')
    },
    onError: () => {
      window.alert('Einladung konnte nicht aktualisiert werden.')
    },
  })

  const handleInvitationAction = (invitation: TeamInvitation, action: 'accept' | 'decline') => {
    invitationActionMutation.mutate({ invitationId: invitation.id, action })
  }

  if (!Number.isFinite(id)) return <ErrorState message="Benutzer nicht gefunden." />
  if (userQuery.isLoading) return <LoadingState />
  if (userQuery.isError) {
    const err = userQuery.error as ApiError
    if (err.status === 401) return <Navigate to="/login" replace />
    if (err.status === 403) return <ErrorState title="Benutzer nicht freigegeben" message="Ihr Konto darf diesen Benutzer nicht anzeigen." actionLabel="Zur Benutzerliste" actionTo="/users" />
    if (err.status === 404) return <ErrorState message="Benutzer nicht gefunden." />
    return <ErrorState message="Serverfehler beim Laden des Benutzers." />
  }

  const user = userQuery.data
  if (!user) return <ErrorState message="Benutzer nicht gefunden." />

  const teams = teamsQuery.data ?? user.teams ?? []
  const campaigns = user.campaigns ?? []
  const assignments = (assignmentsQuery.data ?? []).filter((assignment) => assignmentFilter === 'all' || assignment.status === assignmentFilter)
  const assignmentSummary: UserAssignmentSummary = user.assignment_summary ?? { total: 0, draft: 0, active: 0, paused: 0, completed: 0, cancelled: 0 }

  return <section className="space-y-4">
    <Link to="/users" className="text-sm text-blue-600">Zurück zu Benutzer</Link>

    <div className="rounded border bg-white p-4 flex items-center justify-between">
      <div><h1 className="text-3xl font-semibold">{user.name}</h1><p>{user.email}</p><span className="rounded border px-2 py-0.5 text-xs">App-Rolle: {appRoleLabel(user.app_role)}</span></div>
      <div className="flex gap-2"><Link className={`border px-3 py-2 ${!can(user.can?.update) ? 'pointer-events-none opacity-50' : ''}`} title={!can(user.can?.update) ? NO_PERMISSION_MESSAGE : undefined} to={`/users/${id}/edit`}>Bearbeiten</Link><button className="bg-red-600 px-3 py-2 text-white disabled:opacity-50" disabled={!can(user.can?.delete)} title={!can(user.can?.delete) ? NO_PERMISSION_MESSAGE : undefined} onClick={() => window.confirm('Benutzer löschen?') && deleteMutation.mutate()}>Löschen</button></div>
    </div>

    <div className="rounded border bg-white p-4"><h2 className="font-medium">Profil</h2><p>ID: {user.id}</p><p>Erstellt: {user.created_at ?? 'nicht verfügbar'}</p><p>Aktualisiert: {user.updated_at ?? 'nicht verfügbar'}</p></div>
    <div className="rounded border bg-white p-4"><details><summary className="cursor-pointer font-medium">Teams ({teams.length})</summary><div className="mt-3 overflow-auto">{teams.length === 0 ? <EmptyState message="Dieser Benutzer ist noch keinem Team zugewiesen." /> : <table className="min-w-[640px] w-full text-sm"><thead><tr className="text-left"><th>Team</th><th>Rolle</th><th>Anzeigename</th><th>Notizen</th></tr></thead><tbody>{teams.map((t) => <tr key={t.id} className="border-t"><td><Link className="text-blue-600" to={`/teams/${t.id}`}>{t.name}</Link></td><td>{roleLabels[t.pivot?.role ?? 'member']}</td><td>{t.pivot?.display_name ?? '-'}</td><td>{t.pivot?.notes ?? '-'}</td></tr>)}</tbody></table>}</div></details></div>
    <div className="rounded border bg-white p-4"><details><summary className="cursor-pointer font-medium">Kampagnen ({campaigns.length})</summary><div className="mt-3">{campaigns.length === 0 ? <EmptyState message="Keine zugehörigen Kampagnen gefunden." /> : <ul>{campaigns.map((c) => <li key={c.id}><Link className="text-blue-600" to={`/campaigns/${c.id}`}>{c.name}</Link> ({c.status ?? '-'})</li>)}</ul>}</div></details></div>
    <div className="rounded border bg-white p-4"><h2 className="font-medium">Auftrags-Zusammenfassung</h2><ul><li>Entwurf: {assignmentSummary.draft}</li><li>aktiv: {assignmentSummary.active}</li><li>pausiert: {assignmentSummary.paused}</li><li>abgeschlossen: {assignmentSummary.completed}</li><li>abgebrochen: {assignmentSummary.cancelled}</li><li>gesamt: {assignmentSummary.total}</li></ul></div>

    <div className="rounded border bg-white p-4 space-y-2">
      <details>
        <summary className="cursor-pointer font-medium">Aufträge</summary>
        <div className="mt-3 space-y-2 overflow-auto">
          <Link className="text-sm text-blue-600" to={`/users/${id}/assignments`}>Alle Benutzer-Aufträge anzeigen</Link>
          <div className="flex gap-2 flex-wrap">{assignmentFilters.map((filter) => <button key={filter.key} className={`border px-2 py-1 text-xs ${assignmentFilter === filter.key ? 'bg-slate-900 text-white' : ''}`} onClick={() => setAssignmentFilter(filter.key)}>{filter.label}</button>)}</div>
          {assignmentsQuery.isLoading && <LoadingState />}
          {assignmentsQuery.isError && <p className="text-sm text-slate-600">Auftrags-Endpunkt derzeit nicht verfügbar.</p>}
          {!assignmentsQuery.isLoading && !assignmentsQuery.isError && assignments.length === 0 && <EmptyState message="Keine Aufträge gefunden." />}
          {assignments.length > 0 && <table className="min-w-[640px] w-full text-sm"><thead><tr className="text-left"><th>Titel</th><th>Status</th><th>Typ</th><th>Kampagne</th><th>Team</th><th>Fällig</th></tr></thead><tbody>{assignments.map((assignment) => <tr className="border-t" key={assignment.id}><td><Link className="text-blue-600" to={`/assignments/${assignment.id}`}>{assignment.title}</Link></td><td>{assignment.status}</td><td>{assignment.type}</td><td>{assignmentCampaignId(assignment) ?? '-'}</td><td>{assignment.team?.name ?? '-'}</td><td>{assignmentDueAt(assignment) ?? '-'}</td></tr>)}</tbody></table>}
        </div>
      </details>
    </div>

    <div className="rounded border bg-white p-4">
      <details>
        <summary className="cursor-pointer font-medium">Offene Einladungen ({invitations.length})</summary>
        <div className="mt-3 overflow-auto">
          {!canViewInvitations && <p className="text-sm text-slate-600">Einladungen sind nur im eigenen Profil verfügbar.</p>}
          {canViewInvitations && invitationsQuery.isError && <p className="text-sm text-slate-600">Einladungen-Endpunkt derzeit nicht verfügbar.</p>}
          {canViewInvitations && invitations.length === 0 ? <EmptyState message="Keine offenen Einladungen." /> : canViewInvitations && (
            <table className="min-w-[760px] w-full text-sm">
              <thead><tr className="text-left"><th>Team</th><th>Rolle</th><th>Eingeladen von</th><th>Läuft ab</th><th>Notizen</th><th>Aktionen</th></tr></thead>
              <tbody>{invitations.map((inv) => <tr key={inv.id} className="border-t"><td>{inv.team?.name ?? '-'}</td><td>{roleLabels[inv.role]}</td><td>{inv.invited_by_user?.name ?? '-'}</td><td>{inv.expires_at ?? '-'}</td><td>{inv.notes ?? '-'}</td><td><div className="flex flex-wrap gap-2"><button type="button" className="rounded bg-emerald-700 px-2 py-1 text-white disabled:opacity-50" disabled={inv.can?.accept === false || invitationActionMutation.isPending} onClick={() => handleInvitationAction(inv, 'accept')}>Annehmen</button><button type="button" className="rounded border border-red-300 px-2 py-1 text-red-700 disabled:opacity-50" disabled={inv.can?.decline === false || invitationActionMutation.isPending} onClick={() => handleInvitationAction(inv, 'decline')}>Zurückweisen</button></div></td></tr>)}</tbody>
            </table>
          )}
        </div>
      </details>
    </div>
  </section>
}
