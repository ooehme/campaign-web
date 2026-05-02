import type { User } from '../types/models'
import { hasPermission } from './permissions'

export type NavigationItem = {
  key: 'dashboard' | 'campaigns' | 'areas' | 'teams' | 'users' | 'featurePermissions'
  label: string
  to: string
  permissionKey?: string
  alwaysVisible?: boolean
}

export const NAVIGATION_ITEMS: NavigationItem[] = [
  { key: 'dashboard', label: 'Dashboard', to: '/dashboard', alwaysVisible: true },
  { key: 'campaigns', label: 'Campaigns', to: '/campaigns', permissionKey: 'campaigns.view' },
  { key: 'areas', label: 'Areas', to: '/areas', permissionKey: 'areas.view' },
  { key: 'teams', label: 'Teams', to: '/teams', permissionKey: 'teams.view' },
  { key: 'users', label: 'Users', to: '/users', permissionKey: 'users.view' },
  {
    key: 'featurePermissions',
    label: 'Feature-Rechte',
    to: '/admin/feature-permissions',
    permissionKey: 'feature_permissions.manage',
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
