import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { ApiError } from '../api/client'
import { createUser, deleteUser, listUsers, updateUser } from '../api/endpoints'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import type { AppRole, User } from '../types/models'
import { can, NO_PERMISSION_MESSAGE } from '../utils/permissions'

type CreateUserValues = { name: string; email: string; password: string; app_role: AppRole }
type UpdateUserValues = { id: number; name: string; email: string; password?: string; app_role: AppRole }
type ValidationErrors = Partial<Record<keyof CreateUserValues, string[]>>
type CreateUserPayload = { name: string; email: string; password: string; app_role: 'user' | 'admin' }

const parseValidationErrors = (error: unknown): ValidationErrors => {
  if (!(error instanceof ApiError) || error.code !== 'validation' || !error.details || typeof error.details !== 'object') return {}
  const details = error.details as { errors?: unknown }
  if (!details.errors || typeof details.errors !== 'object') return {}
  return details.errors as ValidationErrors
}

const toCreateUserPayload = (values: CreateUserValues): CreateUserPayload => ({
  name: values.name.trim(),
  email: values.email.trim(),
  password: values.password,
  app_role: values.app_role === 'admin' ? 'admin' : 'user',
})

const capabilityFromUsers = (users: User[], key: 'create' | 'update' | 'delete'): boolean => {
  const explicitFlag = users.find((user) => typeof user.can?.[key] === 'boolean')?.can?.[key]
  return explicitFlag === undefined ? true : can(explicitFlag)
}

export function UsersPage() {
  const qc = useQueryClient()
  const usersQuery = useQuery({ queryKey: ['users'], queryFn: () => listUsers({ per_page: 100 }) })

  const createForm = useForm<CreateUserValues>({ defaultValues: { name: '', email: '', password: '', app_role: 'user' } })
  const updateForm = useForm<UpdateUserValues>({ defaultValues: { id: 0, name: '', email: '', password: '', app_role: 'user' } })

  const createMutation = useMutation({
    mutationFn: createUser,
    onMutate: () => {
      createForm.clearErrors()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      createForm.reset({ name: '', email: '', password: '', app_role: 'user' })
    },
    onError: (error) => {
      const fieldErrors = parseValidationErrors(error)
      const entries = Object.entries(fieldErrors) as [keyof CreateUserValues, string[]][]
      for (const [field, messages] of entries) {
        if (!messages?.length) continue
        createForm.setError(field, { type: 'server', message: messages[0] })
      }
      if (entries.length === 0) {
        createForm.setError('root', { type: 'server', message: error instanceof Error ? error.message : 'Failed to create user.' })
      }
    },
  })
  const updateMutation = useMutation({ mutationFn: ({ id, ...payload }: UpdateUserValues) => updateUser(id, payload), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }) })
  const deleteMutation = useMutation({ mutationFn: deleteUser, onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }) })

  const users = usersQuery.data?.data ?? []
  const canCreate = capabilityFromUsers(users, 'create')
  const canUpdate = capabilityFromUsers(users, 'update')
  const createFieldMessages = Object.values(createForm.formState.errors)
    .map((issue) => issue?.message)
    .filter((message): message is string => typeof message === 'string' && message.length > 0)

  return <section className="space-y-4">
    <h1 className="text-2xl font-semibold">Users</h1>

    <form className="space-y-2 rounded border bg-white p-4" onSubmit={createForm.handleSubmit((values) => createMutation.mutate(toCreateUserPayload(values)))}>
      <h2 className="font-medium">Create user</h2>
      {(createMutation.isError || Object.keys(createForm.formState.errors).length > 0) && <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
        <p>Please fix the validation errors below and try again.</p>
        {createFieldMessages.length > 0 && <ul className="list-inside list-disc">
          {createFieldMessages.map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}
        </ul>}
      </div>}
      {createForm.formState.errors.root?.message && <p className="text-sm text-red-700">{createForm.formState.errors.root.message}</p>}
      <input placeholder="name" {...createForm.register('name', { required: 'Name is required.', validate: (value) => value.trim().length > 0 || 'Name is required.' })} />
      {createForm.formState.errors.name?.message && <p className="text-sm text-red-700">{createForm.formState.errors.name.message}</p>}
      <input placeholder="email" type="email" {...createForm.register('email', { required: 'Email is required.', validate: (value) => value.trim().length > 0 || 'Email is required.' })} />
      {createForm.formState.errors.email?.message && <p className="text-sm text-red-700">{createForm.formState.errors.email.message}</p>}
      <input placeholder="password" type="password" {...createForm.register('password', { required: 'Password is required.', minLength: { value: 12, message: 'Password must be at least 12 characters.' } })} />
      {createForm.formState.errors.password?.message && <p className="text-sm text-red-700">{createForm.formState.errors.password.message}</p>}
      <select {...createForm.register('app_role', { validate: (value) => value === 'user' || value === 'admin' || 'Role must be user or admin.' })}><option value="user">user</option><option value="admin">admin</option></select>
      {createForm.formState.errors.app_role?.message && <p className="text-sm text-red-700">{createForm.formState.errors.app_role.message}</p>}
      <button className="bg-slate-900 text-white disabled:opacity-50" type="submit" disabled={!canCreate} title={!canCreate ? NO_PERMISSION_MESSAGE : undefined}>Create user</button>
    </form>

    <form className="space-y-2 rounded border bg-white p-4" onSubmit={updateForm.handleSubmit((values) => updateMutation.mutate(values))}>
      <h2 className="font-medium">Edit user</h2>
      <input placeholder="user id" type="number" {...updateForm.register('id', { valueAsNumber: true })} />
      <input placeholder="name" {...updateForm.register('name')} />
      <input placeholder="email" type="email" {...updateForm.register('email')} />
      <input placeholder="optional password" type="password" {...updateForm.register('password')} />
      <select {...updateForm.register('app_role')}><option value="user">user</option><option value="admin">admin</option></select>
      <button className="border disabled:opacity-50" type="submit" disabled={!canUpdate} title={!canUpdate ? NO_PERMISSION_MESSAGE : undefined}>Update user</button>
    </form>

    {usersQuery.isLoading && <LoadingState />}
    {usersQuery.isError && <ErrorState message={(usersQuery.error as Error).message} />}
    {usersQuery.data && users.length === 0 && <EmptyState message="No users found." />}

    {users.map((user) => <div key={user.id} className="rounded border bg-white p-3 text-sm">
      <p className="font-medium">{user.name}</p>
      <p>{user.email}</p>
      <p>app_role: {user.app_role}</p>
      <button type="button" className="mt-2 bg-red-600 text-white disabled:opacity-50" disabled={!can(user.can?.delete)} title={!can(user.can?.delete) ? NO_PERMISSION_MESSAGE : undefined} onClick={() => deleteMutation.mutate(user.id)}>Delete</button>
    </div>)}
  </section>
}
