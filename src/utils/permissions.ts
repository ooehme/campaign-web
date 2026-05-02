import { ApiError } from '../api/client'
import type { User, UserCan } from '../types/models'

export const NO_PERMISSION_MESSAGE = 'Keine Berechtigung für diese Aktion.'

export const can = (flag: boolean | null | undefined): boolean => flag === true

const permissionAliases = (key: string): string[] => {
  const keys = new Set<string>([key])
  const withoutCanPrefix = key.startsWith('can_') ? key.slice(4) : key
  keys.add(withoutCanPrefix)
  keys.add(`can_${withoutCanPrefix}`)

  const dottedMatch = withoutCanPrefix.match(/^([a-z0-9_]+)\.(view|create|update|delete|use|manage)$/i)
  if (dottedMatch) {
    const [, resource, action] = dottedMatch
    keys.add(`${resource}.can_${action}`)
    keys.add(`${action}_${resource}`)
    keys.add(`can_${action}_${resource}`)
  }

  return [...keys]
}

export const canFlag = (canMap: UserCan | null | undefined, key: string): boolean => {
  if (!canMap || typeof canMap !== 'object') return false
  return permissionAliases(key).some((candidate) => canMap[candidate] === true)
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
