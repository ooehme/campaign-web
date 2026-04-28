import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { healthCheck } from '../api/endpoints'
import { ErrorState, LoadingState } from '../components/UiState'

export function DashboardPage() {
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['health'], queryFn: healthCheck })

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
          <h2 className="font-medium">Quick Links</h2>
          <ul className="mt-2 list-disc pl-5 text-sm">
            <li><Link className="text-blue-600" to="/campaigns">Manage campaigns</Link></li>
          </ul>
        </div>
      </div>
    </section>
  )
}
