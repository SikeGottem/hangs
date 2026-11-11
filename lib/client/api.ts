// Browser API wrappers for /api/events: never throw, send auth headers from the in-memory-first identity, and
// store the identity a create or join returns.
import type { z } from 'zod'
import type { CreateEventInput } from '../schemas'
import type {
  AnswerUpdate, ApiError, ApiResult, CreateEventResponse, EventState, JoinResponse, SaveAnswersResponse,
} from '../types'
import { readIdentity, rememberEvent, seedEventState, setRememberedName, writeIdentity } from './storage'

interface AuthOverride { personToken?: string | null; organiserKey?: string | null }

export function authHeaders(eventId: string): HeadersInit {
  const id = readIdentity(eventId)
  const h: Record<string, string> = {}
  if (id.personToken) h['x-hangs-person'] = id.personToken
  if (id.organiserKey) h['x-hangs-organiser'] = id.organiserKey
  return h
}

export const NETWORK_ERROR: ApiError = { code: 'network', message: "Couldn't reach Hangs. Check your connection.", status: 0 }

// Network, server and rate-limit failures are worth retrying; everything else needs the person to act.
export const isRetryable = (e: ApiError) => e.status === 0 || e.status >= 500 || e.status === 429

async function call<T>(
  method: string,
  path: string,
  opts: { eventId?: string; body?: unknown; auth?: AuthOverride; headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<ApiResult<T> | { ok: true; data: 'not_modified' }> {
  const headers = new Headers(opts.headers)
  if (opts.auth) {
    if (opts.auth.personToken) headers.set('x-hangs-person', opts.auth.personToken)
    if (opts.auth.organiserKey) headers.set('x-hangs-organiser', opts.auth.organiserKey)
  } else if (opts.eventId) {
    for (const [k, v] of Object.entries(authHeaders(opts.eventId) as Record<string, string>)) headers.set(k, v)
  }
  if (opts.body !== undefined) headers.set('Content-Type', 'application/json')
  // A stalled connection (flaky mobile data, in-app webviews) becomes a network error instead of hanging forever.
  const controller = opts.timeoutMs ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), opts.timeoutMs) : null
  let res: Response
  try {
    res = await fetch(path, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      cache: 'no-store',
      signal: controller?.signal,
    })
  } catch {
    return { ok: false, error: NETWORK_ERROR }
  } finally {
    if (timer) clearTimeout(timer)
  }
  if (res.status === 304) return { ok: true, data: 'not_modified' }
  let payload: unknown = null
  try {
    payload = await res.json()
  } catch {
    payload = null
  }
  if (res.ok) return { ok: true, data: payload as T }
  const err = (payload as { error?: { code?: string; message?: string } } | null)?.error
  const retryAfter = Number(res.headers.get('retry-after'))
  return {
    ok: false,
    error: {
      code: (err?.code as ApiError['code']) ?? (res.status >= 500 ? 'server_error' : 'bad_request'),
      message: err?.message ?? (res.status >= 500 ? 'Something broke on our end. Try again in a moment.' : 'Something went wrong. Try again.'),
      status: res.status,
      ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfter } : {}),
    },
  }
}

const base = (eventId: string) => `/api/events/${encodeURIComponent(eventId)}`

// On success: stores the identity (in memory first), remembers the name and the event, and seeds the event page.
export async function createEvent(input: z.input<typeof CreateEventInput>): Promise<ApiResult<CreateEventResponse>> {
  const r = (await call<CreateEventResponse>('POST', '/api/events', { body: input, auth: {} })) as ApiResult<CreateEventResponse>
  if (r.ok) {
    const d = r.data
    writeIdentity(d.id, { personToken: d.personToken, personId: d.personId, organiserKey: d.organiserKey })
    setRememberedName(input.organiserName)
    rememberEvent({ id: d.id, title: d.state?.event.title ?? input.title, role: 'organiser', at: Date.now() })
    if (d.state) seedEventState(d.state)
  }
  return r
}

export async function fetchEvent(
  eventId: string,
  opts: { ifNoneMatch?: string; auth?: AuthOverride; timeoutMs?: number } = {},
): Promise<ApiResult<EventState | 'not_modified'>> {
  const headers: Record<string, string> = {}
  if (opts.ifNoneMatch) headers['If-None-Match'] = opts.ifNoneMatch.startsWith('"') ? opts.ifNoneMatch : `"${opts.ifNoneMatch}"`
  return call<EventState>('GET', base(eventId), { eventId, auth: opts.auth, headers, timeoutMs: opts.timeoutMs })
}

// `title` is the event title already on screen, remembered in "Your plans" if the response has no state.
export async function joinEvent(eventId: string, name: string, answers: AnswerUpdate[], title = ''): Promise<ApiResult<JoinResponse>> {
  const r = (await call<JoinResponse>('POST', `${base(eventId)}/people`, { eventId, body: { name, answers } })) as ApiResult<JoinResponse>
  if (r.ok) {
    writeIdentity(eventId, { personToken: r.data.personToken, personId: r.data.personId })
    setRememberedName(r.data.state?.people.find(p => p.id === r.data.personId)?.name ?? name)
    rememberEvent({ id: eventId, title: r.data.state?.event.title ?? title, role: 'guest', at: Date.now() })
  }
  return r
}

export async function saveAnswers(eventId: string, answers: AnswerUpdate[]): Promise<ApiResult<SaveAnswersResponse>> {
  return (await call<SaveAnswersResponse>('PUT', `${base(eventId)}/answers`, { eventId, body: { answers } })) as ApiResult<SaveAnswersResponse>
}

export async function renameMe(eventId: string, name: string): Promise<ApiResult<EventState>> {
  const r = (await call<EventState>('PATCH', `${base(eventId)}/people/me`, { eventId, body: { name } })) as ApiResult<EventState>
  if (r.ok) setRememberedName(r.data.viewer.name ?? name)
  return r
}

export async function updateEventDetails(eventId: string, patch: { title?: string; note?: string }): Promise<ApiResult<EventState>> {
  return (await call<EventState>('PATCH', base(eventId), { eventId, body: patch })) as ApiResult<EventState>
}

export async function setEventDates(eventId: string, dates: string[]): Promise<ApiResult<EventState>> {
  return (await call<EventState>('PUT', `${base(eventId)}/options`, { eventId, body: { dates } })) as ApiResult<EventState>
}

export async function removePerson(eventId: string, personId: string): Promise<ApiResult<EventState>> {
  return (await call<EventState>('DELETE', `${base(eventId)}/people/${encodeURIComponent(personId)}`, { eventId })) as ApiResult<EventState>
}

export async function lockEvent(eventId: string, input: { optionId: string; time: string | null; place: string }): Promise<ApiResult<EventState>> {
  return (await call<EventState>('POST', `${base(eventId)}/lock`, { eventId, body: input })) as ApiResult<EventState>
}

export async function unlockEvent(eventId: string): Promise<ApiResult<EventState>> {
  return (await call<EventState>('DELETE', `${base(eventId)}/lock`, { eventId })) as ApiResult<EventState>
}
