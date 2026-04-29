import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthContext'

export function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) return <div className="p-6 text-sm text-slate-600">Loading session...</div>
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <Outlet />
}
