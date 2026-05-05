import type { AppRole } from '../types/models'

export const APP_ROLE_OPTIONS: Array<{ value: AppRole; label: string }> = [
  { value: 'user', label: 'Benutzer' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Administrator' },
]

const APP_ROLE_LABELS: Record<AppRole, string> = {
  user: 'Benutzer',
  manager: 'Manager',
  admin: 'Administrator',
}

export const isAppRole = (value: unknown): value is AppRole =>
  typeof value === 'string' && APP_ROLE_OPTIONS.some((option) => option.value === value)

export const appRoleLabel = (value: unknown): string => {
  if (isAppRole(value)) return APP_ROLE_LABELS[value]
  if (typeof value === 'string' && value.trim().length > 0) return `Unbekannt (${value})`
  return 'Unbekannt'
}
