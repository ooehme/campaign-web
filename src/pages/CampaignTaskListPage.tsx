import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { getTasks } from '../api/endpoints'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'

export function CampaignTaskListPage() {
  const { campaignId } = useParams()
  const id = Number(campaignId)
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['tasks', id], queryFn: () => getTasks(id), enabled: Number.isFinite(id) })

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Tasks for Campaign #{id}</h1>
      {isLoading && <LoadingState />}
      {isError && <ErrorState message={(error as Error).message} />}
      {data && data.length === 0 && <EmptyState message="No tasks found." />}
      {data && data.length > 0 && (
        <div className="space-y-2">
          {data.map((task) => (
            <article key={task.id} className="rounded border bg-white p-3">
              <Link className="font-medium text-blue-600" to={`/tasks/${task.id}`}>{task.title}</Link>
              <p className="text-sm">Status: {task.status}, priority: {task.priority}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
