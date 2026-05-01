import { Link, NavLink } from 'react-router-dom'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { canManageFeaturePermissions } from '../utils/permissions'

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded px-3 py-2 text-sm ${isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`

export function AppShell() {
  const { logout, user } = useAuth()
  const mayManageFeaturePermissions = canManageFeaturePermissions(user)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link to="/" className="font-semibold">Campaign Admin GUI</Link>
          <div className="flex items-center gap-4">
            <nav className="flex gap-2">
              <NavLink to="/" className={navClass} end>Dashboard</NavLink>
              <NavLink to="/campaigns" className={navClass}>Campaigns</NavLink>
              <NavLink to="/areas" className={navClass}>Areas</NavLink>
              <NavLink to="/teams" className={navClass}>Teams</NavLink>
              <NavLink to="/users" className={navClass}>Users</NavLink>
              {mayManageFeaturePermissions && <NavLink to="/admin/feature-permissions" className={navClass}>Feature-Rechte</NavLink>}
            </nav>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span>{user?.email}</span>
              <button type="button" onClick={() => void logout()} className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100">Logout</button>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-4">
        <Outlet />
      </main>
    </div>
  )
}
