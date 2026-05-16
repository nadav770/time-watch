// Thin fetch wrapper — sends httpOnly session cookie on every request.
// Paths are relative (e.g. '/api/reports'); Vite's dev proxy forwards `/api`
// to the backend, and Vercel rewrites do the same in production.

const API_BASE = ''

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

export async function apiFetch(path, options = {}) {
  const isFormData = options.body instanceof FormData
  const headers = {
    Accept: 'application/json',
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {}),
  }

  let response
  try {
    response = await fetch(API_BASE + path, {
      ...options,
      headers,
      credentials: 'include',
    })
  } catch {
    throw new ApiError('שגיאת רשת — נסה שוב', 0, null)
  }

  const contentType = response.headers.get('content-type') || ''
  let body = null
  if (contentType.includes('application/json')) {
    body = await response.json().catch(() => null)
  } else {
    body = await response.text().catch(() => null)
  }

  if (response.status === 401) {
    throw new ApiError('פג תוקף החיבור — נא להתחבר מחדש', 401, body)
  }

  if (!response.ok) {
    const msg =
      (body && typeof body === 'object' && (body.message || body.error)) ||
      `שגיאה ${response.status}`
    throw new ApiError(msg, response.status, body)
  }

  return body
}
