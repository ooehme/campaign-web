import { ApiError, apiRequest } from './client'
import type { Area, AreaBuilding, Assignment, AssignmentBuilding, CampaignBoothLocation, GeoJsonFeatureCollection, RolePermissionMatrixResponse, RolePermissionUpdatePayload, PaginatedResponse, PosterLocation, Team, TeamInvitation, TeamMembershipPayload, User, UserTeam, Campaign } from '../types/models'

export type PaginationParams = { page?: number; per_page?: number }
export type LoginPayload = { email: string; password: string; device_name?: string }
export type LoginResponse = { token: string; user: User }
export type ImportAreaBuildingsProgress = {
  event?: 'import_started' | 'chunk_started' | 'chunk_finished' | 'waiting_for_overpass_slot' | 'overpass_retry_wait' | string
  chunk?: number
  cursor?: number | string
  chunk_size_meters?: number
  chunks_total?: number
  chunks_processed?: number
  chunks_failed?: number
  complete?: boolean
  next_chunk?: number | string | null
  attempt?: number
  attempts_total?: number
  http_status?: number | string
  available_slots?: number
  rate_limit?: number
  wait_seconds?: number
  message?: string
  buildings_imported?: number
}

type ImportAreaBuildingsResponse = AreaBuilding[] | {
  data?: AreaBuilding[]
  area_buildings?: AreaBuilding[]
  buildings?: AreaBuilding[]
  message?: string
  meta?: { import?: ImportAreaBuildingsProgress }
}

const logAreaBuildingsImport = (id: number | string, message: string, details?: unknown) => {
  const prefix = `[OSM Import area:${id}]`
  if (details === undefined) {
    console.info(prefix, message)
    return
  }
  console.info(prefix, message, details)
}

const buildQuery = (params?: PaginationParams) => {
  if (!params) return ''
  const searchParams = new URLSearchParams()
  if (typeof params.page === 'number') searchParams.set('page', String(params.page))
  if (typeof params.per_page === 'number') searchParams.set('per_page', String(params.per_page))
  const queryString = searchParams.toString()
  return queryString ? `?${queryString}` : ''
}

const requestPaginated = <T>(path: string): Promise<PaginatedResponse<T>> =>
  apiRequest<PaginatedResponse<T>>(path)
const requestResource = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await apiRequest<T | { data?: T }>(path, init)
  if (response && typeof response === 'object' && 'data' in response) {
    return (response as { data?: T }).data as T
  }
  return response as T
}

const normalizeAreaBuildingsResponse = (response: ImportAreaBuildingsResponse) => {
  if (response && typeof response === 'object' && 'data' in response) return response.data ?? []
  if (response && typeof response === 'object' && 'area_buildings' in response) return response.area_buildings ?? []
  if (response && typeof response === 'object' && 'buildings' in response) return response.buildings ?? []
  return Array.isArray(response) ? response : []
}

const getAreaBuildingsImportMeta = (response: ImportAreaBuildingsResponse) =>
  response && typeof response === 'object' && !Array.isArray(response) ? response.meta?.import : undefined

const buildAreaBuildingsImportPath = (id: number | string, cursor: number | string) => {
  const searchParams = new URLSearchParams({ cursor: String(cursor) })
  return `/api/areas/${id}/buildings/import-osm?${searchParams.toString()}`
}

const normalizeFeaturePermissions = (response: RolePermissionMatrixResponse): RolePermissionMatrixResponse => ({
  permissions: (response.permissions ?? []).map((permission) => ({ ...permission })),
  roles: (response.roles ?? []).map((role) => ({ ...role })),
  matrix: (response.matrix ?? []).map((row) => ({ ...row, enabled: row.enabled === true })),
})

export const health = () => apiRequest<{ status: string }>('/api/health')
export const login = (payload: LoginPayload) => apiRequest<LoginResponse>('/api/login', { method: 'POST', body: JSON.stringify({ ...payload, device_name: payload.device_name ?? 'frontend' }) })
export const logout = () => apiRequest<void>('/api/logout', { method: 'POST' })
export const getCurrentUser = () => requestResource<User>('/api/user')

export const getFeaturePermissions = async () =>
  normalizeFeaturePermissions(await requestResource<RolePermissionMatrixResponse>('/api/feature-permissions'))
