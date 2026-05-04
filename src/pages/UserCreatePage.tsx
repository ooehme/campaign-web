import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { createUser } from '../api/endpoints'
import { useAuth } from '../auth/AuthContext'
import { ErrorState } from '../components/UiState'
import type { AppRole } from '../types/models'
import { PERMISSIONS } from '../utils/permissionKeys'
import { hasPermission, NO_PERMISSION_MESSAGE } from '../utils/permissions'

type ValidationErrors = Partial<Record<'name' | 'email' | 'password' | 'app_role', string>>

const fieldLabel: Record<string, string> = {
  name: 'Name',
  email: 'E-Mail',
  password: 'Passwort',
  app_role: 'App-Rolle',
}

const toGermanError = (field: string, message: string): string => {
  const label = fieldLabel[field] ?? field
  const lower = message.toLowerCase()
  if (lower.includes('required')) return `${label} ist erforderlich.`
  if (lower.includes('email')) return 'Bitte eine gültige E-Mail-Adresse eingeben.'
  if (lower.includes('unique')) return 'Diese E-Mail-Adresse ist bereits vergeben.'
  if (lower.includes('min')) return `${label} ist zu kurz.`
  if (lower.includes('max')) return `${label} ist zu lang.`
  if (lower.includes('confirmed')) return 'Passwort-Bestätigung stimmt nicht überein.'
  return `${label}: ${message}`
}

export function UserCreatePage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { user } = useAuth()
  const canCreateUser = hasPermission(user, PERMISSIONS.USERS_CREATE)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [appRole, setAppRole] = useState<AppRole>('app-user')
  const [includeAppRole, setIncludeAppRole] = useState(true)
  const [topError, setTopError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<ValidationErrors>({})

  const formValid = useMemo(() => name.trim() && email.trim() && password.trim(), [name, email, password])

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: { name: string; email: string; password: string; app_role?: AppRole } = {
        name: name.trim(),
        email: email.trim(),
        password,
      }
      if (includeAppRole) payload.app_role = appRole
      return createUser(payload)
    },
    onSuccess: (createdUser) => {
      qc.invalidateQueries({ queryKey: ['users'] })
      navigate(createdUser?.id ? `/users/${createdUser.id}` : '/users')
    },
    onError: (error) => {
      setTopError('')
      setFieldErrors({})
      if (!(error instanceof ApiError)) {
        setTopError('Serverfehler beim Laden oder Speichern.')
        return
      }
      if (error.status === 403) {
        setTopError('Keine Berechtigung für diese Aktion.')
        return
      }
      if (error.status === 422) {
        const details = (error.details as { errors?: Record<string, string[] | string> } | undefined)?.errors ?? {}
        const next: ValidationErrors = {}
        Object.entries(details).forEach(([field, value]) => {
          const message = Array.isArray(value) ? value[0] : value
          const german = toGermanError(field, message)
          if (field === 'app_role' && message.toLowerCase().includes('not') && message.toLowerCase().includes('exist')) {
            setIncludeAppRole(false)
            return
          }
          if (field in next || !(field in fieldLabel)) return
          next[field as keyof ValidationErrors] = german
        })
        setFieldErrors(next)
        setTopError('Bitte Eingaben prüfen.')
        return
      }
      if (error.status === 401) setTopError('Bitte erneut einloggen.')
      else setTopError('Serverfehler beim Laden oder Speichern.')
    },
  })

  if (!canCreateUser) return <Navigate to="/users" replace />

  return <section className='space-y-4'>
    <div className='flex items-center justify-between'>
      <h1 className='text-2xl font-semibold'>Benutzer erstellen</h1>
      <Link className='text-blue-600' to='/users'>Zurück zur Übersicht</Link>
    </div>
    {topError && <ErrorState message={topError} />}
    <form className='space-y-2 rounded border bg-white p-4' onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
      <label>Name *</label>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      {fieldErrors.name && <p className='text-sm text-red-700'>{fieldErrors.name}</p>}

      <label>E-Mail *</label>
      <input type='email' value={email} onChange={(e) => setEmail(e.target.value)} autoComplete='email' />
      {fieldErrors.email && <p className='text-sm text-red-700'>{fieldErrors.email}</p>}

      <label>Passwort *</label>
      <input type='password' value={password} onChange={(e) => setPassword(e.target.value)} autoComplete='new-password' />
      {fieldErrors.password && <p className='text-sm text-red-700'>{fieldErrors.password}</p>}

      {includeAppRole && <>
        <label>App-Rolle</label>
        <select value={appRole} onChange={(e) => setAppRole(e.target.value as AppRole)}>
          <option value='app-user'>app-user</option>
          <option value='campaign-manager'>campaign-manager</option>
          <option value='app-admin'>app-admin</option>
        </select>
        {fieldErrors.app_role && <p className='text-sm text-red-700'>{fieldErrors.app_role}</p>}
      </>}

      <button className='bg-slate-900 px-3 py-1 text-white disabled:opacity-50' type='submit' disabled={!formValid || mutation.isPending} title={!formValid ? NO_PERMISSION_MESSAGE : undefined}>Benutzer erstellen</button>
    </form>
  </section>
}
