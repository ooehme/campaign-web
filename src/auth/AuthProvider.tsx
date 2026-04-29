import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiRequest, ApiError } from '../api/client'
import type { User } from '../types/models'
import { AuthContext, type LoginPayload } from './AuthContext'
import { clearAuth, readStoredToken, readStoredUser, storeAuth } from './storage'

interface LoginResponse { token: string; user: User }

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const [token, setToken] = useState<string | null>(() => readStoredToken())
  const [user, setUser] = useState<User | null>(() => readStoredUser())

  const logout = useCallback(async () => {
    try {
      await apiRequest('/api/logout', { method: 'POST' })
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
    const currentUser = await apiRequest<User>('/api/user')
    setUser(currentUser)
    if (token) storeAuth(token, currentUser)
  }, [token])

  const login = useCallback(async ({ email, password }: LoginPayload) => {
    const response = await apiRequest<LoginResponse>('/api/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, device_name: 'frontend' }),
    })
    storeAuth(response.token, response.user)
    setToken(response.token)
    setUser(response.user)
    navigate('/', { replace: true })
  }, [navigate])

  useEffect(() => {
    const onAuthRequired = () => {
      setToken(null)
      setUser(null)
      navigate('/login', { replace: true })
    }
    window.addEventListener('campaign-auth-required', onAuthRequired)
    return () => window.removeEventListener('campaign-auth-required', onAuthRequired)
  }, [navigate])

  const value = useMemo(() => ({ user, token, isAuthenticated: Boolean(token), login, logout, refreshUser }), [user, token, login, logout, refreshUser])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