export const updateFeaturePermissions = async (payload: RolePermissionUpdatePayload) => {
  const response = await apiRequest<{ data: RolePermissionMatrixResponse }>('/api/feature-permissions', { method: 'PATCH', body: JSON.stringify(payload) })
  return normalizeFeaturePermissions(response.data)
}

export const listCampaigns = (params?: PaginationParams) => requestPaginated<Campaign>(`/api/campaigns${buildQuery(params)}`)
export const getCampaign = (id: number | string) => requestResource<Campaign>(`/api/campaigns/${id}`)
export const createCampaign = (payload: Partial<Campaign>) => apiRequest<Campaign>('/api/campaigns', { method: 'POST', body: JSON.stringify(payload) })
export const updateCampaign = (id: number, payload: Partial<Campaign>) => apiRequest<Campaign>(`/api/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
export const deleteCampaign = (id: number) => apiRequest<void>(`/api/campaigns/${id}`, { method: 'DELETE' })

export const listAreas = (params?: PaginationParams) => requestPaginated<Area>(`/api/areas${buildQuery(params)}`)
export const createArea = (payload: Partial<Area>) => apiRequest<Area>('/api/areas', { method: 'POST', body: JSON.stringify(payload) })
export const getArea = (id: number) => requestResource<Area>(`/api/areas/${id}`)
export const updateArea = (id: number, payload: Partial<Area>) => apiRequest<Area>(`/api/areas/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
export const deleteArea = (id: number) => apiRequest<void>(`/api/areas/${id}`, { method: 'DELETE' })
export const listAreaBuildings = async (id: number | string) => {
  const response = await apiRequest<ImportAreaBuildingsResponse>(`/api/areas/${id}/buildings`)
  return normalizeAreaBuildingsResponse(response)
}
export const importAreaBuildingsFromOsm = async (
  id: number | string,
  options?: { onProgress?: (progress: ImportAreaBuildingsProgress) => void },
) => {
  logAreaBuildingsImport(id, 'cursor import started')
  options?.onProgress?.({ event: 'import_started', cursor: 1 })

  let cursor: number | string = 1
  let batch = 0

  while (true) {
    batch += 1
    logAreaBuildingsImport(id, `requesting cursor ${cursor}`)
    const response = await apiRequest<ImportAreaBuildingsResponse>(buildAreaBuildingsImportPath(id, cursor), { method: 'POST' })
    const meta = getAreaBuildingsImportMeta(response) ?? {}
    const progress: ImportAreaBuildingsProgress = { ...meta, cursor }
    options?.onProgress?.(progress)
    logAreaBuildingsImport(id, `cursor ${cursor} finished`, progress)

    if (progress.complete === true) break
    if (progress.next_chunk === null || progress.next_chunk === undefined || progress.next_chunk === '') {
      throw new ApiError(500, 'OSM-Import lieferte keinen nächsten Cursor.', { response }, 'server')
    }

    cursor = progress.next_chunk
  }

  const imported = await listAreaBuildings(id)
  logAreaBuildingsImport(id, `cursor import complete with ${imported.length} buildings`, { batches: batch })
  return imported
}
export const listCampaignAreas = (campaignId: number, params?: PaginationParams) => requestPaginated<Area>(`/api/campaigns/${campaignId}/areas${buildQuery(params)}`)
export const listCampaignAreasMap = (campaignId: number) => requestResource<GeoJsonFeatureCollection>(`/api/campaigns/${campaignId}/areas?map=1`)
export const createOrAttachAreaToCampaign = (campaignId: number, payload: Partial<Area> & { area_id?: number; usage?: 'boundary' | 'target'; boundary_area_id?: number | null; notes?: string | null }) => apiRequest<Area>(`/api/campaigns/${campaignId}/areas`, { method: 'POST', body: JSON.stringify(payload) })
export const attachAreaToCampaign = (campaignId: number, areaId: number, payload?: { usage?: 'boundary' | 'target'; boundary_area_id?: number | null; notes?: string | null }) => apiRequest(`/api/campaigns/${campaignId}/areas/${areaId}`, { method: 'POST', body: JSON.stringify(payload ?? {}) })
export const detachAreaFromCampaign = (campaignId: number, areaId: number) => apiRequest(`/api/campaigns/${campaignId}/areas/${areaId}`, { method: 'DELETE' })

export const listUsers = (params?: PaginationParams) => requestPaginated<User>(`/api/users${buildQuery(params)}`)
export const getUser = (id: number) => requestResource<User>(`/api/users/${id}`)
export const createUser = (payload: { name: string; email: string; password: string; app_role?: 'user' | 'manager' | 'admin' }) => apiRequest<User>('/api/users', { method: 'POST', body: JSON.stringify(payload) })
export const updateUser = (id: number, payload: { name: string; email: string; app_role: 'user' | 'manager' | 'admin'; password?: string }) => apiRequest<User>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
export const deleteUser = (id: number) => apiRequest<void>(`/api/users/${id}`, { method: 'DELETE' })

export const listTeams = (params?: PaginationParams) => requestPaginated<Team>(`/api/teams${buildQuery(params)}`)
export const createTeam = (payload: Partial<Team>) => apiRequest<Team>('/api/teams', { method: 'POST', body: JSON.stringify(payload) })
export const getTeam = (id: number) => requestResource<Team>(`/api/teams/${id}`)
export const updateTeam = (id: number, payload: Partial<Team>) => apiRequest<Team>(`/api/teams/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
export const deleteTeam = (id: number) => apiRequest<void>(`/api/teams/${id}`, { method: 'DELETE' })
export const listCampaignTeams = (campaignId: number, params?: PaginationParams) => requestPaginated<Team>(`/api/campaigns/${campaignId}/teams${buildQuery(params)}`)
export const createOrAttachTeamToCampaign = (campaignId: number, payload: Partial<Team> & { team_id?: number }) => apiRequest<Team>(`/api/campaigns/${campaignId}/teams`, { method: 'POST', body: JSON.stringify(payload) })
export const attachTeamToCampaign = (campaignId: number, teamId: number) => apiRequest(`/api/campaigns/${campaignId}/teams/${teamId}`, { method: 'POST' })
export const detachTeamFromCampaign = (campaignId: number, teamId: number) => apiRequest(`/api/campaigns/${campaignId}/teams/${teamId}`, { method: 'DELETE' })

export const addUserToTeam = (teamId: number, payload: TeamMembershipPayload) => apiRequest(`/api/teams/${teamId}/users`, { method: 'POST', body: JSON.stringify(payload) })
export const updateTeamUser = (teamId: number, userId: number, payload: Omit<TeamMembershipPayload, 'user_id'>) => apiRequest(`/api/teams/${teamId}/users/${userId}`, { method: 'PATCH', body: JSON.stringify(payload) })
export const removeUserFromTeam = (teamId: number, userId: number) => apiRequest(`/api/teams/${teamId}/users/${userId}`, { method: 'DELETE' })

export const listAssignments = (params?: PaginationParams) => requestPaginated<Assignment>(`/api/assignments${buildQuery(params)}`)
export const createAssignment = (payload: Partial<Assignment>) => requestResource<Assignment>('/api/assignments', { method: 'POST', body: JSON.stringify(payload) })
export const getAssignment = (assignmentId: number | string) => requestResource<Assignment>(`/api/assignments/${assignmentId}`)
export const updateAssignment = (assignmentId: number | string, payload: Partial<Assignment>) => apiRequest<Assignment>(`/api/assignments/${assignmentId}`, { method: 'PATCH', body: JSON.stringify(payload) })
export const deleteAssignment = (assignmentId: number | string) => apiRequest<void>(`/api/assignments/${assignmentId}`, { method: 'DELETE' })
export const listCampaignAssignments = (campaignId: number | string, params?: PaginationParams) => requestPaginated<Assignment>(`/api/campaigns/${campaignId}/assignments${buildQuery(params)}`)
export const createCampaignAssignment = (campaignId: number | string, payload: Partial<Assignment>) => requestResource<Assignment>(`/api/campaigns/${campaignId}/assignments`, { method: 'POST', body: JSON.stringify(payload) })
export const listTeamAssignments = (teamId: number | string, params?: PaginationParams) => requestPaginated<Assignment>(`/api/teams/${teamId}/assignments${buildQuery(params)}`)
export const listUserAssignments = (userId: number | string) => requestResource<Assignment[]>(`/api/users/${userId}/assignments`)
export const listAssignmentBuildings = async (assignmentId: number | string) => {
  const response = await apiRequest<AssignmentBuilding[] | { data?: AssignmentBuilding[]; assignment_buildings?: AssignmentBuilding[]; buildings?: AssignmentBuilding[] }>(`/api/assignments/${assignmentId}/buildings`)
  if (response && typeof response === 'object' && 'data' in response) return response.data ?? []
  if (response && typeof response === 'object' && 'assignment_buildings' in response) return response.assignment_buildings ?? []
  if (response && typeof response === 'object' && 'buildings' in response) return response.buildings ?? []
  return Array.isArray(response) ? response : []
}

export const listPosterLocations = (assignmentId: number | string) => requestResource<PosterLocation[]>(`/api/assignments/${assignmentId}/poster-locations`)
export const createPosterLocation = (assignmentId: number | string, payload: Partial<PosterLocation>) => apiRequest<PosterLocation>(`/api/assignments/${assignmentId}/poster-locations`, { method: 'POST', body: JSON.stringify(payload) })
export const bulkCreatePosterLocations = (assignmentId: number | string, payload: Partial<PosterLocation>[] | { posterLocations: Partial<PosterLocation>[] }) => apiRequest<PosterLocation[]>(`/api/assignments/${assignmentId}/poster-locations/bulk`, { method: 'POST', body: JSON.stringify(payload) })
export const updatePosterLocation = (posterLocationId: number | string, payload: Partial<PosterLocation>) => apiRequest<PosterLocation>(`/api/poster-locations/${posterLocationId}`, { method: 'PATCH', body: JSON.stringify(payload) })
export const deletePosterLocation = (posterLocationId: number | string) => apiRequest<void>(`/api/poster-locations/${posterLocationId}`, { method: 'DELETE' })
export const getCampaignBoothLocation = async (assignmentId: number | string) => {
  try {
    return await requestResource<CampaignBoothLocation | null>(`/api/assignments/${assignmentId}/campaign-booth-location`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}
export const createCampaignBoothLocation = (assignmentId: number | string, payload: Partial<CampaignBoothLocation>) => requestResource<CampaignBoothLocation>(`/api/assignments/${assignmentId}/campaign-booth-location`, { method: 'POST', body: JSON.stringify(payload) })
export const updateCampaignBoothLocation = (campaignBoothLocationId: number | string, payload: Partial<CampaignBoothLocation>) => apiRequest<CampaignBoothLocation>(`/api/campaign-booth-locations/${campaignBoothLocationId}`, { method: 'PATCH', body: JSON.stringify(payload) })
export const deleteCampaignBoothLocation = (campaignBoothLocationId: number | string) => apiRequest<void>(`/api/campaign-booth-locations/${campaignBoothLocationId}`, { method: 'DELETE' })
// backward-compatible aliases
export const healthCheck = health
export const getCampaignsPage = listCampaigns
export const createAreaForCampaign = createOrAttachAreaToCampaign
export const createTeamForCampaign = createOrAttachTeamToCampaign

export const listUserTeams = (id: number | string) => requestResource<UserTeam[]>(`/api/users/${id}/teams`)
export const listCurrentUserInvitations = () => requestResource<TeamInvitation[]>('/api/user/invitations')
export const listTeamInvitations = (teamId: number | string) => requestResource<TeamInvitation[]>(`/api/teams/${teamId}/invitations`)
export const createTeamInvitation = (teamId: number | string, payload: Record<string, unknown>) => apiRequest<TeamInvitation>(`/api/teams/${teamId}/invitations`, { method: 'POST', body: JSON.stringify(payload) })
export const deleteTeamInvitation = (invitationId: number | string) => apiRequest(`/api/team-invitations/${invitationId}`, { method: 'DELETE' })

const runInvitationAction = async (invitationId: number | string, action: 'accept' | 'decline') => {
  const paths = [
    `/api/team-invitations/${invitationId}/${action}`,
    `/api/user/invitations/${invitationId}/${action}`,
    `/api/invitations/${invitationId}/${action}`,
  ]

  let lastError: unknown
  for (const path of paths) {
    try {
      return await apiRequest<TeamInvitation | void>(path, { method: 'POST' })
    } catch (error) {
      lastError = error
      if (!(error instanceof ApiError) || (error.status !== 404 && error.status !== 405)) throw error
    }
  }
  throw lastError
}

export const acceptTeamInvitation = (invitationId: number | string) => runInvitationAction(invitationId, 'accept')
export const declineTeamInvitation = (invitationId: number | string) => runInvitationAction(invitationId, 'decline')
