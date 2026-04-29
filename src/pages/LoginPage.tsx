import { FormEvent, useState } from 'react'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'

export function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault(); setError(null); setFieldErrors({}); setIsLoading(true)
    try { await login({ email, password }) } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const errors = (err.details as { errors?: Record<string, string[]> })?.errors ?? {}
        setFieldErrors({ email: errors.email?.[0] ?? '', password: errors.password?.[0] ?? '' })
      } else {
        setError('Login failed. Check your credentials or backend availability.')
      }
    } finally { setIsLoading(false) }
  }

  return <div className="mx-auto mt-16 max-w-md rounded border border-slate-200 bg-white p-6 shadow-sm">
    <h1 className="text-xl font-semibold">Login</h1>
    <p className="mt-2 text-xs text-slate-600">Demo users: admin@example.test / admin · team-admin@example.test / password · team-lead@example.test / password · team-member@example.test / password · outside@example.test / password</p>
    <form className="mt-6 space-y-4" onSubmit={onSubmit}>
      <label className="block text-sm"><span className="mb-1 block text-slate-700">Email</span><input className="w-full rounded border border-slate-300 px-3 py-2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />{fieldErrors.email && <span className="mt-1 block text-xs text-red-600">{fieldErrors.email}</span>}</label>
      <label className="block text-sm"><span className="mb-1 block text-slate-700">Password</span><input className="w-full rounded border border-slate-300 px-3 py-2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />{fieldErrors.password && <span className="mt-1 block text-xs text-red-600">{fieldErrors.password}</span>}</label>
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <button className="w-full rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-60" type="submit" disabled={isLoading}>{isLoading ? 'Loading…' : 'Sign in'}</button>
    </form>
  </div>
}
