import { clearAuth, readStoredToken } from '../auth/storage'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
    public code: 'unauthorized' | 'forbidden' | 'not_found' | 'validation' | 'server' | 'generic' = 'generic',
  ) {
    super(message)
  }
}

const normalizeBaseUrl = (value?: string) => {
  const trimmed = value?.replace(/\/+$/, '')
  if (!trimmed) return undefined
  return trimmed.endsWith('/api') ? trimmed.slice(0, -4) : trimmed
}

const baseUrl = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL)

if (!baseUrl) throw new Error('Missing VITE_API_BASE_URL')

const isLoginRequest = (path: string, method?: string) => path === '/api/login' && (method ?? 'GET').toUpperCase() === 'POST'

const mapError = (status: number, payload: unknown) => {
  if (status === 401) return new ApiError(status, 'Unauthorized (401). Please login again.', payload, 'unauthorized')
  if (status === 403) return new ApiError(status, 'Forbidden (403).', payload, 'forbidden')
  if (status === 404) return new ApiError(status, 'Resource not found (404).', payload, 'not_found')
  if (status === 422) return new ApiError(status, 'Validation failed (422).', payload, 'validation')
  if (status >= 500) return new ApiError(status, 'Server error. Please try again.', payload, 'server')
  return new ApiError(status, `Request failed with status ${status}.`, payload, 'generic')
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = readStoredToken()
  const headers = new Headers(init?.headers ?? {})
  headers.set('Accept', 'application/json')
  if (!headers.has('Content-Type') && init?.body) headers.set('Content-Type', 'application/json')
  if (token && !isLoginRequest(path, init?.method)) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${baseUrl}${path}`, { ...init, headers })

  if (!response.ok) {
    let payload: unknown
    try { payload = await response.json() } catch { payload = undefined }
    if (response.status === 401) {
      clearAuth()
      window.dispatchEvent(new CustomEvent('campaign-auth-required'))
    }
    throw mapError(response.status, payload)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
