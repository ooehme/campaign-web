import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { createCampaign, deleteCampaign, getCampaigns, updateCampaign } from '../api/endpoints'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import type { Campaign } from '../types/models'
import { z } from 'zod'

const campaignSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
})

type CampaignFormValues = z.infer<typeof campaignSchema>

export function CampaignListPage() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Campaign | null>(null)
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['campaigns'], queryFn: getCampaigns })

  const createForm = useForm<CampaignFormValues>({ resolver: zodResolver(campaignSchema), defaultValues: { name: '', description: '' } })
  const editForm = useForm<CampaignFormValues>({ resolver: zodResolver(campaignSchema) })

  const createMutation = useMutation({
    mutationFn: createCampaign,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] })
      createForm.reset()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<Campaign> }) => updateCampaign(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] })
      setEditing(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteCampaign,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  })

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Campaigns</h1>
      <div className="rounded border bg-white p-4">
        <h2 className="mb-2 font-medium">Create campaign</h2>
        <form className="grid gap-2 md:grid-cols-3" onSubmit={createForm.handleSubmit((values) => createMutation.mutate(values))}>
          <input placeholder="Campaign name" {...createForm.register('name')} />
          <input placeholder="Description" {...createForm.register('description')} />
          <button className="bg-slate-900 text-white" type="submit">Create</button>
        </form>
        {createForm.formState.errors.name && <ErrorState message={createForm.formState.errors.name.message ?? 'Validation error'} />}
        {createMutation.isError && <ErrorState message={(createMutation.error as Error).message} />}
      </div>

      <div className="rounded border bg-white p-4">
        {isLoading && <LoadingState />}
        {isError && <ErrorState message={(error as Error).message} />}
        {data && data.length === 0 && <EmptyState message="No campaigns found." />}
        {data && data.length > 0 && (
          <ul className="space-y-3">
            {data.map((campaign) => (
              <li key={campaign.id} className="rounded border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{campaign.name}</p>
                    <p className="text-sm text-slate-600">{campaign.description ?? '-'}</p>
                    <Link className="text-sm text-blue-600" to={`/campaigns/${campaign.id}`}>Open details</Link>
                  </div>
                  <div className="flex gap-2">
                    <button className="border" onClick={() => { setEditing(campaign); editForm.reset({ name: campaign.name, description: String(campaign.description ?? '') }) }}>Edit</button>
                    <button className="bg-red-600 text-white" onClick={() => deleteMutation.mutate(campaign.id)}>Delete</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editing && (
        <div className="rounded border bg-white p-4">
          <h2 className="mb-2 font-medium">Edit campaign: {editing.name}</h2>
          <form className="grid gap-2 md:grid-cols-3" onSubmit={editForm.handleSubmit((values) => updateMutation.mutate({ id: editing.id, payload: values }))}>
            <input {...editForm.register('name')} />
            <input {...editForm.register('description')} />
            <button className="bg-slate-900 text-white" type="submit">Save</button>
          </form>
          {updateMutation.isError && <ErrorState message={(updateMutation.error as Error).message} />}
        </div>
      )}
    </section>
  )
}
