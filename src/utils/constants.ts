import type { TaskStatus, TeamRole } from '../types/models'

export const TASK_STATUSES: TaskStatus[] = ['open', 'assigned', 'in_progress', 'done', 'cancelled']
export const TEAM_ROLES: TeamRole[] = ['member', 'lead', 'admin']
export const MAP_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
export const MAP_ATTRIBUTION = '&copy; OpenStreetMap contributors'
