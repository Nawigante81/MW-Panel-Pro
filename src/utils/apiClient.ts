const API_BASE = '/api'

const getStoredToken = (): string | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem('mwpanel-auth')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.state?.token || null
  } catch (_error) {
    return null
  }
}

type ApiEnvelope<T> = {
  ok: boolean
  data: T
  requestId: string
}

const isJsonResponse = (response: Response) => {
  const contentType = response.headers.get('content-type') || ''
  return contentType.toLowerCase().includes('application/json')
}

const toErrorMessage = (response: Response, payload: unknown) => {
  const typedPayload = payload as { error?: { message?: string } } | null
  if (typedPayload?.error?.message) {
    return typedPayload.error.message
  }
  return `API error (${response.status})`
}

const parseJson = async (response: Response): Promise<unknown | null> => {
  if (!isJsonResponse(response)) return null
  try {
    return await response.json()
  } catch (_error) {
    return null
  }
}

export const apiFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const providedHeaders = new Headers(init?.headers || {})
  const hasContentType = providedHeaders.has('Content-Type')
  const hasAuthorization = providedHeaders.has('Authorization')
  const token = getStoredToken()
  if (init?.body && typeof init.body === 'string' && !hasContentType) {
    providedHeaders.set('Content-Type', 'application/json; charset=utf-8')
  }
  if (token && !hasAuthorization) {
    providedHeaders.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: Object.fromEntries(providedHeaders.entries()),
  })

  const payload = await parseJson(response)

  if (!response.ok) {
    throw new Error(toErrorMessage(response, payload))
  }

  if (!payload) {
    throw new Error(`API error (${response.status}) - empty or non-JSON response body`)
  }

  return (payload as ApiEnvelope<T>).data
}

export const apiJsonFetch = async <T>(path: string, init: RequestInit, body: unknown): Promise<T> => {
  return apiFetch<T>(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(init?.headers || {}),
    },
    body: JSON.stringify(body),
  })
}
