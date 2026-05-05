import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { healthCheck, listCampaignTasks, listCurrentUserInvitations, listUserTeams, updateTask } from '../api/endpoints'
import { ErrorState, LoadingState } from '../components/UiState'
import { useAuth } from '../auth/AuthContext'
import { hasVisibleModuleNavigation } from '../utils/navigation'
import type { Campaign, Task, UserTeam } from '../types/models'

const CLOSED_STATUSES = new Set(['done', 'completed', 'cancelled', 'archived', 'deleted'])

const formatDate = (value?: string | null) => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('de-DE')
}

export function DashboardPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const hasModuleNavigation = hasVisibleModuleNavigation(user)
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['health'], queryFn: healthCheck })
  const invitationsQuery = useQuery({ queryKey: ['user-invitations'], queryFn: listCurrentUserInvitations, retry: false })

  const campaigns = (user?.campaigns ?? []) as Campaign[]
  const userTeamsQuery = useQuery({
    queryKey: ['dashboard-user-teams', user?.id],
    queryFn: () => listUserTeams(user!.id),
    enabled: Boolean(user?.id),
    retry: false,
  })

  const taskBoardQuery = useQuery({
    queryKey: ['dashboard-campaign-tasks', campaigns.map((c) => c.id).join(',')],
    enabled: campaigns.length > 0,
    queryFn: async () => {
      const responses = await Promise.all(campaigns.map((campaign) => listCampaignTasks(campaign.id, { per_page: 100 })))
      const campaignNameById = new Map(campaigns.map((campaign) => [campaign.id, campaign.name]))
      const tasks = responses.flatMap((response) => response.data)
      return { tasks, campaignNameById }
    },
    retry: false,
  })

  const leadTeams = (userTeamsQuery.data ?? []).filter((team: UserTeam) => team.pivot?.role === 'lead')
  const memberTeamIds = new Set((userTeamsQuery.data ?? []).map((team: UserTeam) => team.id))

  const openTasks = (taskBoardQuery.data?.tasks ?? []).filter((task) =>
    !task.assigned_team_id && !CLOSED_STATUSES.has(String(task.status).toLowerCase()),
  )

  const claimedTasks = (taskBoardQuery.data?.tasks ?? []).filter((task) =>
    Boolean(task.assigned_team_id) && memberTeamIds.has(Number(task.assigned_team_id)) && !CLOSED_STATUSES.has(String(task.status).toLowerCase()),
  )

  const claimTaskMutation = useMutation({
    mutationFn: async ({ taskId, teamId }: { taskId: number; teamId: number }) => updateTask(taskId, { assigned_team_id: teamId }),
    onSuccess: () => {
      window.alert('Aufgabe wurde übernommen.')
      qc.invalidateQueries({ queryKey: ['dashboard-campaign-tasks'] })
    },
    onError: () => {
      window.alert('Aufgabe konnte nicht übernommen werden.')
    },
  })

  const claimTask = (task: Task) => {
    if (leadTeams.length === 0 || !task.can?.assign_team) return
    if (leadTeams.length === 1) {
      claimTaskMutation.mutate({ taskId: task.id, teamId: leadTeams[0].id })
      return
    }

    const promptValue = window.prompt(`Team-ID auswählen (${leadTeams.map((team) => `${team.id}: ${team.name}`).join(', ')})`)
    if (!promptValue) return
    const teamId = Number(promptValue)
    if (!leadTeams.some((team) => team.id === teamId)) {
      window.alert('Ungültiges Team ausgewählt.')
      return
    }
    claimTaskMutation.mutate({ taskId: task.id, teamId })
  }

  const showTaskLoading = userTeamsQuery.isLoading || taskBoardQuery.isLoading
  const showTaskError = userTeamsQuery.isError || taskBoardQuery.isError

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

        <div className="rounded border bg-white p-4 md:col-span-2">
          <h2 className="font-medium">Offene Aufgaben</h2>
          {showTaskLoading && <LoadingState />}
          {showTaskError && <p className="text-sm text-red-700">Aufgaben konnten nicht geladen werden.</p>}
          {!showTaskLoading && !showTaskError && openTasks.length === 0 && <p className="text-sm">Keine offenen Aufgaben vorhanden.</p>}
          {!showTaskLoading && !showTaskError && openTasks.length > 0 && (
            <div className="space-y-2 mt-2">
              {openTasks.map((task) => (
                <div key={task.id} className="rounded border p-3 text-sm flex flex-wrap gap-3 items-center justify-between">
                  <div>
                    <p className="font-medium">{task.title}</p>
                    <p>Kampagne: {taskBoardQuery.data?.campaignNameById.get(task.campaign_id) ?? task.campaign_id}</p>
                    <p>Status: {task.status}</p>
                    <p>Fällig: {formatDate(task.due_at)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link className="text-blue-600" to={`/tasks/${task.id}`}>Details</Link>
                    {task.can?.assign_team && leadTeams.length > 0 && <button className="rounded border px-2 py-1" onClick={() => claimTask(task)}>Für Team übernehmen</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded border bg-white p-4 md:col-span-2">
          <h2 className="font-medium">Übernommene Aufgaben</h2>
          {showTaskLoading && <LoadingState />}
          {showTaskError && <p className="text-sm text-red-700">Aufgaben konnten nicht geladen werden.</p>}
          {!showTaskLoading && !showTaskError && claimedTasks.length === 0 && <p className="text-sm">Keine übernommenen Aufgaben vorhanden.</p>}
          {!showTaskLoading && !showTaskError && claimedTasks.length > 0 && (
            <div className="space-y-2 mt-2">
              {claimedTasks.map((task) => (
                <div key={task.id} className="rounded border p-3 text-sm flex flex-wrap gap-3 items-center justify-between">
                  <div>
                    <p className="font-medium">{task.title}</p>
                    <p>Kampagne: {taskBoardQuery.data?.campaignNameById.get(task.campaign_id) ?? task.campaign_id}</p>
                    <p>Team: {task.assigned_team?.name ?? task.assigned_team_id}</p>
                    <p>Status: {task.status}</p>
                    <p>Fällig: {formatDate(task.due_at)}</p>
                  </div>
                  <Link className="text-blue-600" to={`/tasks/${task.id}`}>Details</Link>
                </div>
              ))}
            </div>
          )}
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
