export interface Campaign {
  id: number
  name: string
  description?: string | null
  starts_at?: string | null
  ends_at?: string | null
  [key: string]: unknown
}

export interface Area {
  id: number
  campaign_id: number
  name: string
  geojson?: GeoJsonShape | null
  [key: string]: unknown
}

export interface Team {
  id: number
  campaign_id: number
  name: string
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
