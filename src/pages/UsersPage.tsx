import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { createUser, deleteUser, listUsers, updateUser } from '../api/endpoints'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import type { AppRole, User } from '../types/models'
import { can, NO_PERMISSION_MESSAGE } from '../utils/permissions'

type CreateUserValues = { name: string; email: string; password: string; app_role: AppRole }
type UpdateUserValues = { id: number; name: string; email: string; password?: string; app_role: AppRole }

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      createForm.reset({ name: '', email: '', password: '', app_role: 'user' })
    },
  })
  const updateMutation = useMutation({ mutationFn: ({ id, ...payload }: UpdateUserValues) => updateUser(id, payload), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }) })
  const deleteMutation = useMutation({ mutationFn: deleteUser, onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }) })

  const users = usersQuery.data?.data ?? []
  const canCreate = capabilityFromUsers(users, 'create')
  const canUpdate = capabilityFromUsers(users, 'update')

  return <section className="space-y-4">
    <h1 className="text-2xl font-semibold">Users</h1>

    <form className="space-y-2 rounded border bg-white p-4" onSubmit={createForm.handleSubmit((values) => createMutation.mutate(values))}>
      <h2 className="font-medium">Create user</h2>
      <input placeholder="name" {...createForm.register('name')} />
      <input placeholder="email" type="email" {...createForm.register('email')} />
      <input placeholder="password" type="password" {...createForm.register('password')} />
      <select {...createForm.register('app_role')}><option value="user">user</option><option value="admin">admin</option></select>
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
