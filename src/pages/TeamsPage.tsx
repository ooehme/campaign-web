import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { createTeam, deleteTeam, listTeams, updateTeam } from '../api/endpoints'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'

export function TeamsPage() {
  const qc = useQueryClient()
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['teams-pool'], queryFn: () => listTeams({ per_page: 100 }) })
  const form = useForm({ defaultValues: { name: '' } })
  const createMutation = useMutation({ mutationFn: (v: { name: string }) => createTeam(v), onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams-pool'] }); form.reset() } })
  const patch = useMutation({ mutationFn: ({ id, name }: { id: number; name: string }) => updateTeam(id, { name }), onSuccess: () => qc.invalidateQueries({ queryKey: ['teams-pool'] }) })
  const del = useMutation({ mutationFn: deleteTeam, onSuccess: () => qc.invalidateQueries({ queryKey: ['teams-pool'] }) })
  return <section className="space-y-4"><h1 className="text-2xl font-semibold">Teams pool</h1>
    <form className="space-y-2 rounded border bg-white p-4" onSubmit={form.handleSubmit((v) => createMutation.mutate(v))}><input placeholder="Team name" {...form.register('name')} /><button className="bg-slate-900 text-white" type="submit">Create team</button></form>
    {isLoading && <LoadingState />}
    {isError && <ErrorState message={(error as Error).message} />}
    {data && data.data.length === 0 && <EmptyState message="No teams yet." />}
    {data?.data.map((team) => <div key={team.id} className="rounded border bg-white p-3"><p className="font-medium">{team.name}</p><div className="mt-2 flex gap-2"><button type="button" className="border" onClick={() => patch.mutate({ id: team.id, name: team.name })}>Save</button><button type="button" className="bg-red-600 text-white" onClick={() => del.mutate(team.id)}>Delete</button></div></div>)}
  </section>
}
