import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { createCampaign, deleteCampaign, getCampaigns, updateCampaign } from '../api/endpoints'
import { ApiError } from '../api/client'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import type { Campaign } from '../types/models'
import { z } from 'zod'

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const createCampaignSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255, 'Name must be 255 characters or fewer'),
  slug: z
    .string()
    .trim()
    .min(1, 'Slug is required')
    .max(255, 'Slug must be 255 characters or fewer')
    .regex(SLUG_PATTERN, 'Slug must use lowercase letters, numbers, and hyphens only'),
  description: z.string().optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
})

const editCampaignSchema = z.object({
  name: z.string().trim().min(2),
  description: z.string().optional(),
})

type CreateCampaignFormValues = z.infer<typeof createCampaignSchema>
type EditCampaignFormValues = z.infer<typeof editCampaignSchema>

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')

const applyValidationErrors = (
  err: unknown,
  setError: ReturnType<typeof useForm<CreateCampaignFormValues>>['setError'],
) => {
  if (!(err instanceof ApiError) || err.status !== 422 || typeof err.details !== 'object' || err.details === null || !('errors' in err.details)) {
    return
  }

  const backendErrors = err.details.errors
  if (typeof backendErrors !== 'object' || backendErrors === null) {
    return
  }

  const allowedFields = new Set(['name', 'slug', 'description', 'status'])
  for (const [field, fieldErrors] of Object.entries(backendErrors)) {
    if (!allowedFields.has(field)) continue
    if (Array.isArray(fieldErrors) && typeof fieldErrors[0] === 'string') {
      setError(field as keyof CreateCampaignFormValues, { message: fieldErrors[0] })
    }
  }
}

export function CampaignListPage() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Campaign | null>(null)
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['campaigns'], queryFn: getCampaigns })

  const createForm = useForm<CreateCampaignFormValues>({
    resolver: zodResolver(createCampaignSchema),
    defaultValues: { name: '', slug: '', description: '', status: 'draft' },
  })
  const editForm = useForm<EditCampaignFormValues>({ resolver: zodResolver(editCampaignSchema) })

  const createNameValue = createForm.watch('name')
  const createSlugValue = createForm.watch('slug')

  useEffect(() => {
    const slugDirty = createForm.formState.dirtyFields.slug
    if (slugDirty && createSlugValue.trim() !== '') return

    createForm.setValue('slug', slugify(createNameValue), { shouldDirty: false, shouldValidate: false })
  }, [createForm, createForm.formState.dirtyFields.slug, createNameValue, createSlugValue])

  const createMutation = useMutation({
    mutationFn: createCampaign,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] })
      createForm.reset({ name: '', slug: '', description: '', status: 'draft' })
    },
    onError: (err) => {
      applyValidationErrors(err, createForm.setError)
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
        <form
          className="grid gap-2 md:grid-cols-5"
          onSubmit={createForm.handleSubmit(({ name, slug, description, status }) =>
            createMutation.mutate({ name, slug, description, status }),
          )}
        >
          <input placeholder="Name" {...createForm.register('name')} />
          <input placeholder="Slug" {...createForm.register('slug')} />
          <input placeholder="Description (optional)" {...createForm.register('description')} />
          <select {...createForm.register('status')}>
            <option value="draft">draft</option>
            <option value="active">active</option>
            <option value="archived">archived</option>
          </select>
          <button className="bg-slate-900 text-white" type="submit">Create</button>
        </form>

        {createForm.formState.errors.name && <ErrorState message={createForm.formState.errors.name.message ?? 'Validation error'} />}
        {createForm.formState.errors.slug && <ErrorState message={createForm.formState.errors.slug.message ?? 'Validation error'} />}
        {createForm.formState.errors.description && <ErrorState message={createForm.formState.errors.description.message ?? 'Validation error'} />}
        {createForm.formState.errors.status && <ErrorState message={createForm.formState.errors.status.message ?? 'Validation error'} />}
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
