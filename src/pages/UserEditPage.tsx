import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { deleteUser, getUser, updateUser } from '../api/endpoints'
import { useAuth } from '../auth/AuthContext'
import { ErrorState, LoadingState } from '../components/UiState'
import type { AppRole } from '../types/models'
import { isAppRole, APP_ROLE_OPTIONS } from '../utils/appRoles'
import { can, NO_PERMISSION_MESSAGE } from '../utils/permissions'

const isValidEmail = (value: string) => /.+@.+\..+/.test(value)

export function UserEditPage() {
  const { userId } = useParams()
  const id = Number(userId)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { user: currentUser, refreshUser } = useAuth()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [appRole, setAppRole] = useState<AppRole>('user')
  const [errorMessage, setErrorMessage] = useState('')
  const [success, setSuccess] = useState('')

  const userQuery = useQuery({ queryKey: ['user', id], queryFn: () => getUser(id), enabled: Number.isFinite(id), retry: false })

  useEffect(() => {
    if (!userQuery.data) return
    setName(userQuery.data.name)
    setEmail(userQuery.data.email)
    setAppRole(isAppRole(userQuery.data.app_role) ? userQuery.data.app_role : 'user')
  }, [userQuery.data])

  const saveMutation = useMutation({
    mutationFn: () => updateUser(id, { name: name.trim(), email: email.trim(), app_role: appRole, ...(password.trim() ? { password } : {}) }),
    onSuccess: () => {
      setSuccess('Benutzer wurde aktualisiert.')
      setErrorMessage('')
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['user', id] })
      if (currentUser?.id === id) refreshUser().catch(() => undefined)
    },
    onError: (e) => {
      const err = e as ApiError
      if (err.status === 401) setErrorMessage('Bitte erneut einloggen.')
      else if (err.status === 403) setErrorMessage('Keine Berechtigung für diese Aktion.')
      else if (err.status === 422) setErrorMessage('Validierungsfehler. Bitte Eingaben prüfen.')
      else setErrorMessage('Serverfehler beim Laden oder Speichern.')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['user', id] })
      navigate('/users')
    },
  })

  if (userQuery.isLoading) return <LoadingState />
  if (userQuery.isError) {
    const status = (userQuery.error as ApiError).status
    if (status === 401) return <ErrorState message="Bitte erneut einloggen." />
    if (status === 403) return <ErrorState message="Keine Berechtigung für diese Aktion." />
    if (status === 404) return <ErrorState message="Benutzer nicht gefunden." />
    return <ErrorState message="Serverfehler beim Laden oder Speichern." />
  }

  const user = userQuery.data!
  const canUpdate = can(user.can?.update)
  const canDelete = can(user.can?.delete)
  const passwordValid = password.length === 0 || password.length >= 8
  const formValid = name.trim().length > 0 && isValidEmail(email.trim()) && passwordValid

  return <section className='space-y-4'>
    <Link to={`/users/${id}`} className='text-sm text-blue-600'>← Zurück zum Profil</Link>
    <h1 className='text-2xl font-semibold'>Benutzer bearbeiten</h1>
    {success && <p className='rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700'>{success}</p>}
    {errorMessage && <p className='rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700'>{errorMessage}</p>}
    {!canUpdate && <p className='text-sm text-amber-700'>Keine Berechtigung für diese Aktion.</p>}

    <div className='rounded border bg-white p-4 space-y-2'>
      <label>Name *</label>
      <input value={name} onChange={(e) => setName(e.target.value)} disabled={!canUpdate} />
      <label>E-Mail *</label>
      <input type='email' value={email} onChange={(e) => setEmail(e.target.value)} disabled={!canUpdate} />
      {email.trim().length > 0 && !isValidEmail(email.trim()) && <p className='text-sm text-red-700'>Bitte gültige E-Mail eingeben.</p>}
      <label>App-Rolle</label>
      <select value={appRole} onChange={(e) => setAppRole(e.target.value as AppRole)} disabled={!canUpdate}>{APP_ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      <label>Passwort (optional)</label>
      <input type='password' value={password} onChange={(e) => setPassword(e.target.value)} disabled={!canUpdate} />
      {!passwordValid && <p className='text-sm text-red-700'>Passwort muss mindestens 8 Zeichen lang sein.</p>}
      <div className='flex gap-2'><button className='border px-3 py-2 disabled:opacity-50' disabled={!canUpdate || !formValid} title={!canUpdate ? NO_PERMISSION_MESSAGE : undefined} onClick={() => saveMutation.mutate()}>Speichern</button><Link to={`/users/${id}`} className='border px-3 py-2'>Abbrechen</Link></div>
    </div>

    <div className='rounded border border-red-200 bg-red-50 p-4'><h2 className='font-medium'>Danger Zone</h2><button className='bg-red-600 px-3 py-2 text-white disabled:opacity-50' disabled={!canDelete} title={!canDelete ? NO_PERMISSION_MESSAGE : undefined} onClick={() => window.confirm('Benutzer wirklich löschen?') && deleteMutation.mutate()}>Löschen</button></div>
  </section>
}
