export interface CampaignCan {
  view?: boolean
  update?: boolean
  delete?: boolean
  attach_area?: boolean
  detach_area?: boolean
  attach_team?: boolean
  detach_team?: boolean
  create_assignment?: boolean
  create_team?: boolean
  create_area?: boolean
}

export interface AreaCan {
  view?: boolean
  update?: boolean
  delete?: boolean
  manage_buildings?: boolean
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

export interface AssignmentCan {
  view?: boolean
  update?: boolean
  delete?: boolean
  change_status?: boolean
  assign_team?: boolean
  complete?: boolean
  manage_poster_locations?: boolean
  manage_campaign_booth_location?: boolean
}

export interface PosterLocationCan {
  view?: boolean
  update?: boolean
  delete?: boolean
}

export interface CampaignBoothLocationCan {
  view?: boolean
  update?: boolean
  delete?: boolean
}

export interface Campaign {
  id: number
  name: string
  slug?: string
  description?: string | null
  briefing?: string | null
  status?: CampaignStatus | null
  starts_at?: string | null
  ends_at?: string | null
  can?: CampaignCan
  [key: string]: unknown
}

export interface CampaignAreaPivot {
  usage?: 'boundary' | 'target'
  boundary_area_id?: number | null
  boundaryAreaId?: number | null
  notes?: string | null
}

export interface AreaAssignmentRef {
  id?: number
  campaign_id?: number
  campaignId?: number
  name?: string
  campaign_name?: string
  campaignName?: string
  usage?: 'boundary' | 'target'
  boundary_area_id?: number | null
  boundaryAreaId?: number | null
  notes?: string | null
  [key: string]: unknown
}

export interface Area {
  id: number
  name: string
  geojson?: GeoJsonInput | null
  area_buildings?: AreaBuilding[]
  buildings?: AreaBuilding[]
  building_count?: number
  created_at?: string | null
  updated_at?: string | null
  campaigns?: AreaAssignmentRef[]
  assignments?: AreaAssignmentRef[]
  can?: AreaCan
  pivot?: CampaignAreaPivot
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
      role?: 'member' | 'lead'
      display_name?: string | null
      notes?: string | null
    }
  }>
  campaigns?: Campaign[]
  assigned_assignment_summary?: {
    total?: number
    draft?: number
    active?: number
    paused?: number
    completed?: number
    cancelled?: number
  }
  created_at?: string
  updated_at?: string
  can?: TeamCan
  [key: string]: unknown
}

export interface AssignmentTeamRef {
  id: number
  name?: string | null
  [key: string]: unknown
}

export interface AreaBuilding {
  id?: number
  area_id?: number
  osm_type?: string | null
  osm_id?: number | string | null
  label?: string | null
  building_type?: string | null
  geometry?: GeoJsonInput | null
  geojson?: GeoJsonInput | null
  centroid?: GeoJsonInput | null
  lat?: number | string | null
  lng?: number | string | null
  latitude?: number | string | null
  longitude?: number | string | null
  housenumber?: string | null
  house_number?: string | null
  addr_housenumber?: string | null
  street?: string | null
  addr_street?: string | null
  city?: string | null
  addr_city?: string | null
  address?: {
    city?: string | null
    street?: string | null
    country?: string | null
    postcode?: string | null
    housenumber?: string | null
    [key: string]: unknown
  } | null
  metadata?: {
    source?: string | null
    osm_tags?: Record<string, unknown> | null
    [key: string]: unknown
  } | null
  properties?: Record<string, unknown> | null
  [key: string]: unknown
}

export interface AssignmentBuilding {
  id?: number
  assignment_id?: number
  assignmentId?: number
  area_building_id?: number
  areaBuildingId?: number
  area_building?: AreaBuilding
  areaBuilding?: AreaBuilding
  status?: string | null
  notes?: string | null
  [key: string]: unknown
}

export interface Assignment {
  id: number
  type: AssignmentType
  title: string
  description?: string | null
  targetArea?: string | null
  boundaryAreaId?: number | null
  targetAreaId?: number | null
  boundary_area_id?: number | null
  target_area_id?: number | null
  campaignId?: number | null
  campaign_id?: number | null
  teamId?: number | null
  team_id?: number | null
  createdByUserId?: number | null
  created_by_user_id?: number | null
  status: AssignmentStatus
  startsAt?: string | null
  starts_at?: string | null
  dueAt?: string | null
  due_at?: string | null
  typeConfig?: AssignmentTypeConfig | null
  type_config?: AssignmentTypeConfig | null
  createdAt?: string | null
  created_at?: string | null
  updatedAt?: string | null
  updated_at?: string | null
  campaign?: Campaign | null
  team?: AssignmentTeamRef | null
  boundary_area?: Area | null
  target_area?: Area | null
  created_by_user?: User | null
  posterLocations?: PosterLocation[]
  campaignBoothLocation?: CampaignBoothLocation | null
  campaign_booth_location?: CampaignBoothLocation | null
  posterLocationCount?: number
  area_building_ids?: number[]
  area_buildings?: AreaBuilding[]
  assignment_buildings?: Array<AreaBuilding | AssignmentBuilding>
  can?: AssignmentCan
  [key: string]: unknown
}

