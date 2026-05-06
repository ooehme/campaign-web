import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { listAssignments, listCampaignAssignments, listTeamAssignments, listUserAssignments, updateAssignment } from '../api/endpoints'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import { assignedTeamId, assignmentStatusLabel, assignmentTypeLabel, isClosedAssignment } from '../utils/assignment'
import type { Assignment } from '../types/models'

const formatDate = (value?: string | null) => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('de-DE')
}

export function AssignmentListPage() {
  const { campaignId, teamId, userId } = useParams()
  const campaign = campaignId ? Number(campaignId) : null
  const team = teamId ? Number(teamId) : null
  const user = userId ? Number(userId) : null
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const scopedQueryKey = campaign ? ['assignments', 'campaign', campaign, page] : team ? ['assignments', 'team', team, page] : user ? ['assignments', 'user', user] : ['assignments', page]

  const assignmentsQuery = useQuery({
    queryKey: scopedQueryKey,
    queryFn: async () => {
      if (campaign) return listCampaignAssignments(campaign, { page, per_page: 100 })
      if (team) return listTeamAssignments(team, { page, per_page: 100 })
      if (user) {
        const rows = await listUserAssignments(user)
        return { data: rows, meta: { current_page: 1, last_page: 1, from: rows.length ? 1 : null, to: rows.length, total: rows.length, per_page: rows.length, path: '', links: [] }, links: { first: null, last: null, prev: null, next: null } }
      }
      return listAssignments({ page, per_page: 100 })
    },
  })

  const assignMutation = useMutation({
    mutationFn: ({ assignmentId, nextTeamId }: { assignmentId: number; nextTeamId: number | null }) => updateAssignment(assignmentId, { teamId: nextTeamId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments'] })
      qc.invalidateQueries({ queryKey: ['dashboard-campaign-assignments'] })
      window.alert('Auftrag wurde aktualisiert.')
    },
    onError: () => window.alert('Auftrag konnte nicht aktualisiert werden.'),
  })

  const assignments = assignmentsQuery.data?.data ?? []
  const title = campaign ? `Aufträge für Kampagne #${campaign}` : team ? `Aufträge für Team #${team}` : user ? `Aufträge für Benutzer #${user}` : 'Aufträge'
  const backTo = campaign ? `/campaigns/${campaign}` : team ? `/teams/${team}` : user ? `/users/${user}` : '/dashboard'
  const canCreateForCampaign = Boolean(campaign)

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <Link className="text-sm text-blue-600" to={backTo}>Zurück</Link>
        </div>
        {canCreateForCampaign && <Link className="rounded bg-blue-600 px-3 py-2 text-sm text-white" to={`/campaigns/${campaign}/assignments/new`}>Auftrag erstellen</Link>}
        {!canCreateForCampaign && !team && !user && <Link className="rounded bg-blue-600 px-3 py-2 text-sm text-white" to="/assignments/new">Auftrag erstellen</Link>}
      </div>
      {assignmentsQuery.isLoading && <LoadingState />}
      {assignmentsQuery.isError && <ErrorState message={(assignmentsQuery.error as Error).message} />}
      {assignments.length === 0 && !assignmentsQuery.isLoading && <EmptyState message="Keine Aufträge gefunden." />}
      {assignments.length > 0 && (
        <div className="space-y-2">
          {assignments.map((assignment: Assignment) => {
            const closed = isClosedAssignment(assignment)
            return (
              <article key={assignment.id} className="flex flex-wrap items-center justify-between gap-3 rounded border bg-white p-3">
                <div>
                  <Link className="font-medium text-blue-600" to={`/assignments/${assignment.id}`}>{assignment.title}</Link>
                  <p className="text-sm text-slate-600">{assignmentTypeLabel[assignment.type]} · {assignmentStatusLabel[assignment.status]}</p>
                  <p className="text-sm text-slate-600">Team: {assignment.team?.name ?? assignment.teamId ?? '-'} · Fällig: {formatDate(assignment.dueAt)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!team && <span className="rounded border px-2 py-1 text-sm">Team-ID: {assignedTeamId(assignment) ?? '-'}</span>}
                  {team && (
                    <button type="button" className="rounded border px-2 py-1 text-sm disabled:opacity-50" disabled={closed || assignMutation.isPending} onClick={() => assignMutation.mutate({ assignmentId: assignment.id, nextTeamId: null })}>
                      Zurückgeben
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
      {assignmentsQuery.data && assignmentsQuery.data.meta.last_page > 1 && (
        <div className="flex items-center gap-2">
          <button type="button" className="border px-2 py-1 disabled:opacity-50" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>Zurück</button>
          <span className="text-xs text-slate-500">Seite {assignmentsQuery.data.meta.current_page} von {assignmentsQuery.data.meta.last_page}</span>
          <button type="button" className="border px-2 py-1 disabled:opacity-50" onClick={() => setPage((current) => Math.min(assignmentsQuery.data.meta.last_page, current + 1))} disabled={page >= assignmentsQuery.data.meta.last_page}>Weiter</button>
        </div>
      )}
    </section>
  )
}
