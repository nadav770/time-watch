const API_BASE = import.meta.env.VITE_API_URL ?? ''

type QueryParams = Record<string, string | number | boolean | null | undefined>

export type AbsenceRequest = {
  type?: string
  start_date?: string
  end_date?: string
  is_partial?: boolean
  partial_hours?: number | null
  notes?: string
}

export type AbsenceResponse = {
  id?: number
  document_filename?: string | null
  [key: string]: unknown
} | null

type ErrorResponse = {
  message?: string
  error?: string
}

function getErrorMessage(data: AbsenceResponse | ErrorResponse) {
  if (!data || typeof data !== 'object') return 'אירעה תקלה בבקשה'
  if ('message' in data && typeof data.message === 'string') return data.message
  if ('error' in data && typeof data.error === 'string') return data.error
  return 'אירעה תקלה בבקשה'
}

async function parseResponse(res: Response): Promise<AbsenceResponse> {
  if (res.status === 204) return null
  const data = await res.json().catch(() => null) as AbsenceResponse | ErrorResponse
  if (!res.ok) {
    throw new Error(getErrorMessage(data))
  }
  return data
}

function buildQuery(params: QueryParams = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value))
    }
  })
  const queryString = query.toString()
  return queryString ? `?${queryString}` : ''
}

export async function getAbsences(params?: QueryParams) {
  const res = await fetch(`${API_BASE}/api/absences${buildQuery(params)}`, {
    credentials: 'include',
  })
  return parseResponse(res)
}

export async function createAbsence(data: AbsenceRequest) {
  const res = await fetch(`${API_BASE}/api/absences`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return parseResponse(res)
}

export async function updateAbsence(id: number, data: AbsenceRequest) {
  const res = await fetch(`${API_BASE}/api/absences/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return parseResponse(res)
}

export async function uploadDocument(id: number, file: File) {
  const formData = new FormData()
  formData.append('document', file)

  const res = await fetch(`${API_BASE}/api/absences/${id}/document`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  return parseResponse(res)
}

export async function deleteDocument(id: number) {
  const res = await fetch(`${API_BASE}/api/absences/${id}/document`, {
    method: 'DELETE',
    credentials: 'include',
  })
  return parseResponse(res)
}