export type AssignmentType = 'standard' | 'letterbox_distribution' | 'poster_free' | 'poster_guided' | 'campaign_booth'
export type AssignmentStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled'

export type AssignmentProofType = 'photo' | 'gps_track' | 'completion_checklist'
export type AssignmentDeliveryMode = 'letterbox' | 'doorstep' | 'both'
export type AssignmentHouseholdTargeting = 'all_households' | 'selected_buildings'

export type StandardAssignmentConfig = Record<string, never>

export interface LetterboxDistributionConfig {
  mandatoryInstructions: string[]
  materialName: string
  estimatedQuantity?: number
  deliveryMode: AssignmentDeliveryMode
  householdTargeting: AssignmentHouseholdTargeting
  avoidDuplicateDelivery: boolean
  requireNoAdsStickerRespect: boolean
  proofRequired: boolean
  proofTypes: AssignmentProofType[]
  notesForTeam?: string
}

export interface PosterFreeConfig {
  posterName: string
  estimatedPosterCount?: number
  mandatoryInstructions: string[]
  allowTeamToCreateLocations: true
  requirePhotoProof: boolean
}

export interface PosterGuidedConfig {
  posterName: string
  mandatoryInstructions: string[]
  allowTeamToCreateLocations: false
  requirePhotoProof: boolean
}

export interface CampaignBoothConfig {
  boothName: string
  mandatoryInstructions: string[]
  allowTeamToCreateLocations: false
  requirePhotoProof: boolean
}

export type AssignmentTypeConfig = StandardAssignmentConfig | LetterboxDistributionConfig | PosterFreeConfig | PosterGuidedConfig | CampaignBoothConfig

export interface PosterLocation {
  id: number
  assignmentId: number
  lat: number
  lng: number
  status: PosterLocationStatus
  label?: string | null
  notes?: string | null
  installedByUserId?: number | null
  installedAt?: string | null
  photoUrl?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  can?: PosterLocationCan
}

export type PosterLocationStatus = 'planned' | 'installed' | 'removed' | 'damaged' | 'missing'

export interface CampaignBoothLocation {
  id: number
  assignmentId?: number
  assignment_id?: number
  lat: number
  lng: number
  status: CampaignBoothLocationStatus
  label?: string | null
  notes?: string | null
  createdAt?: string | null
  created_at?: string | null
  updatedAt?: string | null
  updated_at?: string | null
  can?: CampaignBoothLocationCan
}

export type CampaignBoothLocationStatus = 'planned' | 'set_up' | 'closed' | 'cancelled' | 'issue'
export type TeamRole = 'member' | 'lead'


export type GeoJsonPolygon = {
  type: 'Polygon'
  coordinates: [Array<[number, number]>, ...Array<Array<[number, number]>>]
}

export type GeoJsonMultiPolygon = {
  type: 'MultiPolygon'
  coordinates: Array<Array<Array<[number, number]>>>
}

export type GeoJsonGeometry = GeoJsonPolygon | GeoJsonMultiPolygon
export type GeoJsonShape = GeoJsonGeometry

export type GeoJsonFeature = {
  type: 'Feature'
  geometry: GeoJsonGeometry | null
  properties?: Record<string, unknown> | null
}

export type GeoJsonFeatureCollection = {
  type: 'FeatureCollection'
  features: GeoJsonFeature[]
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




export interface PermissionDefinition {
  key: string
  label: string
  group?: string
  action?: string
  description?: string
}

export interface PermissionRole {
  key: string
  label: string
}

export interface RolePermissionMatrixRow {
  role_key: string
  permission_key: string
  enabled: boolean
}

export interface RolePermissionMatrixResponse {
  permissions: PermissionDefinition[]
  roles: PermissionRole[]
  matrix: RolePermissionMatrixRow[]
}

export interface RolePermissionUpdatePayload {
  matrix: RolePermissionMatrixRow[]
}

export type UserCanValue = boolean | null | undefined | UserCan

export type UserCan = {
  [key: string]: UserCanValue
}

export type AppRole = 'user' | 'manager' | 'admin'

export interface User {
  id: number
  name: string
  email: string
  app_role: AppRole | string
  created_at?: string | null
  updated_at?: string | null
  teams?: UserTeam[]
  campaigns?: Campaign[]
  assignment_summary?: UserAssignmentSummary
  invitation_summary?: Record<string, number>
  can?: UserCan
  roles?: string[]
  [key: string]: unknown
}

export interface UserTeam {
  id: number
  name: string
  campaigns?: Campaign[]
  pivot?: {
    role?: TeamRole
    display_name?: string | null
    notes?: string | null
  }
  can?: TeamCan
}

export interface UserAssignmentSummary {
  total?: number
  draft?: number
  active?: number
  paused?: number
  completed?: number
  cancelled?: number
}

export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired'

export interface TeamInvitation {
  id: number
  team: Team
  invited_user?: User
  email?: string
  invited_by_user?: User
  role: TeamRole
  display_name?: string | null
  notes?: string | null
  status: InvitationStatus
  expires_at?: string | null
  responded_at?: string | null
  created_at?: string | null
  can?: {
    view?: boolean
    accept?: boolean
    decline?: boolean
    cancel?: boolean
    delete?: boolean
  }
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

export type GeoJsonInput = GeoJsonGeometry | GeoJsonFeature | GeoJsonFeatureCollection
