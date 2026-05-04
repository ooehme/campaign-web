import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { deleteUser, getUser, listCurrentUserInvitations, listUserTasks, listUserTeams } from '../api/endpoints'
import { useAuth } from '../auth/AuthContext'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import type { TaskStatus, TeamInvitation, TeamRole, UserTaskSummary } from '../types/models'
import { can, hasPermission, NO_PERMISSION_MESSAGE } from '../utils/permissions'
import { PERMISSIONS } from '../utils/permissionKeys'

const roleLabels: Record<TeamRole, string> = { lead: 'Teamleiter', member: 'Mitglied' }
const taskFilters: Array<{ key: 'all' | TaskStatus; label: string }> = [
  { key: 'all', label: 'alle' },
  { key: 'open', label: 'offen' },
  { key: 'assigned', label: 'zugewiesen' },
  { key: 'in_progress', label: 'in Bearbeitung' },
  { key: 'done', label: 'erledigt' },
  { key: 'cancelled', label: 'abgebrochen' },
]

export function UserDetailPage() {
  const { userId } = useParams()
  const id = Number(userId)
  const { user: currentUser } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [taskFilter, setTaskFilter] = useState<'all' | TaskStatus>('all')

  const userQuery = useQuery({ queryKey: ['user', id], queryFn: () => getUser(id), enabled: Number.isFinite(id), retry: false })
  const teamsQuery = useQuery({ queryKey: ['user', id, 'teams'], queryFn: () => listUserTeams(id), enabled: hasPermission(userQuery.data, PERMISSIONS.TEAMS_VIEW), retry: false })
  const tasksQuery = useQuery({ queryKey: ['user', id, 'tasks', taskFilter], queryFn: () => listUserTasks(id, taskFilter === 'all' ? undefined : taskFilter), enabled: hasPermission(userQuery.data, PERMISSIONS.TASKS_VIEW), retry: false })

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

  if (!Number.isFinite(id)) return <ErrorState message="Benutzer nicht gefunden." />
  if (userQuery.isLoading) return <LoadingState />
  if (userQuery.isError) {
    const err = userQuery.error as ApiError
    if (err.status === 401) return <Navigate to="/login" replace />
    if (err.status === 403) return <ErrorState message="Keine Berechtigung für diese Aktion." />
    if (err.status === 404) return <ErrorState message="Benutzer nicht gefunden." />
    return <ErrorState message="Serverfehler beim Laden des Benutzers." />
  }

  const user = userQuery.data
  if (!user) return <ErrorState message="Benutzer nicht gefunden." />

  const teams = teamsQuery.data ?? user.teams ?? []
  const campaigns = user.campaigns ?? []
  const tasks = tasksQuery.data ?? []
  const taskSummary: UserTaskSummary = user.task_summary ?? { total: 0, open: 0, assigned: 0, in_progress: 0, done: 0, cancelled: 0 }

  return <section className="space-y-4">
    <Link to="/users" className="text-sm text-blue-600">← Zurück zu Benutzer</Link>

    <div className="rounded border bg-white p-4 flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-semibold">{user.name}</h1>
        <p>{user.email}</p>
        <span className="rounded border px-2 py-0.5 text-xs">Rolle: {user.app_role}</span>
      </div>
      <div className="flex gap-2">
        <Link className={`border px-3 py-2 ${!can(user.can?.update) ? 'pointer-events-none opacity-50' : ''}`} title={!can(user.can?.update) ? NO_PERMISSION_MESSAGE : undefined} to={`/users/${id}/edit`}>Bearbeiten</Link>
        <button className="bg-red-600 px-3 py-2 text-white disabled:opacity-50" disabled={!can(user.can?.delete)} title={!can(user.can?.delete) ? NO_PERMISSION_MESSAGE : undefined} onClick={() => window.confirm('Benutzer löschen?') && deleteMutation.mutate()}>Löschen</button>
      </div>
    </div>

    <div className="rounded border bg-white p-4">
      <h2 className="font-medium">Profil</h2>
      <p>ID: {user.id}</p><p>Name: {user.name}</p><p>E-Mail: {user.email}</p><p>Rolle: {user.app_role}</p>
      <p>Erstellt: {user.created_at ?? 'nicht verfügbar'}</p><p>Aktualisiert: {user.updated_at ?? 'nicht verfügbar'}</p>
    </div>

    <div className="rounded border bg-white p-4"><h2 className="font-medium">Teams</h2>{teams.length === 0 ? <EmptyState message="Dieser Benutzer ist noch keinem Team zugewiesen." /> : <table className="w-full text-sm"><thead><tr className="text-left"><th>Team</th><th>Rolle</th><th>Anzeigename</th><th>Notizen</th></tr></thead><tbody>{teams.map((t) => <tr key={t.id} className="border-t"><td><Link className="text-blue-600" to={`/teams/${t.id}`}>{t.name}</Link></td><td>{roleLabels[t.pivot?.role ?? 'member']}</td><td>{t.pivot?.display_name ?? '-'}</td><td>{t.pivot?.notes ?? '-'}</td></tr>)}</tbody></table>}</div>
    <div className="rounded border bg-white p-4"><h2 className="font-medium">Kampagnen</h2>{campaigns.length === 0 ? <EmptyState message="Keine zugehörigen Kampagnen gefunden." /> : <ul>{campaigns.map((c) => <li key={c.id}><Link className="text-blue-600" to={`/campaigns/${c.id}`}>{c.name}</Link> ({c.status ?? '-'})</li>)}</ul>}</div>
    <div className="rounded border bg-white p-4"><h2 className="font-medium">Aufgaben-Zusammenfassung</h2><ul><li>offen: {taskSummary.open}</li><li>zugewiesen: {taskSummary.assigned}</li><li>in Bearbeitung: {taskSummary.in_progress}</li><li>erledigt: {taskSummary.done}</li><li>abgebrochen: {taskSummary.cancelled}</li><li>gesamt: {taskSummary.total}</li></ul></div>

    <div className="rounded border bg-white p-4 space-y-2"><h2 className="font-medium">Aufgaben</h2><div className="flex gap-2 flex-wrap">{taskFilters.map((f) => <button key={f.key} className={`border px-2 py-1 text-xs ${taskFilter === f.key ? 'bg-slate-900 text-white' : ''}`} onClick={() => setTaskFilter(f.key)}>{f.label}</button>)}</div>{tasksQuery.isLoading && <LoadingState />}{tasksQuery.isError && <p className="text-sm text-slate-600">Aufgaben-Endpunkt derzeit nicht verfügbar.</p>}{!tasksQuery.isLoading && !tasksQuery.isError && tasks.length === 0 && <EmptyState message="Keine Aufgaben gefunden." />}{tasks.length > 0 && <table className="w-full text-sm"><thead><tr className="text-left"><th>Titel</th><th>Status</th><th>Priorität</th><th>Kampagne</th><th>Team</th><th>Fällig</th></tr></thead><tbody>{tasks.map((task) => <tr className="border-t" key={task.id}><td><Link className="text-blue-600" to={`/tasks/${task.id}`}>{task.title}</Link></td><td>{task.status}</td><td>{task.priority}</td><td>{task.campaign_id}</td><td>{task.assigned_team?.name ?? '-'}</td><td>{task.due_at ?? '-'}</td></tr>)}</tbody></table>}</div>

    <div className="rounded border bg-white p-4"><h2 className="font-medium">Offene Einladungen</h2>{!canViewInvitations && <p className="text-sm text-slate-600">Einladungen sind nur im eigenen Profil verfügbar.</p>}{canViewInvitations && invitationsQuery.isError && <p className="text-sm text-slate-600">Einladungen-Endpunkt derzeit nicht verfügbar.</p>}{canViewInvitations && invitations.length === 0 ? <EmptyState message="Keine offenen Einladungen." /> : canViewInvitations && <table className="w-full text-sm"><thead><tr className="text-left"><th>Team</th><th>Rolle</th><th>Eingeladen von</th><th>Läuft ab</th><th>Notizen</th><th>Aktionen</th></tr></thead><tbody>{invitations.map((inv) => <tr key={inv.id} className="border-t"><td>{inv.team?.name ?? '-'}</td><td>{roleLabels[inv.role]}</td><td>{inv.invited_by_user?.name ?? '-'}</td><td>{inv.expires_at ?? '-'}</td><td>{inv.notes ?? '-'}</td><td><span className="text-xs text-slate-600">Antwort nur im campaign-core Backend-Workflow möglich.</span></td></tr>)}</tbody></table>}</div>
  </section>
}
