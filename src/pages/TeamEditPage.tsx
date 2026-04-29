import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { addUserToTeam, deleteTeam, detachTeamFromCampaign, getTeam, listUsers, removeUserFromTeam, updateTeam, updateTeamUser } from '../api/endpoints'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import type { Campaign, TeamMembership, TeamRole, User } from '../types/models'
import { can, NO_PERMISSION_MESSAGE } from '../utils/permissions'

type MemberDraft = { role: TeamRole; display_name: string; notes: string }

const normalizeMembers = (team: Record<string, unknown>): TeamMembership[] => (((team.members as unknown[]) ?? (team.users as unknown[]) ?? []) as Array<Record<string, unknown>>).map((row) => {
  const pivot = (row.pivot as Record<string, unknown> | undefined) ?? row
  return { user: { id: Number(row.id), name: String(row.name ?? '-'), email: String(row.email ?? '-') }, role: String(pivot.role ?? 'member') as TeamRole, display_name: (pivot.display_name as string | null | undefined) ?? null, notes: (pivot.notes as string | null | undefined) ?? null }
})

export function TeamEditPage() {
  const { teamId } = useParams()
  const id = Number(teamId)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [success, setSuccess] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [name, setName] = useState('')
  const [selectedUser, setSelectedUser] = useState('')
  const [role, setRole] = useState<TeamRole>('member')
  const [displayName, setDisplayName] = useState('')
  const [notes, setNotes] = useState('')
  const [validation, setValidation] = useState<Record<string, string[]>>({})
  const [memberDrafts, setMemberDrafts] = useState<Record<number, MemberDraft>>({})

  const teamQuery = useQuery({ queryKey: ['team', id], queryFn: () => getTeam(id), enabled: Number.isFinite(id) })
  const usersQuery = useQuery({ queryKey: ['users'], queryFn: () => listUsers({ per_page: 100 }), retry: false })
  const team = teamQuery.data as Record<string, unknown> | undefined
  const members = useMemo(() => (team ? normalizeMembers(team) : []), [team])
  const campaigns = (team?.campaigns as Campaign[] | undefined) ?? null

  useEffect(() => {
    if (!team) return
    setName(String(team.name ?? ''))
    const drafts: Record<number, MemberDraft> = {}
    normalizeMembers(team).forEach((member) => {
      drafts[member.user.id] = { role: member.role, display_name: member.display_name ?? '', notes: member.notes ?? '' }
    })
    setMemberDrafts(drafts)
  }, [team?.id])

  const refetchAll = () => { qc.invalidateQueries({ queryKey: ['team', id] }); qc.invalidateQueries({ queryKey: ['teams-pool'] }) }
  const applyApiError = (error: unknown) => {
    const apiError = error as ApiError
    if (apiError?.status === 403) setErrorMessage('Keine Berechtigung für diese Aktion.')
    else if (apiError?.status >= 500) setErrorMessage('Serverfehler beim Laden oder Speichern des Teams.')
    else setErrorMessage(apiError instanceof Error ? apiError.message : 'Unbekannter Fehler.')
  }

  const saveTeam = useMutation({ mutationFn: () => updateTeam(id, { name }), onSuccess: () => { setSuccess('Team wurde aktualisiert.'); setValidation({}); setErrorMessage(''); refetchAll() }, onError: (e) => { const err = e as ApiError; if (err.status === 422) setValidation((err.details as { errors?: Record<string, string[]> })?.errors ?? {}); else applyApiError(e) } })
  const addMember = useMutation({ mutationFn: () => addUserToTeam(id, { user_id: Number(selectedUser), role, display_name: displayName || undefined, notes: notes || undefined }), onSuccess: () => { setSuccess('Benutzer dem Team zugewiesen.'); setErrorMessage(''); setSelectedUser(''); setRole('member'); setDisplayName(''); setNotes(''); refetchAll() }, onError: applyApiError })
  const updateMember = useMutation({ mutationFn: ({ userId, payload }: { userId: number; payload: { role: TeamRole; display_name?: string; notes?: string } }) => updateTeamUser(id, userId, payload), onSuccess: () => { setSuccess('Mitglied bearbeiten erfolgreich.'); setErrorMessage(''); refetchAll() }, onError: applyApiError })
  const removeMember = useMutation({ mutationFn: (userId: number) => removeUserFromTeam(id, userId), onSuccess: () => { setSuccess('Mitglied entfernen erfolgreich.'); setErrorMessage(''); refetchAll() }, onError: applyApiError })
  const detachCampaign = useMutation({ mutationFn: (campaignId: number) => detachTeamFromCampaign(campaignId, id), onSuccess: () => { setSuccess('Team von Kampagne getrennt.'); setErrorMessage(''); refetchAll() }, onError: applyApiError })
  const deleteMutation = useMutation({ mutationFn: () => deleteTeam(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams-pool'] }); navigate('/teams') }, onError: applyApiError })

  if (teamQuery.isLoading) return <LoadingState />
  if (teamQuery.isError || !team) {
    const error = teamQuery.error as ApiError
    if (error?.status === 404) return <ErrorState message="Team nicht gefunden." />
    if (error?.status === 403) return <ErrorState message="Keine Berechtigung für diese Aktion." />
    return <ErrorState message="Serverfehler beim Laden oder Speichern des Teams." />
  }

  const canUpdate = can((team.can as Record<string, unknown> | undefined)?.update as boolean | undefined)
  const canManage = can((team.can as Record<string, unknown> | undefined)?.manage_members as boolean | undefined)
  const canDelete = can((team.can as Record<string, unknown> | undefined)?.delete as boolean | undefined)
  const canDetach = can((team.can as Record<string, unknown> | undefined)?.detach_from_campaign as boolean | undefined)

  return <section className="space-y-4">
    <Link to={`/teams/${id}`} className="text-sm text-blue-600">← Zurück zur Team-Detailseite</Link>
    <h1 className="text-2xl font-semibold">Team bearbeiten</h1>
    {success && <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">{success}</p>}
    {errorMessage && <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{errorMessage}</p>}

    <div className="rounded border bg-white p-4 space-y-2"><h2 className="font-medium">Basisdaten</h2>
      <label className="text-sm">Teamname *</label><input value={name} onChange={(e) => setName(e.target.value)} disabled={!canUpdate} />
      {validation.name?.map((message) => <p className="text-sm text-red-700" key={message}>{message}</p>)}
      {!canUpdate && <p className="text-sm text-amber-700">Keine Berechtigung für diese Aktion.</p>}
      <div className="flex gap-2"><button className="border px-3 py-2 disabled:opacity-50" disabled={!canUpdate} title={!canUpdate ? NO_PERMISSION_MESSAGE : undefined} onClick={() => saveTeam.mutate()}>Speichern</button><Link to={`/teams/${id}`} className="border px-3 py-2">Abbrechen</Link></div>
    </div>

    <div className="rounded border bg-white p-4 space-y-2"><h2 className="font-medium">Mitglieder verwalten</h2>
      {members.length === 0 && <EmptyState message="Noch keine Mitglieder im Team." />}
      {members.length > 0 && <table className="w-full text-sm"><thead><tr className="text-left"><th>Benutzer</th><th>Rolle</th><th>Anzeigename</th><th>Notizen</th><th>Aktionen</th></tr></thead><tbody>{members.map((member) => <tr key={member.user.id} className="border-t"><td>{member.user.name}<br /><span className="text-xs text-slate-500">{member.user.email}</span></td><td><select value={memberDrafts[member.user.id]?.role ?? member.role} onChange={(e) => setMemberDrafts((prev) => ({ ...prev, [member.user.id]: { ...(prev[member.user.id] ?? { role: member.role, display_name: member.display_name ?? '', notes: member.notes ?? '' }), role: e.target.value as TeamRole } }))} disabled={!canManage}><option value="member">member</option><option value="lead">lead</option><option value="admin">admin</option></select></td><td><input value={memberDrafts[member.user.id]?.display_name ?? member.display_name ?? ''} onChange={(e) => setMemberDrafts((prev) => ({ ...prev, [member.user.id]: { ...(prev[member.user.id] ?? { role: member.role, display_name: member.display_name ?? '', notes: member.notes ?? '' }), display_name: e.target.value } }))} disabled={!canManage} /></td><td><input value={memberDrafts[member.user.id]?.notes ?? member.notes ?? ''} onChange={(e) => setMemberDrafts((prev) => ({ ...prev, [member.user.id]: { ...(prev[member.user.id] ?? { role: member.role, display_name: member.display_name ?? '', notes: member.notes ?? '' }), notes: e.target.value } }))} disabled={!canManage} /></td><td><button className="border px-2 py-1 text-xs disabled:opacity-50" disabled={!canManage} title={!canManage ? NO_PERMISSION_MESSAGE : undefined} onClick={() => {
        const draft = memberDrafts[member.user.id] ?? { role: member.role, display_name: member.display_name ?? '', notes: member.notes ?? '' }
        updateMember.mutate({ userId: member.user.id, payload: { role: draft.role, display_name: draft.display_name || undefined, notes: draft.notes || undefined } })
      }}>Mitglied bearbeiten</button><button className="ml-2 border px-2 py-1 text-xs disabled:opacity-50" disabled={!canManage} title={!canManage ? NO_PERMISSION_MESSAGE : undefined} onClick={() => window.confirm('Mitglied entfernen?') && removeMember.mutate(member.user.id)}>Mitglied entfernen</button></td></tr>)}</tbody></table>}
      {!canManage && <p className="text-sm text-amber-700">Keine Berechtigung für diese Aktion.</p>}

      <h3 className="font-medium mt-3">Benutzer dem Team hinzufügen</h3>
      {usersQuery.isError && <p className="text-sm text-red-700">Keine Berechtigung für diese Aktion.</p>}
      <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} disabled={!canManage || usersQuery.isError}><option value="">Benutzer auswählen</option>{(usersQuery.data?.data ?? []).map((u: User) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}</select>
      <select value={role} onChange={(e) => setRole(e.target.value as TeamRole)} disabled={!canManage}><option value="member">member</option><option value="lead">lead</option><option value="admin">admin</option></select>
      <input placeholder="Anzeigename (optional)" value={displayName} onChange={(e) => setDisplayName(e.target.value)} disabled={!canManage} />
      <input placeholder="Notizen (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canManage} />
      <button className="border px-3 py-2 disabled:opacity-50" disabled={!canManage || !selectedUser} title={!canManage ? NO_PERMISSION_MESSAGE : undefined} onClick={() => addMember.mutate()}>Benutzer dem Team zuweisen</button>
    </div>

    <div className="rounded border bg-white p-4"><h2 className="font-medium">Benutzer einladen</h2><p className="text-sm text-slate-600">Einladungen per E-Mail sind noch nicht implementiert.</p></div>

    <div className="rounded border bg-white p-4 space-y-2"><h2 className="font-medium">Zugewiesene Kampagnen</h2>
      {campaigns === null && <p className="text-sm text-slate-600">Zugewiesene Kampagnen werden von der API noch nicht auf dieser Team-Detailseite bereitgestellt.</p>}
      {campaigns?.length === 0 && <EmptyState message="Dieses Team ist noch keiner Kampagne zugewiesen." />}
      {campaigns?.map((campaign) => <div key={campaign.id} className="flex items-center justify-between border rounded p-2"><span>{campaign.name}</span><button className="border px-2 py-1 disabled:opacity-50" disabled={!canDetach} title={!canDetach ? NO_PERMISSION_MESSAGE : undefined} onClick={() => detachCampaign.mutate(campaign.id)}>Trennen</button></div>)}
    </div>

    <div className="rounded border border-red-200 bg-red-50 p-4 space-y-2"><h2 className="font-medium">Danger Zone</h2><button className="bg-red-600 text-white px-3 py-2 disabled:opacity-50" disabled={!canDelete} title={!canDelete ? NO_PERMISSION_MESSAGE : undefined} onClick={() => window.confirm('Team wirklich löschen?') && deleteMutation.mutate()}>Team löschen</button></div>
  </section>
}
