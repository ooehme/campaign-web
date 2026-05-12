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

const createHeaders = (path: string, init?: RequestInit, accept = 'application/json') => {
  const token = readStoredToken()
  const headers = new Headers(init?.headers ?? {})
  headers.set('Accept', accept)
  if (!headers.has('Content-Type') && init?.body) headers.set('Content-Type', 'application/json')
  if (token && !isLoginRequest(path, init?.method)) headers.set('Authorization', `Bearer ${token}`)
  return headers
}

const readErrorPayload = async (response: Response) => {
  try { return await response.json() } catch { return undefined }
}

const throwMappedError = async (response: Response) => {
  const payload = await readErrorPayload(response)
  if (response.status === 401) {
    clearAuth()
    window.dispatchEvent(new CustomEvent('campaign-auth-required'))
  }
  throw mapError(response.status, payload)
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = createHeaders(path, init)

  const response = await fetch(`${baseUrl}${path}`, { ...init, headers })

  if (!response.ok) {
    await throwMappedError(response)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function apiRequestNdjson<TEvent>(
  path: string,
  init: RequestInit | undefined,
  onEvent: (event: TEvent) => void,
  options?: { debugLabel?: string },
): Promise<void> {
  const headers = createHeaders(path, init, 'application/x-ndjson, application/json')
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers })
  const debugLabel = options?.debugLabel
  if (debugLabel) {
    console.info(debugLabel, 'response opened', {
      status: response.status,
      contentType: response.headers.get('content-type'),
      cacheControl: response.headers.get('cache-control'),
      xAccelBuffering: response.headers.get('x-accel-buffering'),
    })
  }

  if (!response.ok) {
    await throwMappedError(response)
  }

  if (!response.body) return

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    const chunk = decoder.decode(value, { stream: !done })
    if (debugLabel && chunk) console.info(debugLabel, 'raw chunk', chunk)
    buffer += chunk
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      let event: TEvent
      try {
        event = JSON.parse(trimmed) as TEvent
      } catch (error) {
        console.error(debugLabel ?? 'NDJSON stream', 'invalid JSON line', { line: trimmed, error })
        throw new ApiError(response.status, 'Invalid NDJSON stream response.', { line: trimmed }, 'server')
      }

      if (debugLabel) console.info(debugLabel, 'line', trimmed)
      onEvent(event)
    }

    if (done) break
  }

  const trimmed = buffer.trim()
  if (trimmed) {
    let event: TEvent
    try {
      event = JSON.parse(trimmed) as TEvent
    } catch (error) {
      console.error(debugLabel ?? 'NDJSON stream', 'invalid JSON line', { line: trimmed, error })
      throw new ApiError(response.status, 'Invalid NDJSON stream response.', { line: trimmed }, 'server')
    }

    if (debugLabel) console.info(debugLabel, 'line', trimmed)
    onEvent(event)
  }
}
