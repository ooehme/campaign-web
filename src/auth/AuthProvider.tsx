import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { getCurrentUser, login as loginEndpoint, logout as logoutEndpoint } from '../api/endpoints'
import type { User } from '../types/models'
import { AuthContext, type LoginPayload } from './AuthContext'
import { clearAuth, readStoredToken, readStoredUser, storeAuth } from './storage'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const [token, setToken] = useState<string | null>(() => readStoredToken())
  const [user, setUser] = useState<User | null>(() => readStoredUser())
  const [isLoading, setIsLoading] = useState(Boolean(readStoredToken()))

  const logout = useCallback(async () => {
    try {
      await logoutEndpoint()
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error
    } finally {
      clearAuth()
      setToken(null)
      setUser(null)
      navigate('/login', { replace: true })
    }
  }, [navigate])

  const refreshUser = useCallback(async () => {
    const currentUser = await getCurrentUser()
    setUser(currentUser)
    if (token) storeAuth(token, currentUser)
  }, [token])

  const login = useCallback(
    async ({ email, password }: LoginPayload) => {
      const response = await loginEndpoint({ email, password, device_name: 'frontend' })
      storeAuth(response.token, response.user)
      setToken(response.token)
      setUser(response.user)
      navigate('/dashboard', { replace: true })
    },
    [navigate],
  )

  useEffect(() => {
    const onAuthRequired = () => {
      setToken(null)
      setUser(null)
      navigate('/login', { replace: true })
    }

    window.addEventListener('campaign-auth-required', onAuthRequired)
    return () => window.removeEventListener('campaign-auth-required', onAuthRequired)
  }, [navigate])

  useEffect(() => {
    if (!token) {
      setIsLoading(false)
      return
    }

    refreshUser()
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) return
        console.error('Failed to refresh current user', error)
      })
      .finally(() => setIsLoading(false))
  }, [token, refreshUser])

  const value = useMemo(
    () => ({ user, token, isAuthenticated: Boolean(token), isLoading, login, logout, refreshUser }),
    [user, token, isLoading, login, logout, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
