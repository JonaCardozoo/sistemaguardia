const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const TOKEN_KEY = 'ldg_access_token'
const USER_KEY = 'ldg_user'

export type ApiUser = {
  id: string
  name: string
  email: string
  role: string
}

export type ApiGuardMember = {
  user_id: string
  name: string
  role: string
}

export type ApiGuard = {
  id: string
  date: string
  start_time: string
  end_time: string
  status: string
  chief_user_id: string
  chief_name: string
  members: ApiGuardMember[]
}

export type ApiEvent = {
  id: string
  guard_id: string
  event_data: Record<string, unknown>
  created_at?: string | null
  updated_at?: string | null
}

export type ApiPerson = {
  id: string
  name: string | null
  eri: string | null
  location: string | null
  device: string | null
  status: string
  created_by: string
}

export type ApiDashboard = {
  user: ApiUser
  guard: ApiGuard | null
  events: ApiEvent[]
  people: ApiPerson[]
}

export type TokenResponse = {
  access_token: string
  token_type: string
  user: ApiUser
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function getStoredUser(): ApiUser | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as ApiUser
  } catch {
    return null
  }
}

export function setSession(token: string, user: ApiUser) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = await response.json()
    if (typeof data?.detail === 'string') return data.detail
    if (Array.isArray(data?.detail)) return data.detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join(', ')
    if (typeof data?.error === 'string') return data.error
    return response.statusText || 'Error de API'
  } catch {
    return response.statusText || 'Error de API'
  }
}

async function request<T>(path: string, options: RequestInit = {}, auth = true): Promise<T> {
  const headers = new Headers(options.headers)
  if (!(options.body instanceof URLSearchParams) && options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (auth) {
    const token = getToken()
    if (!token) throw new ApiError('Unauthorized', 401)
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_URL}${path}`, { ...options, headers })
  if (response.status === 401) {
    clearSession()
    throw new ApiError('Unauthorized', 401)
  }
  if (!response.ok) throw new ApiError(await parseError(response), response.status)
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  register(input: { name: string; email: string; password: string; role?: string }) {
    return request<TokenResponse>('/auth/register', { method: 'POST', body: JSON.stringify(input) }, false)
  },

  login(email: string, password: string) {
    const body = new URLSearchParams()
    body.set('username', email)
    body.set('password', password)
    return request<TokenResponse>('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }, false)
  },

  me() {
    return request<ApiUser>('/auth/me')
  },

  dashboard() {
    return request<ApiDashboard>('/dashboard')
  },

  createGuard(input: {
    date: string
    startTime: string
    endTime: string
    members?: { user_id: string; role: string }[]
  }) {
    return request<ApiGuard>('/guards', {
      method: 'POST',
      body: JSON.stringify({
        date: input.date,
        start_time: input.startTime,
        end_time: input.endTime,
        members: input.members ?? [],
      }),
    })
  },

  listUsers() {
    return request<ApiUser[]>('/users')
  },

  finishGuard(guardId: string) {
    return request<ApiGuard>(`/guards/${guardId}/finish`, { method: 'POST' })
  },

  createEvent(guardId: string, eventData: unknown) {
    return request<ApiEvent>(`/guards/${guardId}/events`, {
      method: 'POST',
      body: JSON.stringify({ event_data: eventData }),
    })
  },

  updateEvent(guardId: string, eventId: string, eventData: unknown) {
    return request<ApiEvent>(`/guards/${guardId}/events/${eventId}`, {
      method: 'PATCH',
      body: JSON.stringify({ event_data: eventData }),
    })
  },

  addEventAction(guardId: string, eventId: string, action: unknown) {
    return request<ApiEvent>(`/guards/${guardId}/events/${eventId}/actions`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    })
  },

  listPeople() {
    return request<ApiPerson[]>('/people')
  },

  createPerson(input: { name?: string; eri?: string; location?: string; device?: string }) {
    return request<ApiPerson>('/people', { method: 'POST', body: JSON.stringify(input) })
  },

  updatePerson(id: string, input: { name?: string; eri?: string; location?: string; device?: string; status?: string }) {
    return request<ApiPerson>(`/people/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
  },

  deletePerson(id: string) {
    return request<void>(`/people/${id}`, { method: 'DELETE' })
  },

  createHandover(guardId: string, input: { summary: string; openEvents: number; notes?: string }) {
    return request(`/guards/${guardId}/handovers`, {
      method: 'POST',
      body: JSON.stringify({
        summary: input.summary,
        open_events: input.openEvents,
        notes: input.notes ?? null,
      }),
    })
  },
}

export function mapPerson(person: ApiPerson) {
  return {
    id: person.id,
    name: person.name || 'Sin nombre',
    eri: person.eri || 'Sin ERI',
    location: person.location || 'Sin localidad',
    device: person.device || 'Sin dispositivo',
    status: person.status,
  }
}

export function mapEvent(row: ApiEvent) {
  const data = row.event_data as Record<string, unknown>
  const clientId = typeof data.id === 'number' ? data.id : Number(String(row.id).replace(/\D/g, '').slice(-12)) || Date.now()
  return {
    ...data,
    id: clientId,
    dbId: row.id,
    guardId: row.guard_id,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    actions: Array.isArray(data.actions) ? data.actions : [],
  }
}
