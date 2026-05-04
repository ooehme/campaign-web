import type { User } from '../types/models'
import type { PermissionKey } from './permissionKeys'
import { PERMISSIONS } from './permissionKeys'
import { hasPermission } from './permissions'

export type NavigationItem = {
  key: 'dashboard' | 'campaigns' | 'areas' | 'teams' | 'users' | 'featurePermissions'
  label: string
  to: string
  permissionKey?: PermissionKey
  alwaysVisible?: boolean
}

export const NAVIGATION_ITEMS: NavigationItem[] = [
  { key: 'dashboard', label: 'Dashboard', to: '/dashboard', alwaysVisible: true },
  { key: 'campaigns', label: 'Campaigns', to: '/campaigns', permissionKey: PERMISSIONS.CAMPAIGNS_VIEW },
  { key: 'areas', label: 'Areas', to: '/areas', permissionKey: PERMISSIONS.AREAS_VIEW },
  { key: 'teams', label: 'Teams', to: '/teams', permissionKey: PERMISSIONS.TEAMS_VIEW },
  { key: 'users', label: 'Users', to: '/users', permissionKey: PERMISSIONS.USERS_VIEW },
  {
    key: 'featurePermissions',
    label: 'Feature-Rechte',
    to: '/admin/feature-permissions',
    permissionKey: PERMISSIONS.FEATURE_PERMISSIONS_MANAGE,
  },
]

const hasNavigationPermission = (user: User | null | undefined, item: NavigationItem): boolean => {
  if (item.alwaysVisible) return true
  if (!item.permissionKey) return false
  return hasPermission(user, item.permissionKey)
}

export const getVisibleNavigationItems = (user: User | null | undefined): NavigationItem[] =>
  NAVIGATION_ITEMS.filter((item) => hasNavigationPermission(user, item))

export const hasVisibleModuleNavigation = (user: User | null | undefined): boolean =>
  NAVIGATION_ITEMS.some((item) => item.key !== 'dashboard' && hasNavigationPermission(user, item))
