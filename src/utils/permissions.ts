import { ApiError } from '../api/client'
import type { User } from '../types/models'
import type { PermissionKey } from './permissionKeys'

export const NO_PERMISSION_MESSAGE = 'Keine Berechtigung für diese Aktion.'

export const can = (flag: boolean | null | undefined): boolean => flag === true

export const hasPermission = (user: User | null | undefined, permissionKey: PermissionKey): boolean =>
  user?.can?.[permissionKey] === true

export const permissionErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError && error.status === 403) {
    return NO_PERMISSION_MESSAGE
  }

  return (error as Error)?.message ?? 'API Error'
}
