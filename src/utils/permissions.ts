import { ApiError } from '../api/client'

export const NO_PERMISSION_MESSAGE = 'Keine Berechtigung für diese Aktion.'

export const can = (flag: boolean | null | undefined): boolean => flag === true

export const permissionErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError && error.status === 403) {
    return NO_PERMISSION_MESSAGE
  }

  return (error as Error)?.message ?? 'API Error'
}
