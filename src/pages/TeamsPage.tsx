import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { createTeam, deleteTeam, listTeams, updateTeam } from '../api/endpoints'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import { can, NO_PERMISSION_MESSAGE } from '../utils/permissions'

export function TeamsPage() {
  const qc = useQueryClient()
  const [success, setSuccess] = useState('')
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['teams-pool'], queryFn: () => listTeams({ per_page: 100 }) })
  const form = useForm({ defaultValues: { name: '' } })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['teams-pool'] })
    qc.invalidateQueries({ queryKey: ['campaign-teams'] })
    qc.invalidateQueries({ queryKey: ['campaign'] })
    qc.invalidateQueries({ queryKey: ['campaigns'] })
  }

  const createMutation = useMutation({ mutationFn: (v: { name: string }) => createTeam(v), onSuccess: () => { invalidate(); setSuccess('Team erstellt.'); form.reset() } })
  const del = useMutation({ mutationFn: deleteTeam, onSuccess: () => { invalidate(); setSuccess('Team gelöscht.') } })

  return <section className="space-y-4"><h1 className="text-2xl font-semibold">Team-Pool</h1>
    {success && <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">{success}</p>}
    <form className="space-y-2 rounded border bg-white p-4" onSubmit={form.handleSubmit((v) => createMutation.mutate(v))}><input placeholder="Name" {...form.register('name', { required: true })} /><button className="bg-slate-900 text-white" type="submit">Neues globales Team erstellen</button></form>
    {isLoading && <LoadingState />}
    {isError && <ErrorState message={(error as Error).message} />}
    {data && data.data.length === 0 && <EmptyState message="Noch keine Teams vorhanden." />}
    {data?.data.map((team) => <div key={team.id} className="rounded border bg-white p-3"><p className="font-medium">{team.name}</p><div className="mt-2 flex gap-2"><button type="button" className="border disabled:opacity-50" disabled={!can(team.can?.update)} title={!can(team.can?.update) ? NO_PERMISSION_MESSAGE : undefined} onClick={() => { const nextName = window.prompt('Neuer Name', team.name); if (!nextName) return; updateTeam(team.id, { name: nextName }).then(() => { invalidate(); setSuccess('Team aktualisiert.') }) }}>Bearbeiten</button><button type="button" className="bg-red-600 text-white disabled:opacity-50" disabled={!can(team.can?.delete)} title={!can(team.can?.delete) ? NO_PERMISSION_MESSAGE : undefined} onClick={() => window.confirm(`Team "${team.name}" löschen?`) && del.mutate(team.id)}>Löschen</button></div></div>)}
  </section>
}
