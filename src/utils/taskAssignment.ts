import type { Campaign, Task, UserTeam } from '../types/models'

export const CLOSED_TASK_STATUSES = new Set(['done', 'completed', 'cancelled', 'archived', 'deleted'])

export const isClosedTask = (task: Task) => CLOSED_TASK_STATUSES.has(String(task.status).toLowerCase())

export const assignedTeamId = (task: Task): number | null => {
  const value = task.assigned_team_id ?? task.assigned_team?.id
  return value == null ? null : Number(value)
}

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

export const isAssignedToLeadTeam = (task: Task, leadTeams: UserTeam[]): boolean => {
  const teamId = assignedTeamId(task)
  return teamId != null && leadTeams.some((team) => team.id === teamId)
}
