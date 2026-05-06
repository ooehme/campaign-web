import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ApiError } from '../api/client'
import { listUsers } from '../api/endpoints'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import type { User } from '../types/models'
import { PERMISSIONS } from '../utils/permissionKeys'
import { appRoleLabel } from '../utils/appRoles'
import { can, hasPermission, NO_PERMISSION_MESSAGE } from '../utils/permissions'

export function UsersPage() {
  const { user: currentUser } = useAuth()
  const canCreateUser = hasPermission(currentUser, PERMISSIONS.USERS_CREATE)
  const usersQuery = useQuery({ queryKey: ['users'], queryFn: () => listUsers({ per_page: 100 }), retry: false })
  const users = usersQuery.data?.data ?? []

  if (usersQuery.isLoading) return <LoadingState />
  if (usersQuery.isError) {
    const err = usersQuery.error as ApiError
    if (err.status === 401) return <ErrorState message='Bitte erneut einloggen.' />
    if (err.status === 403) {
      return (
        <ErrorState
          title='Benutzer nicht verfügbar'
          message='Ihr Konto darf die Benutzerliste nicht anzeigen.'
          description='Sie können zum Dashboard zurückkehren oder die benötigte Berechtigung anfragen.'
          actionLabel='Zurück zum Dashboard'
          actionTo='/dashboard'
        />
      )
    }
    return <ErrorState message='Serverfehler beim Laden oder Speichern.' />
  }

  return <section className='space-y-4'>
    <div className='flex items-center justify-between'>
      <h1 className='text-2xl font-semibold'>Benutzer</h1>
      {canCreateUser && <Link className='border px-3 py-2 text-sm' to='/users/new'>Benutzer erstellen</Link>}
    </div>
    {users.length === 0 && <EmptyState message='Noch keine Benutzer vorhanden.' />}
    {users.length > 0 && <div className='rounded border bg-white p-2 overflow-auto'><table className='w-full text-sm'><thead><tr className='text-left'><th>Name</th><th>E-Mail</th><th>App-Rolle</th><th>Aktionen</th></tr></thead><tbody>{users.map((user: User) => <tr key={user.id} className='border-t'><td><Link className='text-blue-600' to={`/users/${user.id}`}>{user.name}</Link></td><td>{user.email}</td><td><span className='rounded border px-2 py-0.5 text-xs'>{appRoleLabel(user.app_role)}</span></td><td><Link className={`border px-2 py-1 text-xs ${!can(user.can?.update) ? 'pointer-events-none opacity-50' : ''}`} title={!can(user.can?.update) ? NO_PERMISSION_MESSAGE : undefined} to={`/users/${user.id}/edit`}>Bearbeiten</Link></td></tr>)}</tbody></table></div>}
  </section>
}
