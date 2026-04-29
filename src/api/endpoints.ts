import { apiRequest } from './client'
import type { Area, Campaign, PaginatedResponse, Task, TaskEvent, Team, TeamMembershipPayload } from '../types/models'

export const healthCheck = () => apiRequest<{ status: string }>('/api/health')

type PaginatedCollectionResponse<T> = { data: T[]; links?: unknown; meta?: unknown }
type UnknownPaginatedPayload<T> = { data?: unknown; links?: unknown; meta?: unknown } | T[] | PaginatedResponse<T>
type PaginationParams = { page?: number; per_page?: number }

const unwrapCollection = <T>(payload: T[] | PaginatedCollectionResponse<T>): T[] => {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload.data)) return payload.data
  throw new Error('Unexpected collection response format.')
}

export const getCampaigns = async () => unwrapCollection(await apiRequest<Campaign[] | PaginatedCollectionResponse<Campaign>>('/api/campaigns'))
export const getCampaignsPage = async (params?: PaginationParams) => normalizePaginatedResponse(await apiRequest<UnknownPaginatedPayload<Campaign>>(`/api/campaigns${buildQuery(params)}`))
export const getCampaign = (campaignId: number | string) => apiRequest<Campaign>(`/api/campaigns/${campaignId}`)
export const createCampaign = (payload: Partial<Campaign>) => apiRequest<Campaign>('/api/campaigns', { method: 'POST', body: JSON.stringify(payload) })
export const updateCampaign = (campaignId: number, payload: Partial<Campaign>) => apiRequest<Campaign>(`/api/campaigns/${campaignId}`, { method: 'PATCH', body: JSON.stringify(payload) })
export const deleteCampaign = (campaignId: number) => apiRequest<void>(`/api/campaigns/${campaignId}`, { method: 'DELETE' })

export const listAreas = async (params: PaginationParams = { per_page: 100 }) => normalizePaginatedResponse(await apiRequest<UnknownPaginatedPayload<Area>>(`/api/areas${buildQuery(params)}`))
export const getArea = (areaId: number) => apiRequest<Area>(`/api/areas/${areaId}`)
export const createArea = (payload: Partial<Area>) => apiRequest<Area>('/api/areas', { method: 'POST', body: JSON.stringify(payload) })
export const updateArea = (areaId: number, payload: Partial<Area>) => apiRequest<Area>(`/api/areas/${areaId}`, { method: 'PATCH', body: JSON.stringify(payload) })
export const deleteArea = (areaId: number) => apiRequest<void>(`/api/areas/${areaId}`, { method: 'DELETE' })

export const listCampaignAreas = async (campaignId: number, params: PaginationParams = { per_page: 100 }) => normalizePaginatedResponse(await apiRequest<UnknownPaginatedPayload<Area>>(`/api/campaigns/${campaignId}/areas${buildQuery(params)}`))
export const attachAreaToCampaign = (campaignId: number, areaId: number) => apiRequest(`/api/campaigns/${campaignId}/areas/${areaId}`, { method: 'POST' })
export const detachAreaFromCampaign = (campaignId: number, areaId: number) => apiRequest(`/api/campaigns/${campaignId}/areas/${areaId}`, { method: 'DELETE' })
export const createAreaForCampaign = (campaignId: number, payload: Partial<Area> & { area_id?: number }) => apiRequest<Area>(`/api/campaigns/${campaignId}/areas`, { method: 'POST', body: JSON.stringify(payload) })

export const listTeams = async (params: PaginationParams = { per_page: 100 }) => normalizePaginatedResponse(await apiRequest<UnknownPaginatedPayload<Team>>(`/api/teams${buildQuery(params)}`))
export const getTeam = (teamId: number) => apiRequest<Team>(`/api/teams/${teamId}`)
export const createTeam = (payload: Partial<Team>) => apiRequest<Team>('/api/teams', { method: 'POST', body: JSON.stringify(payload) })
export const updateTeam = (teamId: number, payload: Partial<Team>) => apiRequest<Team>(`/api/teams/${teamId}`, { method: 'PATCH', body: JSON.stringify(payload) })
export const deleteTeam = (teamId: number) => apiRequest<void>(`/api/teams/${teamId}`, { method: 'DELETE' })

