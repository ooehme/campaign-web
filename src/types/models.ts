export interface CampaignCan {
  update?: boolean
  delete?: boolean
  attach_area?: boolean
  detach_area?: boolean
  attach_team?: boolean
  detach_team?: boolean
  create_task?: boolean
  create_team?: boolean
  create_area?: boolean
}

export interface AreaCan {
  update?: boolean
  delete?: boolean
  attach_to_campaign?: boolean
  detach_from_campaign?: boolean
}

export interface TeamCan {
  update?: boolean
  delete?: boolean
  manage_members?: boolean
  attach_to_campaign?: boolean
  detach_from_campaign?: boolean
}

export interface TaskCan {
  update?: boolean
  delete?: boolean
  change_status?: boolean
  assign_team?: boolean
  complete?: boolean
}

export interface Campaign {
  id: number
  name: string
  slug?: string
  description?: string | null
  status?: CampaignStatus | null
  starts_at?: string | null
  ends_at?: string | null
  can?: CampaignCan
  [key: string]: unknown
}

export interface Area {
  id: number
  name: string
  geojson?: GeoJsonShape | null
  can?: AreaCan
  [key: string]: unknown
}

export interface Team {
  id: number
  name: string
  can?: TeamCan
  [key: string]: unknown
}

export interface TaskAreaRef {
  id: number
  name?: string | null
  [key: string]: unknown
}

export interface TaskAssignedTeamRef {
  id: number
  name?: string | null
  [key: string]: unknown
}

export interface Task {
  id: number
  campaign_id: number
  title: string
  description?: string | null
  status: TaskStatus
  priority: number
  latitude?: number | null
  longitude?: number | null
  area?: TaskAreaRef | null
  assigned_team?: TaskAssignedTeamRef | null
  payload?: Record<string, unknown> | null
  can?: TaskCan
  [key: string]: unknown
}

export interface TaskEvent {
  id: number
  task_id: number
  type: string
  created_at?: string
  payload?: Record<string, unknown>
  [key: string]: unknown
}

export type TaskStatus = 'open' | 'assigned' | 'in_progress' | 'done' | 'cancelled'
export type TeamRole = 'member' | 'lead' | 'admin'

export type GeoJsonShape = {
  type: 'Polygon' | 'MultiPolygon'
  coordinates: unknown[]
}

export type CampaignStatus = 'draft' | 'active' | 'archived'


export interface PaginationNavLink {
  url: string | null
  label: string
  page: number | null
  active: boolean
}

export interface PaginationMeta {
  current_page: number
  from: number | null
  last_page: number
  links: PaginationNavLink[]
  path: string
  per_page: number
  to: number | null
  total: number
}

export interface PaginationLinks {
  first: string | null
  last: string | null
  prev: string | null
  next: string | null
}

export interface PaginatedResponse<T> {
  data: T[]
  links: PaginationLinks
  meta: PaginationMeta
}

export interface TeamMembershipPivot {
  role: TeamRole
  display_name?: string | null
  notes?: string | null
}

export interface TeamMembershipPayload {
  user_id: number
  role: TeamRole
  display_name?: string | null
  notes?: string | null
}
