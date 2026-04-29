export interface CampaignCan {
  view?: boolean
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
  view?: boolean
  update?: boolean
  delete?: boolean
  attach_to_campaign?: boolean
  detach_from_campaign?: boolean
}

export interface TeamCan {
  view?: boolean
  update?: boolean
  delete?: boolean
  manage_members?: boolean
  attach_to_campaign?: boolean
  detach_from_campaign?: boolean
}

export interface TaskCan {
  view?: boolean
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
  users?: Array<{
    id: number
    name: string
    email: string
    pivot?: {
      role?: 'member' | 'lead' | 'admin'
      display_name?: string | null
      notes?: string | null
    }
  }>
  campaigns?: Array<{
    id: number
    name: string
    slug?: string
    status?: string
  }>
  assigned_task_summary?: {
    total?: number
    open?: number
    in_progress?: number
    blocked?: number
    completed?: number
  }
  created_at?: string
  updated_at?: string
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
  area_id?: number | null
  assigned_team_id?: number | null
  type: string
  title: string
  description?: string | null
  status: TaskStatus
  priority: number
  latitude?: number | null
  longitude?: number | null
  area?: TaskAreaRef | null
  assigned_team?: TaskAssignedTeamRef | null
  payload?: Record<string, unknown> | null
  due_at?: string | null
  completed_at?: string | null
  can?: TaskCan
  [key: string]: unknown
}

export interface TaskEventCan { view?: boolean }

export interface TaskEvent {
  id: number
  task_id: number
  user_id?: number | null
  event_type: string
  old_values?: Record<string, unknown> | null
  new_values?: Record<string, unknown> | null
  note?: string | null
  created_at?: string | null
  can?: TaskEventCan
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


export interface UserCan {
  view?: boolean
  create?: boolean
  update?: boolean
  delete?: boolean
}

export type AppRole = 'user' | 'admin'

export interface User {
  id: number
  name: string
  email: string
  app_role: AppRole
  can?: UserCan
  [key: string]: unknown
}

export interface TeamMembership {
  user: { id: number; name: string; email: string }
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
