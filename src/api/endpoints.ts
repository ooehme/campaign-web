import { apiRequest } from './client'
import type { Area, Campaign, PaginatedResponse, Task, TaskEvent, Team, TeamRole } from '../types/models'

export const healthCheck = () => apiRequest<{ status: string }>('/api/health')

type PaginatedCollectionResponse<T> = {
  data: T[]
  links?: unknown
  meta?: unknown
}

const unwrapCollection = <T>(payload: T[] | PaginatedCollectionResponse<T>): T[] => {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload.data)) return payload.data
  throw new Error('Unexpected collection response format.')
}

export const getCampaigns = async () =>
  unwrapCollection(await apiRequest<Campaign[] | PaginatedCollectionResponse<Campaign>>('/api/campaigns'))
export const getCampaign = (campaignId: number | string) => apiRequest<Campaign>(`/api/campaigns/${campaignId}`)
export const createCampaign = (payload: Partial<Campaign>) => apiRequest<Campaign>('/api/campaigns', { method: 'POST', body: JSON.stringify(payload) })
export const updateCampaign = (campaignId: number, payload: Partial<Campaign>) => apiRequest<Campaign>(`/api/campaigns/${campaignId}`, { method: 'PATCH', body: JSON.stringify(payload) })
export const deleteCampaign = (campaignId: number) => apiRequest<void>(`/api/campaigns/${campaignId}`, { method: 'DELETE' })

export const getAreas = async (campaignId: number) =>
  unwrapCollection(await apiRequest<Area[] | PaginatedCollectionResponse<Area>>(`/api/campaigns/${campaignId}/areas`))
export const createArea = (campaignId: number, payload: Partial<Area>) => apiRequest<Area>(`/api/campaigns/${campaignId}/areas`, { method: 'POST', body: JSON.stringify(payload) })
export const updateArea = (areaId: number, payload: Partial<Area>) => apiRequest<Area>(`/api/areas/${areaId}`, { method: 'PATCH', body: JSON.stringify(payload) })
export const deleteArea = (areaId: number) => apiRequest<void>(`/api/areas/${areaId}`, { method: 'DELETE' })

export const getTeams = async (campaignId: number) =>
  unwrapCollection(await apiRequest<Team[] | PaginatedCollectionResponse<Team>>(`/api/campaigns/${campaignId}/teams`))
export const createTeam = (campaignId: number, payload: Partial<Team>) => apiRequest<Team>(`/api/campaigns/${campaignId}/teams`, { method: 'POST', body: JSON.stringify(payload) })
export const updateTeam = (teamId: number, payload: Partial<Team>) => apiRequest<Team>(`/api/teams/${teamId}`, { method: 'PATCH', body: JSON.stringify(payload) })
export const deleteTeam = (teamId: number) => apiRequest<void>(`/api/teams/${teamId}`, { method: 'DELETE' })
export const addTeamUser = (teamId: number, userId: number, role: TeamRole) => apiRequest(`/api/teams/${teamId}/users`, { method: 'POST', body: JSON.stringify({ user_id: userId, role }) })
export const updateTeamUser = (teamId: number, userId: number, role: TeamRole) => apiRequest(`/api/teams/${teamId}/users/${userId}`, { method: 'PATCH', body: JSON.stringify({ role }) })
export const removeTeamUser = (teamId: number, userId: number) => apiRequest(`/api/teams/${teamId}/users/${userId}`, { method: 'DELETE' })

export const getTasks = async (campaignId: number) =>
  unwrapCollection(await apiRequest<Task[] | PaginatedCollectionResponse<Task>>(`/api/campaigns/${campaignId}/tasks`))
export const getTask = (taskId: number | string) => apiRequest<Task>(`/api/tasks/${taskId}`)
export const createTask = (campaignId: number, payload: Partial<Task>) => apiRequest<Task>(`/api/campaigns/${campaignId}/tasks`, { method: 'POST', body: JSON.stringify(payload) })
export const updateTask = (taskId: number, payload: Partial<Task>) => apiRequest<Task>(`/api/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(payload) })
export const deleteTask = (taskId: number) => apiRequest<void>(`/api/tasks/${taskId}`, { method: 'DELETE' })

const normalizePaginatedResponse = <T>(payload: T[] | PaginatedResponse<T>): PaginatedResponse<T> => {
  if (!Array.isArray(payload)) return payload

  const total = payload.length

  return {
    data: payload,
    links: { first: null, last: null, prev: null, next: null },
    meta: {
      current_page: 1,
      from: total > 0 ? 1 : null,
      last_page: 1,
      links: [],
      path: '',
      per_page: total,
      to: total > 0 ? total : null,
      total,
    },
  }
}

export const getTaskEventsPage = async (taskId: number) =>
  normalizePaginatedResponse(await apiRequest<TaskEvent[] | PaginatedResponse<TaskEvent>>(`/api/tasks/${taskId}/events`))

export const getTaskEvents = async (taskId: number) =>
  (await getTaskEventsPage(taskId)).data
