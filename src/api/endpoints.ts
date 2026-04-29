import { apiRequest } from './client'
import type { Area, Campaign, PaginatedResponse, Task, TaskEvent, Team, TeamRole } from '../types/models'

export const healthCheck = () => apiRequest<{ status: string }>('/api/health')

type PaginatedCollectionResponse<T> = {
  data: T[]
  links?: unknown
  meta?: unknown
}

type UnknownPaginatedPayload<T> = {
  data?: unknown
  links?: unknown
  meta?: unknown
} | T[] | PaginatedResponse<T>

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

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}

const readNullableString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null

const readNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' ? value : fallback

const readNullableNumber = (value: unknown, fallback: number | null): number | null =>
  typeof value === 'number' ? value : fallback

const normalizePaginatedResponse = <T>(payload: UnknownPaginatedPayload<T>): PaginatedResponse<T> => {
  if (Array.isArray(payload)) {
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

  const safeData = Array.isArray(payload.data) ? payload.data as T[] : []
  const safeMeta = asRecord(payload.meta)
  const safeLinks = asRecord(payload.links)
  const derivedTotal = readNumber(safeMeta.total, safeData.length)

  return {
    data: safeData,
    links: {
      first: readNullableString(safeLinks.first),
      last: readNullableString(safeLinks.last),
      prev: readNullableString(safeLinks.prev),
      next: readNullableString(safeLinks.next),
    },
    meta: {
      current_page: readNumber(safeMeta.current_page, 1),
      from: readNullableNumber(safeMeta.from, safeData.length > 0 ? 1 : null),
      last_page: readNumber(safeMeta.last_page, 1),
      links: Array.isArray(safeMeta.links) ? safeMeta.links : [],
      path: readNullableString(safeMeta.path) ?? '',
      per_page: readNumber(safeMeta.per_page, safeData.length),
      to: readNullableNumber(safeMeta.to, safeData.length > 0 ? safeData.length : null),
      total: derivedTotal,
    },
  }
}

export const getTaskEventsPage = async (taskId: number) =>
  normalizePaginatedResponse(await apiRequest<UnknownPaginatedPayload<TaskEvent>>(`/api/tasks/${taskId}/events`))

export const getTaskEvents = async (taskId: number) =>
  (await getTaskEventsPage(taskId)).data
