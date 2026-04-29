import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { createUser, deleteUser, listUsers, updateUser } from '../api/endpoints'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import type { AppRole, User } from '../types/models'
import { can, NO_PERMISSION_MESSAGE } from '../utils/permissions'

type CreateUserValues = { name: string; email: string; password: string; app_role: AppRole }
type EditUserValues = { name: string; email: string; password: string; app_role: AppRole }

const parseValidationErrors = (error: unknown): Record<string, string[]> => {
  if (!(error instanceof ApiError) || error.code !== 'validation' || !error.details || typeof error.details !== 'object') return {}
  const details = error.details as { errors?: unknown }
  return (details.errors as Record<string, string[]>) ?? {}
}

const appRoleBadge = (role: AppRole) => <span className="rounded border px-2 py-0.5 text-xs font-medium">App-Rolle: {role}</span>

export function UsersPage() {
  const qc = useQueryClient()
  const { user: currentUser, refreshUser } = useAuth()
  const [success, setSuccess] = useState('')
  const [editingUserId, setEditingUserId] = useState<number | null>(null)

  const usersQuery = useQuery({ queryKey: ['users'], queryFn: () => listUsers({ per_page: 100 }), retry: false })
  const users = usersQuery.data?.data ?? []

  const createForm = useForm<CreateUserValues>({ defaultValues: { name: '', email: '', password: '', app_role: 'user' } })
  const editForm = useForm<EditUserValues>({ defaultValues: { name: '', email: '', password: '', app_role: 'user' } })

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      createForm.reset({ name: '', email: '', password: '', app_role: 'user' })
      setSuccess('Benutzer wurde erstellt.')
    },
    onError: (error) => {
      const errors = parseValidationErrors(error)
      Object.entries(errors).forEach(([field, messages]) => createForm.setError(field as keyof CreateUserValues, { type: 'server', message: messages[0] }))
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: number; values: EditUserValues }) => updateUser(id, {
      name: values.name,
      email: values.email,
      app_role: values.app_role,
      ...(values.password.trim().length > 0 ? { password: values.password } : {}),
    }),
    onSuccess: (_, payload) => {
      qc.invalidateQueries({ queryKey: ['users'] })
      if (payload.id === currentUser?.id) refreshUser().catch(() => undefined)
      setEditingUserId(null)
      setSuccess('Benutzer wurde aktualisiert.')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: (_, deletedId) => {
      qc.invalidateQueries({ queryKey: ['users'] })
      if (deletedId === currentUser?.id) refreshUser().catch(() => undefined)
      setSuccess('Benutzer wurde entfernt.')
    },
  })

  const isForbidden = usersQuery.isError && usersQuery.error instanceof ApiError && usersQuery.error.status === 403
  const isServerError = usersQuery.isError && usersQuery.error instanceof ApiError && usersQuery.error.status >= 500

  const editingUser = useMemo(() => users.find((user) => user.id === editingUserId) ?? null, [editingUserId, users])

  return <section className="space-y-4">
    <h1 className="text-2xl font-semibold">Benutzer</h1>
    {success && <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">{success}</p>}

    <form className="space-y-2 rounded border bg-white p-4" onSubmit={createForm.handleSubmit((values) => createMutation.mutate(values))}>
      <h2 className="font-medium">Benutzer erstellen</h2>
      <input placeholder="Name" {...createForm.register('name', { required: 'Name ist erforderlich.' })} />
      {createForm.formState.errors.name?.message && <p className="text-sm text-red-700">{createForm.formState.errors.name.message}</p>}
      <input placeholder="E-Mail" type="email" {...createForm.register('email', { required: 'E-Mail ist erforderlich.' })} />
      {createForm.formState.errors.email?.message && <p className="text-sm text-red-700">{createForm.formState.errors.email.message}</p>}
      <input placeholder="Passwort" type="password" {...createForm.register('password', { required: 'Passwort ist erforderlich.' })} />
      {createForm.formState.errors.password?.message && <p className="text-sm text-red-700">{createForm.formState.errors.password.message}</p>}
      <select {...createForm.register('app_role')}><option value="user">user</option><option value="admin">admin</option></select>
      <button className="bg-slate-900 text-white" type="submit">Benutzer erstellen</button>
    </form>

    {editingUser && <form className="space-y-2 rounded border bg-white p-4" onSubmit={editForm.handleSubmit((values) => updateMutation.mutate({ id: editingUser.id, values }))}>
      <h2 className="font-medium">Benutzer bearbeiten: {editingUser.name}</h2>
      {!can(editingUser.can?.update) && <p className="text-sm text-amber-700">Keine Berechtigung für diese Aktion.</p>}
      <input placeholder="Name" disabled={!can(editingUser.can?.update)} {...editForm.register('name', { required: true })} />
      <input placeholder="E-Mail" type="email" disabled={!can(editingUser.can?.update)} {...editForm.register('email', { required: true })} />
      <input placeholder="Passwort (optional)" type="password" disabled={!can(editingUser.can?.update)} {...editForm.register('password')} />
      <select disabled={!can(editingUser.can?.update)} {...editForm.register('app_role')}><option value="user">user</option><option value="admin">admin</option></select>
      <div className="flex gap-2"><button className="border disabled:opacity-50" type="submit" disabled={!can(editingUser.can?.update)}>Benutzer speichern</button><button className="border" type="button" onClick={() => setEditingUserId(null)}>Abbrechen</button></div>
    </form>}

    {usersQuery.isLoading && <LoadingState />}
    {isForbidden && <ErrorState message="Keine Berechtigung, Benutzer zu laden." />}
    {isServerError && <ErrorState message="Serverfehler beim Laden der Benutzer." />}
    {usersQuery.data && users.length === 0 && <EmptyState message="Noch keine Benutzer vorhanden." />}

    {users.length > 0 && <div className="rounded border bg-white p-2 overflow-auto">
      <table className="w-full text-sm"><thead><tr className="text-left"><th>Name</th><th>E-Mail</th><th>App-Rolle</th><th>Aktionen</th></tr></thead><tbody>
        {users.map((user: User) => <tr key={user.id} className="border-t"><td>{user.name}</td><td>{user.email}</td><td>{appRoleBadge(user.app_role)}</td><td className="py-2 flex gap-2"><button className="border disabled:opacity-50" disabled={!can(user.can?.update)} title={!can(user.can?.update) ? NO_PERMISSION_MESSAGE : undefined} onClick={() => { setEditingUserId(user.id); editForm.reset({ name: user.name, email: user.email, app_role: user.app_role, password: '' }) }}>bearbeiten</button><button className="bg-red-600 px-2 text-white disabled:opacity-50" disabled={!can(user.can?.delete)} title={!can(user.can?.delete) ? NO_PERMISSION_MESSAGE : undefined} onClick={() => window.confirm(`Benutzer \"${user.name}\" entfernen?`) && deleteMutation.mutate(user.id)}>entfernen</button></td></tr>)}
      </tbody></table>
    </div>}
  </section>
}
