import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { createTeam, deleteTeam, listTeams } from '../api/endpoints'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import { can, canPermission, NO_PERMISSION_MESSAGE } from '../utils/permissions'
import { useAuth } from '../auth/AuthContext'

export function TeamsPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [success, setSuccess] = useState('')
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['teams-pool'], queryFn: () => listTeams({ per_page: 100 }) })
  const form = useForm({ defaultValues: { name: '' } })
  const del = useMutation({ mutationFn: deleteTeam, onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams-pool'] }); setSuccess('Team gelöscht.') } })
  const teamsForbidden = isError && (error as { status?: number }).status === 403

  if (teamsForbidden) {
    return (
      <ErrorState
        title="Teams nicht verfügbar"
        message="Ihr Konto darf die Teamliste nicht anzeigen."
        description="Sie können zum Dashboard zurückkehren oder die benötigte Berechtigung anfragen."
        actionLabel="Zurück zum Dashboard"
        actionTo="/dashboard"
      />
    )
  }

  return <section className="space-y-4"><h1 className="text-2xl font-semibold">Team-Pool</h1>
    {success && <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">{success}</p>}
    <form className="space-y-2 rounded border bg-white p-4" onSubmit={form.handleSubmit((v) => createTeam(v).then(() => { qc.invalidateQueries({ queryKey: ['teams-pool'] }); setSuccess('Team erstellt.'); form.reset() }))}><input placeholder="Teamname *" {...form.register('name', { required: true })} /><button className="bg-slate-900 text-white disabled:opacity-50" disabled={!canPermission(user?.can, 'teams.create')} title={!canPermission(user?.can, 'teams.create') ? NO_PERMISSION_MESSAGE : undefined} type="submit">Neues globales Team erstellen</button></form>
    {isLoading && <LoadingState />}
    {isError && <ErrorState message={(error as { status?: number }).status === 403 ? 'Keine Berechtigung für Teams.' : (error as Error).message} />}
    {data && data.data.length === 0 && <EmptyState message="Noch keine Teams vorhanden." />}
    {data?.data.map((team) => <div key={team.id} className="rounded border bg-white p-3"><p className="font-medium"><Link className="text-blue-600" to={`/teams/${team.id}`}>{team.name}</Link></p>
      <p className="text-sm text-slate-600">Mitglieder: {String((team as Record<string, unknown>).member_count ?? 'nicht verfügbar')}</p>
      <p className="text-sm text-slate-600">Kampagnen: {String((team as Record<string, unknown>).campaign_count ?? 'nicht verfügbar')}</p>
      <div className="mt-2 flex gap-2"><Link to={`/teams/${team.id}/edit`} className={`border px-2 py-1 ${!can(team.can?.update) ? 'pointer-events-none opacity-50' : ''}`} title={!can(team.can?.update) ? NO_PERMISSION_MESSAGE : undefined}>Bearbeiten</Link><button type="button" className="bg-red-600 text-white disabled:opacity-50 px-2 py-1" disabled={!can(team.can?.delete)} title={!can(team.can?.delete) ? NO_PERMISSION_MESSAGE : undefined} onClick={() => window.confirm(`Team "${team.name}" löschen?`) && del.mutate(team.id)}>Löschen</button></div></div>)}
  </section>
}
