import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ApiError } from '../api/client'
import { listUsers } from '../api/endpoints'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import type { User } from '../types/models'
import { can, NO_PERMISSION_MESSAGE } from '../utils/permissions'

export function UsersPage() {
  const usersQuery = useQuery({ queryKey: ['users'], queryFn: () => listUsers({ per_page: 100 }), retry: false })
  const users = usersQuery.data?.data ?? []

  if (usersQuery.isLoading) return <LoadingState />
  if (usersQuery.isError) {
    const err = usersQuery.error as ApiError
    if (err.status === 401) return <ErrorState message='Bitte erneut einloggen.' />
    if (err.status === 403) return <ErrorState message='Keine Berechtigung für diese Aktion.' />
    return <ErrorState message='Serverfehler beim Laden oder Speichern.' />
  }

  return <section className='space-y-4'>
    <h1 className='text-2xl font-semibold'>Benutzer</h1>
    {users.length === 0 && <EmptyState message='Noch keine Benutzer vorhanden.' />}
    {users.length > 0 && <div className='rounded border bg-white p-2 overflow-auto'><table className='w-full text-sm'><thead><tr className='text-left'><th>Name</th><th>E-Mail</th><th>Rolle</th><th>Aktionen</th></tr></thead><tbody>{users.map((user: User) => <tr key={user.id} className='border-t'><td><Link className='text-blue-600' to={`/users/${user.id}`}>{user.name}</Link></td><td>{user.email}</td><td><span className='rounded border px-2 py-0.5 text-xs'>{user.app_role}</span></td><td><Link className={`border px-2 py-1 text-xs ${!can(user.can?.update) ? 'pointer-events-none opacity-50' : ''}`} title={!can(user.can?.update) ? NO_PERMISSION_MESSAGE : undefined} to={`/users/${user.id}/edit`}>Bearbeiten</Link></td></tr>)}</tbody></table></div>}
  </section>
}
