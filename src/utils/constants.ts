import type { AssignmentStatus, AssignmentType, CampaignBoothLocationStatus, PosterLocationStatus, TeamRole } from '../types/models'

export const ASSIGNMENT_STATUSES = ['draft', 'active', 'paused', 'completed', 'cancelled'] as const satisfies readonly AssignmentStatus[]
export const ASSIGNMENT_TYPES = ['standard', 'letterbox_distribution', 'poster_free', 'poster_guided', 'campaign_booth'] as const satisfies readonly AssignmentType[]
export const POSTER_LOCATION_STATUSES = ['planned', 'installed', 'removed', 'damaged', 'missing'] as const satisfies readonly PosterLocationStatus[]
export const CAMPAIGN_BOOTH_LOCATION_STATUSES = ['planned', 'set_up', 'closed', 'cancelled', 'issue'] as const satisfies readonly CampaignBoothLocationStatus[]
export const TEAM_ROLES: TeamRole[] = ['member', 'lead']
export const MAP_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
export const MAP_ATTRIBUTION = '&copy; OpenStreetMap contributors'
