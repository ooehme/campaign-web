import { ApiError } from '../api/client'
import type { User, UserCan } from '../types/models'

export const NO_PERMISSION_MESSAGE = 'Keine Berechtigung für diese Aktion.'

export const can = (flag: boolean | null | undefined): boolean => flag === true

export const canFlag = (canMap: UserCan | null | undefined, key: string): boolean => {
  if (!canMap || typeof canMap !== 'object') return false
  const normalizedKey = key.startsWith('can_') ? key.slice(4) : key
  const prefixedKey = key.startsWith('can_') ? key : `can_${key}`
  const value = canMap[normalizedKey] ?? canMap[prefixedKey]
  return value === true
}

export const canManageFeaturePermissions = (user: User | null | undefined): boolean => {
  if (!user) return false
  return canFlag(user.can, 'manage_feature_permissions')
}

export const permissionErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError && error.status === 403) {
    return NO_PERMISSION_MESSAGE
  }

  return (error as Error)?.message ?? 'API Error'
}
