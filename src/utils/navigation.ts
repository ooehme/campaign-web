import type { User } from '../types/models'
import { canFlag } from './permissions'

export type NavigationItem = {
  key: 'dashboard' | 'campaigns' | 'areas' | 'teams' | 'users' | 'featurePermissions'
  label: string
  to: string
  permissionKeys?: string[]
  alwaysVisible?: boolean
}

const VIEW_PERMISSION_KEYS: Record<'campaigns' | 'areas' | 'teams' | 'users', string[]> = {
  campaigns: ['campaigns.view', 'campaign.view', 'view_campaigns', 'view_campaign'],
  areas: ['areas.view', 'area.view', 'view_areas', 'view_area'],
  teams: ['teams.view', 'team.view', 'view_teams', 'view_team'],
  users: ['users.view', 'user.view', 'view_users', 'view_user'],
}

export const NAVIGATION_ITEMS: NavigationItem[] = [
  { key: 'dashboard', label: 'Dashboard', to: '/dashboard', alwaysVisible: true },
  { key: 'campaigns', label: 'Campaigns', to: '/campaigns', permissionKeys: VIEW_PERMISSION_KEYS.campaigns },
  { key: 'areas', label: 'Areas', to: '/areas', permissionKeys: VIEW_PERMISSION_KEYS.areas },
  { key: 'teams', label: 'Teams', to: '/teams', permissionKeys: VIEW_PERMISSION_KEYS.teams },
  { key: 'users', label: 'Users', to: '/users', permissionKeys: VIEW_PERMISSION_KEYS.users },
  {
    key: 'featurePermissions',
    label: 'Feature-Rechte',
    to: '/admin/feature-permissions',
    permissionKeys: ['feature_permissions.view', 'manage_feature_permissions'],
  },
]

const hasNavigationPermission = (user: User | null | undefined, item: NavigationItem): boolean => {
  if (item.alwaysVisible) return true
  if (!user || !item.permissionKeys?.length) return false
  return item.permissionKeys.some((permissionKey) => canFlag(user.can, permissionKey))
}

export const getVisibleNavigationItems = (user: User | null | undefined): NavigationItem[] =>
  NAVIGATION_ITEMS.filter((item) => hasNavigationPermission(user, item))

export const hasVisibleModuleNavigation = (user: User | null | undefined): boolean =>
  NAVIGATION_ITEMS.some((item) => item.key !== 'dashboard' && hasNavigationPermission(user, item))
