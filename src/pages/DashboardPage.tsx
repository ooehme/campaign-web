import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { acceptTeamInvitation, declineTeamInvitation, getTeam, healthCheck, listCampaignAssignments, listCurrentUserInvitations, listUserTeams, updateAssignment } from '../api/endpoints'
import { ErrorState, LoadingState } from '../components/UiState'
import { useAuth } from '../auth/AuthContext'
import { hasVisibleModuleNavigation } from '../utils/navigation'
import { assignedTeamId, assignmentCampaignId, isAssignedToLeadTeam, isClosedAssignment, leadTeamsForCampaign, teamCampaigns, uniqueCampaigns } from '../utils/assignment'
import type { Assignment, Campaign, Team, TeamInvitation, UserTeam } from '../types/models'

const asArray = <T,>(value: T[] | null | undefined): T[] => (Array.isArray(value) ? value : [])

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

  const userTeamsQuery = useQuery({
    queryKey: ['dashboard-user-teams', user?.id],
    queryFn: () => listUserTeams(user!.id),
    enabled: Boolean(user?.id),
    retry: false,
  })

  const userTeams = asArray<UserTeam>(userTeamsQuery.data)
  const teamDetailsQuery = useQuery({
    queryKey: ['dashboard-team-details', userTeams.map((team) => team.id).join(',')],
    queryFn: () => Promise.all(userTeams.map((team) => getTeam(team.id))),
    enabled: userTeams.length > 0,
    retry: false,
  })

  const teamDetails = asArray<Team>(teamDetailsQuery.data)
  const enrichedUserTeams = userTeams.map((team) => ({
    ...team,
    campaigns: team.campaigns ?? teamDetails.find((detail) => detail.id === team.id)?.campaigns,
    pivot: team.pivot ?? teamDetails.find((detail) => detail.id === team.id)?.users?.find((member) => member.id === user?.id)?.pivot,
  }))
  const campaigns = uniqueCampaigns([...asArray<Campaign>(user?.campaigns), ...teamCampaigns(enrichedUserTeams), ...teamCampaigns(teamDetails)])
  const campaignIds = campaigns.map((campaign) => campaign.id)

  const assignmentBoardQuery = useQuery({
    queryKey: ['dashboard-campaign-assignments', campaignIds.join(',')],
    enabled: campaigns.length > 0,
    queryFn: async () => {
      const responses = await Promise.all(campaigns.map((campaign) => listCampaignAssignments(campaign.id, { per_page: 100 })))
      const campaignNameById = new Map(campaigns.map((campaign) => [campaign.id, campaign.name]))
      const assignments = responses.flatMap((response) => asArray<Assignment>(response.data))
      return { assignments, campaignNameById }
    },
    retry: false,
  })

  const invitations = asArray(invitationsQuery.data)
  const pendingInvitations = invitations.filter((i) => i.status === 'pending')
  const memberTeamIds = new Set(enrichedUserTeams.map((team) => team.id))

  const openAssignments = (assignmentBoardQuery.data?.assignments ?? []).filter((assignment) =>
    !assignedTeamId(assignment) && !isClosedAssignment(assignment),
  )

  const claimedAssignments = (assignmentBoardQuery.data?.assignments ?? []).filter((assignment) =>
    Boolean(assignedTeamId(assignment)) && memberTeamIds.has(Number(assignedTeamId(assignment))) && !isClosedAssignment(assignment),
  )

  const assignAssignmentMutation = useMutation({
    mutationFn: async ({ assignmentId, teamId }: { assignmentId: number; teamId: number | null }) => updateAssignment(assignmentId, { team_id: teamId }),
    onSuccess: () => {
      window.alert('Auftrag wurde aktualisiert.')
      qc.invalidateQueries({ queryKey: ['dashboard-campaign-assignments'] })
      qc.invalidateQueries({ queryKey: ['assignments'] })
    },
    onError: () => {
      window.alert('Auftrag konnte nicht aktualisiert werden.')
    },
  })

  const invitationActionMutation = useMutation({
    mutationFn: ({ invitationId, action }: { invitationId: number; action: 'accept' | 'decline' }) =>
      action === 'accept' ? acceptTeamInvitation(invitationId) : declineTeamInvitation(invitationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-invitations'] })
      qc.invalidateQueries({ queryKey: ['dashboard-user-teams', user?.id] })
      qc.invalidateQueries({ queryKey: ['dashboard-team-details'] })
      qc.invalidateQueries({ queryKey: ['auth', 'user'] })
      window.alert('Einladung wurde aktualisiert.')
    },
    onError: () => {
      window.alert('Einladung konnte nicht aktualisiert werden.')
    },
  })

  const handleInvitationAction = (invitation: TeamInvitation, action: 'accept' | 'decline') => {
    invitationActionMutation.mutate({ invitationId: invitation.id, action })
  }

  const claimAssignment = (assignment: Assignment) => {
    const campaignId = assignmentCampaignId(assignment)
    const campaignLeadTeams = campaignId == null ? [] : leadTeamsForCampaign(enrichedUserTeams, campaignId)
    if (campaignLeadTeams.length === 0 || assignedTeamId(assignment) || isClosedAssignment(assignment)) return
    if (campaignLeadTeams.length === 1) {
      assignAssignmentMutation.mutate({ assignmentId: assignment.id, teamId: campaignLeadTeams[0].id })
      return
    }

    const promptValue = window.prompt(`Team-ID auswählen (${campaignLeadTeams.map((team) => `${team.id}: ${team.name}`).join(', ')})`)
    if (!promptValue) return
    const teamId = Number(promptValue)
    if (!campaignLeadTeams.some((team) => team.id === teamId)) {
      window.alert('Ungültiges Team ausgewählt.')
      return
    }
    assignAssignmentMutation.mutate({ assignmentId: assignment.id, teamId })
  }

  const releaseAssignment = (assignment: Assignment) => {
    const campaignId = assignmentCampaignId(assignment)
    const campaignLeadTeams = campaignId == null ? [] : leadTeamsForCampaign(enrichedUserTeams, campaignId)
    if (!isAssignedToLeadTeam(assignment, campaignLeadTeams) || isClosedAssignment(assignment)) return
    assignAssignmentMutation.mutate({ assignmentId: assignment.id, teamId: null })
  }

  const leadTeamsForAssignment = (assignment: Assignment) => {
    const campaignId = assignmentCampaignId(assignment)
    return campaignId == null ? [] : leadTeamsForCampaign(enrichedUserTeams, campaignId)
  }

  const campaignLabel = (assignment: Assignment) => {
    const campaignId = assignmentCampaignId(assignment)
    return campaignId == null ? '-' : assignmentBoardQuery.data?.campaignNameById.get(campaignId) ?? campaignId
  }

  const showAssignmentLoading = userTeamsQuery.isLoading || teamDetailsQuery.isLoading || (campaigns.length > 0 && assignmentBoardQuery.isLoading)
  const showAssignmentError = userTeamsQuery.isError || teamDetailsQuery.isError || assignmentBoardQuery.isError

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
          {pendingInvitations.length === 0 && <p className="text-sm">Keine offenen Einladungen.</p>}
          <ul className="space-y-2">{pendingInvitations.map((inv) => <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm"><span>{inv.team?.name ?? '-'} ({inv.role})</span><span className="flex gap-2"><button type="button" className="rounded bg-emerald-700 px-2 py-1 text-white disabled:opacity-50" disabled={inv.can?.accept === false || invitationActionMutation.isPending} onClick={() => handleInvitationAction(inv, 'accept')}>Annehmen</button><button type="button" className="rounded border border-red-300 px-2 py-1 text-red-700 disabled:opacity-50" disabled={inv.can?.decline === false || invitationActionMutation.isPending} onClick={() => handleInvitationAction(inv, 'decline')}>Zurückweisen</button></span></li>)}</ul>
        </div>

        <div className="rounded border bg-white p-4 md:col-span-2">
          <h2 className="font-medium">Offene Aufträge</h2>
          {showAssignmentLoading && <LoadingState />}
          {showAssignmentError && <p className="text-sm text-red-700">Aufträge konnten nicht geladen werden.</p>}
          {!showAssignmentLoading && !showAssignmentError && openAssignments.length === 0 && <p className="text-sm">Keine offenen Aufträge vorhanden.</p>}
          {!showAssignmentLoading && !showAssignmentError && openAssignments.length > 0 && (
            <div className="space-y-2 mt-2">
              {openAssignments.map((assignment) => (
                <div key={assignment.id} className="rounded border p-3 text-sm flex flex-wrap gap-3 items-center justify-between">
                  <div>
                    <p className="font-medium">{assignment.title}</p>
                    <p>Kampagne: {campaignLabel(assignment)}</p>
                    <p>Status: {assignment.status}</p>
                    <p>Fällig: {formatDate(assignment.dueAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link className="text-blue-600" to={`/assignments/${assignment.id}`}>Details</Link>
                    <button className="rounded border px-2 py-1 disabled:opacity-50" disabled={leadTeamsForAssignment(assignment).length === 0 || assignAssignmentMutation.isPending} onClick={() => claimAssignment(assignment)}>Für Team übernehmen</button>
                    <button className="rounded border px-2 py-1 disabled:opacity-50" disabled onClick={() => releaseAssignment(assignment)}>Zurückgeben</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded border bg-white p-4 md:col-span-2">
          <h2 className="font-medium">Übernommene Aufträge</h2>
          {showAssignmentLoading && <LoadingState />}
          {showAssignmentError && <p className="text-sm text-red-700">Aufträge konnten nicht geladen werden.</p>}
          {!showAssignmentLoading && !showAssignmentError && claimedAssignments.length === 0 && <p className="text-sm">Keine übernommenen Aufträge vorhanden.</p>}
          {!showAssignmentLoading && !showAssignmentError && claimedAssignments.length > 0 && (
            <div className="space-y-2 mt-2">
              {claimedAssignments.map((assignment) => (
                <div key={assignment.id} className="rounded border p-3 text-sm flex flex-wrap gap-3 items-center justify-between">
                  <div>
                    <p className="font-medium">{assignment.title}</p>
                    <p>Kampagne: {campaignLabel(assignment)}</p>
                    <p>Team: {assignment.team?.name ?? assignedTeamId(assignment) ?? '-'}</p>
                    <p>Status: {assignment.status}</p>
                    <p>Fällig: {formatDate(assignment.dueAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link className="text-blue-600" to={`/assignments/${assignment.id}`}>Details</Link>
                    <button className="rounded border px-2 py-1 disabled:opacity-50" disabled onClick={() => claimAssignment(assignment)}>Für Team übernehmen</button>
                    <button className="rounded border px-2 py-1 disabled:opacity-50" disabled={!isAssignedToLeadTeam(assignment, leadTeamsForAssignment(assignment)) || assignAssignmentMutation.isPending} onClick={() => releaseAssignment(assignment)}>Zurückgeben</button>
                  </div>
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
