import { ApiError } from '../api/client'
import type { User, UserCan } from '../types/models'
import type { PermissionKey } from './permissionKeys'

export const NO_PERMISSION_MESSAGE = 'Keine Berechtigung für diese Aktion.'

export const can = (flag: unknown): boolean => flag === true

const getNestedPermission = (canMap: UserCan | undefined, permissionKey: string): boolean => {
  if (!canMap) return false
  const segments = permissionKey.split('.')
  let current: unknown = canMap

  for (const segment of segments) {
    if (!current || typeof current !== 'object') return false
    current = (current as Record<string, unknown>)[segment]
  }

  return current === true
}

export const canPermission = (canMap: UserCan | undefined, permissionKey: PermissionKey): boolean => {
  if (!canMap) return false
  if (getNestedPermission(canMap, permissionKey)) return true
  return canMap[permissionKey] === true
}

export const hasPermission = (user: User | null | undefined, permissionKey: PermissionKey): boolean =>
  canPermission(user?.can, permissionKey)

export const permissionErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError && error.status === 403) {
    return NO_PERMISSION_MESSAGE
  }

  return (error as Error)?.message ?? 'API Error'
}
