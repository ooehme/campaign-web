import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { healthCheck, listCurrentUserInvitations } from '../api/endpoints'
import { ErrorState, LoadingState } from '../components/UiState'
import { useAuth } from '../auth/AuthContext'
import { hasVisibleModuleNavigation } from '../utils/navigation'

export function DashboardPage() {
  const { user } = useAuth()
  const hasModuleNavigation = hasVisibleModuleNavigation(user)
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['health'], queryFn: healthCheck })
  const invitationsQuery = useQuery({ queryKey: ['user-invitations'], queryFn: listCurrentUserInvitations, retry: false })

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      {!hasModuleNavigation && <p className="text-sm text-slate-600">Für diesen Benutzer sind keine Bereiche sichtbar.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded border bg-white p-4">
          <h2 className="font-medium">Backend Health</h2>
          {isLoading && <LoadingState />}
          {isError && <ErrorState message={(error as Error).message} />}
          {data && <p className="text-sm text-emerald-700">API reachable: {data.status ?? 'ok'}</p>}
        </div>

        <div className="rounded border bg-white p-4">
          <h2 className="font-medium">Meine Einladungen</h2>
          {invitationsQuery.isError && <p className="text-sm text-slate-600">Einladungen-Endpunkt derzeit nicht verfügbar.</p>}
          {(invitationsQuery.data ?? []).filter((i) => i.status === 'pending').length === 0 && <p className="text-sm">Keine offenen Einladungen.</p>}
          <ul className="space-y-2">{(invitationsQuery.data ?? []).filter((i) => i.status === 'pending').map((inv) => <li key={inv.id} className="border rounded p-2 text-sm">{inv.team?.name ?? '-'} ({inv.role})</li>)}</ul>
        </div>
        <div className="rounded border bg-white p-4">
          <h2 className="font-medium">Quick Links</h2>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {hasModuleNavigation && <li><Link className="text-blue-600" to="/campaigns">Manage campaigns</Link></li>}
            {!hasModuleNavigation && <li>Keine sichtbaren Bereiche verfügbar.</li>}
          </ul>
        </div>
      </div>
    </section>
  )
}
