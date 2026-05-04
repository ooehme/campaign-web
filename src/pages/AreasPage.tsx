import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { createArea, deleteArea, listAreas } from '../api/endpoints'
import { ApiError } from '../api/client'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import { can, canPermission, NO_PERMISSION_MESSAGE } from '../utils/permissions'
import { useAuth } from '../auth/AuthContext'

const PLACEHOLDER = '{"type":"Polygon","coordinates":[[[13.40,52.52],[13.41,52.52],[13.41,52.53],[13.40,52.53],[13.40,52.52]]]}'

export function AreasPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [success, setSuccess] = useState('')
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['areas-pool'], queryFn: () => listAreas({ per_page: 100 }) })
  const form = useForm({ defaultValues: { name: '', geojson: '{"type":"Polygon","coordinates":[]}' } })

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['areas-pool'] }); qc.invalidateQueries({ queryKey: ['campaign-areas'] }) }
  const createMutation = useMutation({ mutationFn: (v: { name: string; geojson: string }) => createArea({ name: v.name, geojson: JSON.parse(v.geojson) }), onSuccess: () => { invalidate(); setSuccess('Fläche erstellt.'); form.reset() } })
  const del = useMutation({ mutationFn: deleteArea, onSuccess: () => { invalidate(); setSuccess('Fläche gelöscht.') } })
  const formatError = (e: unknown) => e instanceof ApiError && e.status >= 500 ? 'Serverfehler beim Laden oder Speichern der Fläche.' : e instanceof Error ? e.message : 'Fehler.'

  return <section className="space-y-4"><h1 className="text-2xl font-semibold">Flächen-Pool</h1><Link className="inline-block rounded border px-3 py-2 text-sm" to="/areas/new-map">Fläche auf Karte erstellen</Link>
    {success && <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">{success}</p>}
    <form className="space-y-2 rounded border bg-white p-4" onSubmit={form.handleSubmit((v) => { try { JSON.parse(v.geojson) } catch { form.setError('geojson', { message: 'GeoJSON ist kein valides JSON.' }); return } createMutation.mutate(v) })}><input placeholder="Name" {...form.register('name', { required: true })} /><details><summary className="cursor-pointer text-sm">Für Experten: GeoJSON manuell bearbeiten</summary><label className="mt-2 block text-sm">GeoJSON</label><textarea rows={6} placeholder={PLACEHOLDER} {...form.register('geojson', { required: true })} /></details><button className="bg-slate-900 text-white disabled:opacity-50" disabled={!canPermission(user?.can, 'areas.create')} title={!canPermission(user?.can, 'areas.create') ? NO_PERMISSION_MESSAGE : undefined} type="submit">Neue globale Fläche erstellen</button>{form.formState.errors.geojson && <ErrorState message={form.formState.errors.geojson.message ?? 'Validation error'} />}</form>
    {isLoading && <LoadingState />}
    {isError && <ErrorState message={formatError(error)} />}
    {createMutation.isError && <ErrorState message={formatError(createMutation.error)} />}
    {data && data.data.length === 0 && <EmptyState message="Noch keine Flächen vorhanden." />}
    {data?.data.map((area) => <div key={area.id} className="rounded border bg-white p-3"><p className="font-medium"><Link className="text-blue-700" to={`/areas/${area.id}`}>{area.name}</Link></p><p className="text-xs text-slate-500">ID: {area.id}</p><p className="text-xs text-slate-500">GeoJSON: {area.geojson ? JSON.stringify(area.geojson).slice(0, 120) : 'Keine Geometrie'}</p><div className="mt-2 flex gap-2"><Link className={`border px-3 py-1 text-sm ${!can(area.can?.update) ? 'pointer-events-none opacity-50' : ''}`} title={!can(area.can?.update) ? NO_PERMISSION_MESSAGE : undefined} to={`/areas/${area.id}/edit`}>Bearbeiten</Link><button type="button" className="bg-red-600 text-white disabled:opacity-50" disabled={!can(area.can?.delete)} title={!can(area.can?.delete) ? NO_PERMISSION_MESSAGE : undefined} onClick={() => window.confirm(`Fläche "${area.name}" löschen?`) && del.mutate(area.id)}>Löschen</button></div></div>)}
  </section>
}
