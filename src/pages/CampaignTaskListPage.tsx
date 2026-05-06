import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getTasksPage, listCampaignTeams, listUserTeams, updateTask } from '../api/endpoints'
import { useAuth } from '../auth/AuthContext'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import { assignedTeamId, isAssignedToLeadTeam, isClosedTask, leadTeamsByAssignedCampaign } from '../utils/taskAssignment'
import type { Task, UserTeam } from '../types/models'

export function CampaignTaskListPage() {
  const { campaignId } = useParams()
  const id = Number(campaignId)
  const { user } = useAuth()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['tasks', id, page], queryFn: () => getTasksPage(id, { page, per_page: 100 }), enabled: Number.isFinite(id) })
  const assignedTeamsQuery = useQuery({ queryKey: ['campaign-teams', id], queryFn: () => listCampaignTeams(id, { per_page: 100 }), enabled: Number.isFinite(id) })
  const userTeamsQuery = useQuery({ queryKey: ['campaign-task-list-user-teams', user?.id], queryFn: () => listUserTeams(user!.id), enabled: Boolean(user?.id), retry: false })

  const assignedTeams = assignedTeamsQuery.data?.data ?? []
  const campaignTeamIds = new Set(assignedTeams.map((team) => team.id))
  const leadTeams = leadTeamsByAssignedCampaign((userTeamsQuery.data ?? []) as UserTeam[], campaignTeamIds)

  const assignTaskMutation = useMutation({
    mutationFn: ({ taskId, teamId }: { taskId: number; teamId: number | null }) => updateTask(taskId, { assigned_team_id: teamId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', id] })
      qc.invalidateQueries({ queryKey: ['dashboard-campaign-tasks'] })
      window.alert('Auftrag wurde aktualisiert.')
    },
    onError: () => window.alert('Auftrag konnte nicht aktualisiert werden.'),
  })

  const claimTask = (task: Task) => {
    if (assignedTeamId(task) || isClosedTask(task) || leadTeams.length === 0) return
    if (leadTeams.length === 1) {
      assignTaskMutation.mutate({ taskId: task.id, teamId: leadTeams[0].id })
      return
    }

    const promptValue = window.prompt(`Team-ID auswählen (${leadTeams.map((team) => `${team.id}: ${team.name}`).join(', ')})`)
    if (!promptValue) return
    const teamId = Number(promptValue)
    if (!leadTeams.some((team) => team.id === teamId)) {
      window.alert('Ungültiges Team ausgewählt.')
      return
    }
    assignTaskMutation.mutate({ taskId: task.id, teamId })
  }

  const releaseTask = (task: Task) => {
    if (!isAssignedToLeadTeam(task, leadTeams) || isClosedTask(task)) return
    assignTaskMutation.mutate({ taskId: task.id, teamId: null })
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Aufträge für Kampagne #{id}</h1>
        <Link className="text-sm text-blue-600" to={`/campaigns/${id}`}>Zur Kampagne</Link>
      </div>
      {isLoading && <LoadingState />}
      {isError && <ErrorState message={(error as Error).message} />}
      {assignedTeamsQuery.isError && <p className="text-sm text-red-700">Teams konnten nicht geladen werden.</p>}
      {userTeamsQuery.isError && <p className="text-sm text-slate-600">Eigene Teamrollen konnten nicht geladen werden.</p>}
      {data && data.data.length === 0 && <EmptyState message="Keine Aufträge gefunden." />}
      {data && data.data.length > 0 && (
        <div className="space-y-2">
          {data.data.map((task) => {
            const teamId = assignedTeamId(task)
            const assignedToOwnTeam = isAssignedToLeadTeam(task, leadTeams)
            const closed = isClosedTask(task)
            const claimDisabled = Boolean(teamId) || closed || leadTeams.length === 0 || assignTaskMutation.isPending
            const releaseDisabled = !assignedToOwnTeam || closed || assignTaskMutation.isPending
            return (
              <article key={task.id} className="flex flex-wrap items-center justify-between gap-3 rounded border bg-white p-3">
                <div>
                  <Link className="font-medium text-blue-600" to={`/tasks/${task.id}`}>{task.title}</Link>
                  <p className="text-sm text-slate-600">Status: {task.status} · Priorität: {task.priority}</p>
                  <p className="text-sm text-slate-600">Team: {task.assigned_team?.name ?? '-'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="rounded border px-2 py-1 text-sm disabled:opacity-50" disabled={claimDisabled} onClick={() => claimTask(task)}>
                    Für Team übernehmen
                  </button>
                  <button type="button" className="rounded border px-2 py-1 text-sm disabled:opacity-50" disabled={releaseDisabled} onClick={() => releaseTask(task)}>
                    Zurückgeben
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
      {data && data.meta.last_page > 1 && (
        <div className="flex items-center gap-2">
          <button type="button" className="border px-2 py-1 disabled:opacity-50" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>Zurück</button>
          <span className="text-xs text-slate-500">Seite {data.meta.current_page} von {data.meta.last_page}</span>
          <button type="button" className="border px-2 py-1 disabled:opacity-50" onClick={() => setPage((current) => Math.min(data.meta.last_page, current + 1))} disabled={page >= data.meta.last_page}>Weiter</button>
        </div>
      )}
    </section>
  )
}
