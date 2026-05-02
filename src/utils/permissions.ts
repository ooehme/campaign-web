import { ApiError } from '../api/client'
import type { User, UserCan } from '../types/models'

export const NO_PERMISSION_MESSAGE = 'Keine Berechtigung für diese Aktion.'

export const can = (flag: boolean | null | undefined): boolean => flag === true

export const hasPermission = (user: User | null | undefined, permissionKey: string): boolean => {
  if (!user?.can || typeof user.can !== 'object') return false
  return user.can[permissionKey] === true
}

export const hasCanPermission = (canMap: UserCan | null | undefined, permissionKey: string): boolean => {
  if (!canMap || typeof canMap !== 'object') return false
  return canMap[permissionKey] === true
}

export const canManageFeaturePermissions = (user: User | null | undefined): boolean =>
  hasPermission(user, 'feature_permissions.manage')

export const permissionErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError && error.status === 403) {
    return NO_PERMISSION_MESSAGE
  }

  return (error as Error)?.message ?? 'API Error'
}
