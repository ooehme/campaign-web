import type { Assignment, AssignmentStatus, AssignmentType, Campaign, Team, UserTeam } from '../types/models'

export const CLOSED_ASSIGNMENT_STATUSES = new Set<AssignmentStatus>(['completed', 'cancelled'])

export const assignmentStatusLabel: Record<AssignmentStatus, string> = {
  draft: 'Entwurf',
  active: 'Aktiv',
  paused: 'Pausiert',
  completed: 'Abgeschlossen',
  cancelled: 'Abgebrochen',
}

export const assignmentTypeLabel: Record<AssignmentType, string> = {
  standard: 'Standardauftrag',
  letterbox_distribution: 'Briefkastenverteilung',
  poster_free: 'Freie Plakatierung',
  poster_guided: 'Geführte Plakatierung',
}

export const isClosedAssignment = (assignment: Assignment) => CLOSED_ASSIGNMENT_STATUSES.has(assignment.status)

export const assignedTeamId = (assignment: Assignment): number | null => {
  const value = assignment.teamId ?? assignment.team_id ?? assignment.team?.id
  return value == null ? null : Number(value)
}

export const assignmentCampaignId = (assignment: Assignment): number | null => {
  const value = assignment.campaignId ?? assignment.campaign_id ?? assignment.campaign?.id
  return value == null ? null : Number(value)
}

export const assignmentDueAt = (assignment: Assignment): string | null => assignment.dueAt ?? assignment.due_at ?? null

export const campaignRefId = (campaign: Pick<Campaign, 'id'>): number => Number(campaign.id)

export const uniqueCampaigns = (campaigns: Campaign[]): Campaign[] => {
  const seen = new Set<number>()
  return campaigns.filter((campaign) => {
    const id = campaignRefId(campaign)
    if (!Number.isFinite(id) || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

export const teamCampaigns = (teams: Array<{ campaigns?: Campaign[] }>): Campaign[] =>
  teams.flatMap((team) => (Array.isArray(team.campaigns) ? team.campaigns : []) as Campaign[])

export const leadTeamsForCampaign = (teams: UserTeam[], campaignId: number): UserTeam[] =>
  teams.filter((team) =>
    team.pivot?.role === 'lead' &&
    Array.isArray(team.campaigns) &&
    team.campaigns.some((campaign) => Number(campaign.id) === campaignId),
  )

export const leadTeamsByAssignedCampaign = (teams: UserTeam[], campaignTeamIds: Set<number>): UserTeam[] =>
  teams.filter((team) => team.pivot?.role === 'lead' && campaignTeamIds.has(team.id))

export const leadTeamsFromCampaignTeams = (teams: Team[], userId?: number | null): UserTeam[] => {
  if (!userId) return []
  return teams
    .filter((team) => team.users?.some((member) => member.id === userId && member.pivot?.role === 'lead'))
    .map((team) => ({ id: team.id, name: team.name, campaigns: team.campaigns, pivot: { role: 'lead' } }))
}

export const uniqueTeams = <T extends { id: number }>(teams: T[]): T[] => {
  const seen = new Set<number>()
  return teams.filter((team) => {
    if (seen.has(team.id)) return false
    seen.add(team.id)
    return true
  })
}

export const isAssignedToLeadTeam = (assignment: Assignment, leadTeams: UserTeam[]): boolean => {
  const teamId = assignedTeamId(assignment)
  return teamId != null && leadTeams.some((team) => team.id === teamId)
}
