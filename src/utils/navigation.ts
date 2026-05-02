import type { User } from '../types/models'
import { canFlag } from './permissions'

export type NavigationItem = {
  key: 'dashboard' | 'campaigns' | 'areas' | 'teams' | 'users' | 'featurePermissions'
  label: string
  to: string
  permissionKeys?: string[]
  alwaysVisible?: boolean
}

export const NAVIGATION_ITEMS: NavigationItem[] = [
  { key: 'dashboard', label: 'Dashboard', to: '/dashboard', alwaysVisible: true },
  { key: 'campaigns', label: 'Campaigns', to: '/campaigns', permissionKeys: ['campaigns.view'] },
  { key: 'areas', label: 'Areas', to: '/areas', permissionKeys: ['areas.view'] },
  { key: 'teams', label: 'Teams', to: '/teams', permissionKeys: ['teams.view'] },
  { key: 'users', label: 'Users', to: '/users', permissionKeys: ['users.view'] },
  {
    key: 'featurePermissions',
    label: 'Feature-Rechte',
    to: '/admin/feature-permissions',
    permissionKeys: ['manage_feature_permissions'],
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
