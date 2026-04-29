import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { createArea, deleteArea, listAreas, updateArea } from '../api/endpoints'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import { can, NO_PERMISSION_MESSAGE } from '../utils/permissions'

export function AreasPage() {
  const qc = useQueryClient()
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['areas-pool'], queryFn: () => listAreas({ per_page: 100 }) })
  const form = useForm({ defaultValues: { name: '', geojson: '{"type":"Polygon","coordinates":[]}' } })
  const createMutation = useMutation({ mutationFn: (v: { name: string; geojson: string }) => createArea({ name: v.name, geojson: JSON.parse(v.geojson) }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['areas-pool'] }); form.reset() } })
  const patch = useMutation({ mutationFn: ({ id, name, geojson }: { id: number; name: string; geojson: any }) => updateArea(id, { name, geojson }), onSuccess: () => qc.invalidateQueries({ queryKey: ['areas-pool'] }) })
  const del = useMutation({ mutationFn: deleteArea, onSuccess: () => qc.invalidateQueries({ queryKey: ['areas-pool'] }) })

  return <section className="space-y-4"><h1 className="text-2xl font-semibold">Areas pool</h1>
    <form className="space-y-2 rounded border bg-white p-4" onSubmit={form.handleSubmit((v) => createMutation.mutate(v))}><input placeholder="Area name" {...form.register('name')} /><textarea rows={4} {...form.register('geojson')} /><button className="bg-slate-900 text-white" type="submit">Create area</button></form>
    {isLoading && <LoadingState />}
    {isError && <ErrorState message={(error as Error).message} />}
    {data && data.data.length === 0 && <EmptyState message="No areas yet." />}
    {data?.data.map((area) => <div key={area.id} className="rounded border bg-white p-3"><p className="font-medium">{area.name}</p><p className="text-xs text-slate-500">GeoJSON: {area.geojson ? JSON.stringify(area.geojson).slice(0, 120) : 'none'}</p><div className="mt-2 flex gap-2"><button type="button" className="border disabled:opacity-50" disabled={!can(area.can?.update)} title={!can(area.can?.update) ? NO_PERMISSION_MESSAGE : undefined} onClick={() => patch.mutate({ id: area.id, name: area.name, geojson: area.geojson })}>Save</button><button type="button" className="bg-red-600 text-white disabled:opacity-50" disabled={!can(area.can?.delete)} title={!can(area.can?.delete) ? NO_PERMISSION_MESSAGE : undefined} onClick={() => del.mutate(area.id)}>Delete</button></div></div>)}
  </section>
}

