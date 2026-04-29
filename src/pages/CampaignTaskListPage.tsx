import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getTasksPage } from '../api/endpoints'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'

export function CampaignTaskListPage() {
  const { campaignId } = useParams()
  const id = Number(campaignId)
  const [page, setPage] = useState(1)
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['tasks', id, page], queryFn: () => getTasksPage(id, { page, per_page: 100 }), enabled: Number.isFinite(id) })

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Tasks for Campaign #{id}</h1>
      {isLoading && <LoadingState />}
      {isError && <ErrorState message={(error as Error).message} />}
      {data && data.data.length === 0 && <EmptyState message="No tasks found." />}
      {data && data.data.length > 0 && (
        <div className="space-y-2">
          {data.data.map((task) => (
            <article key={task.id} className="rounded border bg-white p-3">
              <Link className="font-medium text-blue-600" to={`/tasks/${task.id}`}>{task.title}</Link>
              <p className="text-sm">Status: {task.status}, priority: {task.priority}</p>
            </article>
          ))}
        </div>
      )}
      {data && data.meta.last_page > 1 && (
        <div className="flex items-center gap-2">
          <button type="button" className="border px-2 py-1 disabled:opacity-50" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>Previous</button>
          <span className="text-xs text-slate-500">Page {data.meta.current_page} of {data.meta.last_page}</span>
          <button type="button" className="border px-2 py-1 disabled:opacity-50" onClick={() => setPage((current) => Math.min(data.meta.last_page, current + 1))} disabled={page >= data.meta.last_page}>Next</button>
        </div>
      )}
    </section>
  )
}
