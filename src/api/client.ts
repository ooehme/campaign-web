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
const token = import.meta.env.VITE_API_TOKEN

if (!baseUrl) {
  throw new Error('Missing VITE_API_BASE_URL')
}

if (!token) {
  throw new Error('Missing VITE_API_TOKEN')
}

const buildErrorMessage = (status: number, payload: unknown) => {
  if (status === 401) return 'Unauthorized (401). Check Sanctum token.'
  if (status === 403) return 'Forbidden (403). Your token lacks permissions.'
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
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      payload = undefined
    }
    throw new ApiError(response.status, buildErrorMessage(response.status, payload), payload)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
