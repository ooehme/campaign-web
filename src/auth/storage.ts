import type { User } from '../types/models'

export const TOKEN_STORAGE_KEY = 'campaign_api_token'
export const USER_STORAGE_KEY = 'campaign_current_user'

export const readStoredToken = () => localStorage.getItem(TOKEN_STORAGE_KEY)

export const readStoredUser = (): User | null => {
  const raw = localStorage.getItem(USER_STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as User
  } catch {
    return null
  }
}

export const storeAuth = (token: string, user: User) => {
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user))
}

export const clearAuth = () => {
  localStorage.removeItem(TOKEN_STORAGE_KEY)
  localStorage.removeItem(USER_STORAGE_KEY)
}
