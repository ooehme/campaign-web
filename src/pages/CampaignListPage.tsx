import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { createCampaign, deleteCampaign, getCampaignsPage, updateCampaign } from '../api/endpoints'
import { ApiError } from '../api/client'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import type { Campaign } from '../types/models'
import { z } from 'zod'
import { can, NO_PERMISSION_MESSAGE } from '../utils/permissions'

const schema = z.object({
  name: z.string().trim().min(1, 'Name ist erforderlich.'),
  slug: z.string().trim().min(1, 'Slug ist erforderlich.'),
  description: z.string().optional(),
  status: z.enum(['draft', 'active', 'archived']).default('draft'),
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

const apiErrorMessage = (error: unknown) => {
  if (!(error instanceof ApiError)) return 'Unbekannter Fehler.'
  if (error.status === 401) return 'Nicht angemeldet (401). Bitte erneut einloggen.'
  if (error.status === 403) return 'Keine Berechtigung (403).'
  if (error.status >= 500) return 'Serverfehler (500). Bitte später erneut versuchen.'
  return error.message
}

export function CampaignListPage() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Campaign | null>(null)
  const [success, setSuccess] = useState('')
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['campaigns'], queryFn: () => getCampaignsPage({ per_page: 100 }) })
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: '', slug: '', description: '', status: 'draft', starts_at: '', ends_at: '' } })
  const editForm = useForm<FormValues>({ resolver: zodResolver(schema) })

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['campaigns'] })
    qc.invalidateQueries({ queryKey: ['campaign'] })
  }

  const createMutation = useMutation({
    mutationFn: createCampaign,
    onSuccess: () => { invalidateAll(); form.reset(); setSuccess('Kampagne wurde erstellt.') },
    onError: () => setSuccess(''),
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<Campaign> }) => updateCampaign(id, payload),
    onSuccess: () => { invalidateAll(); setEditing(null); setSuccess('Kampagne wurde aktualisiert.') },
  })
  const deleteMutation = useMutation({
    mutationFn: deleteCampaign,
    onSuccess: () => { invalidateAll(); setSuccess('Kampagne wurde gelöscht.') },
  })

  const campaignCreateAllowed = data?.data.some((c) => can(c.can?.update) || can(c.can?.delete) || can(c.can?.create_area) || can(c.can?.create_team) || can(c.can?.create_task)) ?? true

  return <section className="space-y-4">
    <h1 className="text-2xl font-semibold">Kampagnen</h1>
    {success && <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">{success}</p>}

    <div className="rounded border bg-white p-4">
      <h2 className="mb-2 font-medium">Kampagne erstellen</h2>
      <form className="grid gap-2 md:grid-cols-3" onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}>
        <input placeholder="Name" {...form.register('name')} />
        <input placeholder="Slug" {...form.register('slug')} />
        <input placeholder="Beschreibung (optional)" {...form.register('description')} />
        <select {...form.register('status')}><option value="draft">draft</option><option value="active">active</option><option value="archived">archived</option></select>
        <input type="datetime-local" {...form.register('starts_at')} />
        <input type="datetime-local" {...form.register('ends_at')} />
        <button className="bg-slate-900 text-white disabled:opacity-50" type="submit" disabled={!campaignCreateAllowed} title={!campaignCreateAllowed ? 'Keine Berechtigung für diese Aktion.' : undefined}>Erstellen</button>
      </form>
      {(createMutation.isError) && <ErrorState message={apiErrorMessage(createMutation.error)} />}
    </div>

    <div className="rounded border bg-white p-4">
      {isLoading && <LoadingState />}
      {isError && <ErrorState message={apiErrorMessage(error)} />}
      {data && data.data.length === 0 && <EmptyState message="Noch keine Kampagnen vorhanden." />}
      {data && data.data.length > 0 && <ul className="space-y-3">{data.data.map((campaign) => <li key={campaign.id} className="rounded border p-3"><div className="flex items-center justify-between"><div><p className="font-medium">{campaign.name}</p><p className="text-sm text-slate-600">{campaign.description ?? '-'}</p><Link className="text-sm text-blue-600" to={`/campaigns/${campaign.id}`}>Details öffnen</Link></div><div className="flex gap-2"><button className="border disabled:opacity-50" disabled={!can(campaign.can?.update)} title={!can(campaign.can?.update) ? NO_PERMISSION_MESSAGE : undefined} onClick={() => { setEditing(campaign); editForm.reset({ name: campaign.name, slug: String(campaign.slug ?? ''), description: String(campaign.description ?? ''), status: (campaign.status ?? 'draft') as FormValues['status'], starts_at: String(campaign.starts_at ?? ''), ends_at: String(campaign.ends_at ?? '') }) }}>Bearbeiten</button><button className="bg-red-600 text-white disabled:opacity-50" disabled={!can(campaign.can?.delete)} title={!can(campaign.can?.delete) ? NO_PERMISSION_MESSAGE : undefined} onClick={() => window.confirm(`Kampagne "${campaign.name}" löschen?`) && deleteMutation.mutate(campaign.id)}>Löschen</button></div></div></li>)}</ul>}
    </div>

    {editing && <div className="rounded border bg-white p-4"><h2 className="mb-2 font-medium">Kampagne bearbeiten: {editing.name}</h2><form className="grid gap-2 md:grid-cols-3" onSubmit={editForm.handleSubmit((values) => updateMutation.mutate({ id: editing.id, payload: values }))}><input {...editForm.register('name')} /><input {...editForm.register('slug')} /><input {...editForm.register('description')} /><select {...editForm.register('status')}><option value="draft">draft</option><option value="active">active</option><option value="archived">archived</option></select><input type="datetime-local" {...editForm.register('starts_at')} /><input type="datetime-local" {...editForm.register('ends_at')} /><button className="bg-slate-900 text-white" type="submit">Speichern</button></form>{updateMutation.isError && <ErrorState message={apiErrorMessage(updateMutation.error)} />}</div>}
  </section>
}
