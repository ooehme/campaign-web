import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { addUserToTeam, deleteTeam, getTeam, listUsers, removeUserFromTeam, updateTeam, updateTeamUser } from '../api/endpoints'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import type { TeamMembership, TeamRole, User } from '../types/models'
import { can, NO_PERMISSION_MESSAGE } from '../utils/permissions'

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
  const [success, setSuccess] = useState('')
  const [memberError, setMemberError] = useState('')
  const [selectedUser, setSelectedUser] = useState('')
  const [role, setRole] = useState<TeamRole>('member')
  const [displayName, setDisplayName] = useState('')
  const [notes, setNotes] = useState('')

  const teamQuery = useQuery({ queryKey: ['team', id], queryFn: () => getTeam(id), enabled: Number.isFinite(id) })
  const usersQuery = useQuery({ queryKey: ['users'], queryFn: () => listUsers({ per_page: 100 }), retry: false })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['team', id] })
    qc.invalidateQueries({ queryKey: ['team-members', id] })
    qc.invalidateQueries({ queryKey: ['campaign-teams'] })
    qc.invalidateQueries({ queryKey: ['teams-pool'] })
  }

  const addMutation = useMutation({
    mutationFn: () => addUserToTeam(id, { user_id: Number(selectedUser), role, display_name: displayName || undefined, notes: notes || undefined }),
    onSuccess: () => {
      invalidate(); setSuccess('Mitglied wurde zugewiesen.'); setMemberError('');
      setSelectedUser(''); setDisplayName(''); setNotes(''); setRole('member')
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 422) setMemberError('Benutzer ist bereits Mitglied in diesem Team.')
      else setMemberError(error instanceof Error ? error.message : 'Mitglied konnte nicht zugewiesen werden.')
    },
  })

  const updateMember = useMutation({ mutationFn: ({ userId, payload }: { userId: number; payload: { role: TeamRole; display_name?: string; notes?: string } }) => updateTeamUser(id, userId, payload), onSuccess: () => { invalidate(); setSuccess('Mitglied wurde bearbeitet.') } })
  const removeMember = useMutation({ mutationFn: (userId: number) => removeUserFromTeam(id, userId), onSuccess: () => { invalidate(); setSuccess('Mitglied wurde entfernt.') } })

  if (teamQuery.isLoading) return <LoadingState />
  if (teamQuery.isError || !teamQuery.data) return <ErrorState message="Team konnte nicht geladen werden." />

  const team = teamQuery.data as Record<string, unknown>
  const members = normalizeMembers(team)
  const canManageMembers = can((team.can as Record<string, unknown> | undefined)?.manage_members as boolean | undefined)
  const canUpdateTeam = can((team.can as Record<string, unknown> | undefined)?.update as boolean | undefined)
  const canDeleteTeam = can((team.can as Record<string, unknown> | undefined)?.delete as boolean | undefined)
  const usersForbidden = usersQuery.isError && usersQuery.error instanceof ApiError && usersQuery.error.status === 403

  return <section className="space-y-4">
    <Link to="/teams" className="text-sm text-blue-600">← Zurück zu Teams</Link>
    <h1 className="text-3xl font-semibold">{String(team.name)}</h1>
    {success && <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">{success}</p>}

    <div className="rounded border bg-white p-4"><h2 className="font-medium">Team overview</h2><p>ID: {String(team.id)}</p></div>

    {Array.isArray(team.campaigns) && <div className="rounded border bg-white p-4"><h2 className="font-medium">Zugewiesene Kampagnen</h2>{(team.campaigns as Array<Record<string, unknown>>).map((c) => <p key={String(c.id)}>{String(c.name ?? c.id)}</p>)}</div>}

    <div className="rounded border bg-white p-4 space-y-3">
      <h2 className="font-medium">Mitglieder</h2>
      {members.length === 0 && <EmptyState message="Noch keine Mitglieder vorhanden." />}
      {members.length > 0 && <div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th>Benutzer</th><th>E-Mail</th><th>Rolle</th><th>Anzeigename</th><th>Notizen</th><th>Aktionen</th></tr></thead><tbody>
        {members.map((member) => <tr key={member.user.id} className="border-t"><td>{member.user.name}</td><td>{member.user.email}</td><td><span className="rounded border px-2 py-0.5 text-xs">Team-Rolle: {member.role}</span></td><td>{member.display_name ?? '-'}</td><td>{member.notes ?? '-'}</td><td className="py-2"><button className="border disabled:opacity-50" disabled={!canManageMembers} title={!canManageMembers ? NO_PERMISSION_MESSAGE : undefined} onClick={() => {
          const nextRole = (window.prompt('Rolle (member/lead/admin)', member.role) ?? member.role) as TeamRole
          const nextDisplayName = window.prompt('Anzeigename', member.display_name ?? '') ?? ''
          const nextNotes = window.prompt('Notizen', member.notes ?? '') ?? ''
          updateMember.mutate({ userId: member.user.id, payload: { role: nextRole, display_name: nextDisplayName || undefined, notes: nextNotes || undefined } })
        }}>Mitglied bearbeiten</button><button className="ml-2 bg-red-600 text-white disabled:opacity-50" disabled={!canManageMembers} title={!canManageMembers ? NO_PERMISSION_MESSAGE : undefined} onClick={() => window.confirm('Mitglied entfernen?') && removeMember.mutate(member.user.id)}>Mitglied entfernen</button></td></tr>)}
      </tbody></table></div>}
      {!canManageMembers && <p className="text-sm text-amber-700">Keine Berechtigung für diese Aktion.</p>}
    </div>

    <div className="rounded border bg-white p-4 space-y-2">
      <h2 className="font-medium">Benutzer dem Team zuweisen</h2>
      {usersForbidden && <p className="text-sm text-red-700">Keine Berechtigung, Benutzer zu laden.</p>}
      <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} disabled={usersForbidden || !canManageMembers}>
        <option value="">Benutzer auswählen</option>
        {(usersQuery.data?.data ?? []).map((u: User) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
      </select>
      <select value={role} onChange={(e) => setRole(e.target.value as TeamRole)} disabled={!canManageMembers}><option value="member">member</option><option value="lead">lead</option><option value="admin">admin</option></select>
      <input placeholder="Anzeigename (optional)" value={displayName} onChange={(e) => setDisplayName(e.target.value)} disabled={!canManageMembers} />
      <input placeholder="Notizen (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canManageMembers} />
      <button className="border disabled:opacity-50" disabled={!canManageMembers || !selectedUser} title={!canManageMembers ? NO_PERMISSION_MESSAGE : undefined} onClick={() => addMutation.mutate()}>zuweisen</button>
      {!canManageMembers && <p className="text-sm text-amber-700">Keine Berechtigung für diese Aktion.</p>}
      {memberError && <p className="text-sm text-red-700">{memberError}</p>}
    </div>

    <div className="rounded border bg-white p-4 space-y-2">
      <h2 className="font-medium">Team bearbeiten</h2>
      {!canUpdateTeam && <p className="text-sm text-amber-700">Keine Berechtigung für diese Aktion.</p>}
      <button className="border disabled:opacity-50" disabled={!canUpdateTeam} onClick={() => {
        const nextName = window.prompt('Teamname', String(team.name))
        if (!nextName) return
        updateTeam(id, { name: nextName }).then(() => { invalidate(); setSuccess('Team wurde aktualisiert.') })
      }}>bearbeiten</button>
      <button className="bg-red-600 text-white disabled:opacity-50" disabled={!canDeleteTeam} onClick={() => window.confirm('Team löschen?') && deleteTeam(id).then(() => { qc.invalidateQueries({ queryKey: ['teams-pool'] }); setSuccess('Team wurde gelöscht.') })}>entfernen</button>
    </div>
  </section>
}