export const listCampaignTeams = async (campaignId: number, params: PaginationParams = { per_page: 100 }) => normalizePaginatedResponse(await apiRequest<UnknownPaginatedPayload<Team>>(`/api/campaigns/${campaignId}/teams${buildQuery(params)}`))
export const attachTeamToCampaign = (campaignId: number, teamId: number) => apiRequest(`/api/campaigns/${campaignId}/teams/${teamId}`, { method: 'POST' })
export const detachTeamFromCampaign = (campaignId: number, teamId: number) => apiRequest(`/api/campaigns/${campaignId}/teams/${teamId}`, { method: 'DELETE' })
export const createTeamForCampaign = (campaignId: number, payload: Partial<Team> & { team_id?: number }) => apiRequest<Team>(`/api/campaigns/${campaignId}/teams`, { method: 'POST', body: JSON.stringify(payload) })

export const addUserToTeam = (teamId: number, payload: TeamMembershipPayload) => apiRequest(`/api/teams/${teamId}/users`, { method: 'POST', body: JSON.stringify(payload) })
export const updateTeamUser = (teamId: number, userId: number, payload: Omit<TeamMembershipPayload, 'user_id'>) => apiRequest(`/api/teams/${teamId}/users/${userId}`, { method: 'PATCH', body: JSON.stringify(payload) })
export const removeUserFromTeam = (teamId: number, userId: number) => apiRequest(`/api/teams/${teamId}/users/${userId}`, { method: 'DELETE' })

export const getTasksPage = async (campaignId: number, params?: PaginationParams) => normalizePaginatedResponse(await apiRequest<UnknownPaginatedPayload<Task>>(`/api/campaigns/${campaignId}/tasks${buildQuery(params)}`))
export const getTask = (taskId: number | string) => apiRequest<Task>(`/api/tasks/${taskId}`)
export const createTask = (campaignId: number, payload: Partial<Task>) => apiRequest<Task>(`/api/campaigns/${campaignId}/tasks`, { method: 'POST', body: JSON.stringify(payload) })
export const updateTask = (taskId: number, payload: Partial<Task>) => apiRequest<Task>(`/api/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(payload) })
export const deleteTask = (taskId: number) => apiRequest<void>(`/api/tasks/${taskId}`, { method: 'DELETE' })

const asRecord = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null ? value as Record<string, unknown> : {})
const readNullableString = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const readNumber = (value: unknown, fallback: number): number => (typeof value === 'number' ? value : fallback)
const readNullableNumber = (value: unknown, fallback: number | null): number | null => (typeof value === 'number' ? value : fallback)

const normalizePaginatedResponse = <T>(payload: UnknownPaginatedPayload<T>): PaginatedResponse<T> => {
  if (Array.isArray(payload)) {
    const total = payload.length
    return { data: payload, links: { first: null, last: null, prev: null, next: null }, meta: { current_page: 1, from: total > 0 ? 1 : null, last_page: 1, links: [], path: '', per_page: total, to: total > 0 ? total : null, total } }
  }
  const safeData = Array.isArray(payload.data) ? payload.data as T[] : []
  const safeMeta = asRecord(payload.meta)
  const safeLinks = asRecord(payload.links)
  const derivedTotal = readNumber(safeMeta.total, safeData.length)
  return { data: safeData, links: { first: readNullableString(safeLinks.first), last: readNullableString(safeLinks.last), prev: readNullableString(safeLinks.prev), next: readNullableString(safeLinks.next) }, meta: { current_page: readNumber(safeMeta.current_page, 1), from: readNullableNumber(safeMeta.from, safeData.length > 0 ? 1 : null), last_page: readNumber(safeMeta.last_page, 1), links: Array.isArray(safeMeta.links) ? safeMeta.links : [], path: readNullableString(safeMeta.path) ?? '', per_page: readNumber(safeMeta.per_page, safeData.length), to: readNullableNumber(safeMeta.to, safeData.length > 0 ? safeData.length : null), total: derivedTotal } }
}

export const getTaskEventsPage = async (taskId: number) => normalizePaginatedResponse(await apiRequest<UnknownPaginatedPayload<TaskEvent>>(`/api/tasks/${taskId}/events`))
export const getTaskEventsByPage = async (taskId: number, params?: PaginationParams) => normalizePaginatedResponse(await apiRequest<UnknownPaginatedPayload<TaskEvent>>(`/api/tasks/${taskId}/events${buildQuery(params)}`))

const buildQuery = (params?: PaginationParams) => {
  if (!params) return ''
  const searchParams = new URLSearchParams()
  if (typeof params.page === 'number') searchParams.set('page', String(params.page))
  if (typeof params.per_page === 'number') searchParams.set('per_page', String(params.per_page))
  const queryString = searchParams.toString()
  return queryString ? `?${queryString}` : ''
}
