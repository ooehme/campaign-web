import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { acceptTeamInvitation, declineTeamInvitation, healthCheck, listCurrentUserInvitations } from '../api/endpoints'
import { ErrorState, LoadingState } from '../components/UiState'

export function DashboardPage() {
  const qc = useQueryClient()
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['health'], queryFn: healthCheck })
  const invitationsQuery = useQuery({ queryKey: ['user-invitations'], queryFn: listCurrentUserInvitations, retry: false })
  const acceptMutation = useMutation({ mutationFn: acceptTeamInvitation, onSuccess: () => qc.invalidateQueries({ queryKey: ['user-invitations'] }) })
  const declineMutation = useMutation({ mutationFn: declineTeamInvitation, onSuccess: () => qc.invalidateQueries({ queryKey: ['user-invitations'] }) })

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
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
          <ul className="space-y-2">{(invitationsQuery.data ?? []).filter((i) => i.status === 'pending').map((inv) => <li key={inv.id} className="border rounded p-2 text-sm">{inv.team?.name ?? '-'} ({inv.role}) <button className="ml-2 border px-2 py-1 text-xs disabled:opacity-50" disabled={!inv.can?.accept} onClick={() => acceptMutation.mutate(inv.id)}>Annehmen</button><button className="ml-2 border px-2 py-1 text-xs disabled:opacity-50" disabled={!inv.can?.decline} onClick={() => declineMutation.mutate(inv.id)}>Ablehnen</button></li>)}</ul>
        </div>
        <div className="rounded border bg-white p-4">
          <h2 className="font-medium">Quick Links</h2>
          <ul className="mt-2 list-disc pl-5 text-sm">
            <li><Link className="text-blue-600" to="/campaigns">Manage campaigns</Link></li>
          </ul>
        </div>
      </div>
    </section>
  )
}
