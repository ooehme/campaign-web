import { clearAuth, readStoredToken } from '../auth/storage'

export class ApiError extends Error {
  constructor(
    public status: number,
    public message: string,
    public details?: unknown,
  ) {
    super(message)
  }
}

const baseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '')

if (!baseUrl) {
  throw new Error('Missing VITE_API_BASE_URL')
}

const buildErrorMessage = (status: number, payload: unknown) => {
  if (status === 401) return 'Unauthorized (401). Please login again.'
  if (status === 403) return 'Forbidden (403).'
  if (status === 404) return 'Resource not found (404).'
  if (status === 422) {
    const validationMessage =
      typeof payload === 'object' &&
      payload !== null &&
      'message' in payload &&
      typeof payload.message === 'string'
        ? payload.message
        : undefined
    return validationMessage
      ? `Validation failed (422): ${validationMessage}`
      : 'Validation failed (422).'
  }
  return `Request failed with status ${status}.`
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = readStoredToken()
  const headers = new Headers(init?.headers ?? {})
  headers.set('Accept', 'application/json')
  if (!headers.has('Content-Type') && init?.body) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  })

  if (!response.ok) {
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      payload = undefined
    }
    if (response.status === 401) {
      clearAuth()
      window.dispatchEvent(new CustomEvent('campaign-auth-required'))
    }
    throw new ApiError(response.status, buildErrorMessage(response.status, payload), payload)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
