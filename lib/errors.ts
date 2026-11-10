// API error shape, status table, typed HangsError and sanitised 500s with a request id.
import type { ErrorCode } from './types'

type ServerErrorCode = Exclude<ErrorCode, 'network'>

const ERROR_STATUS: Record<ServerErrorCode, number> = {
  bad_request: 400,
  invalid_json: 400,
  too_many_options: 400,
  cannot_remove_organiser: 400,
  payload_too_large: 413,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  name_taken: 409,
  event_full: 409,
  last_option: 409,
  locked_option: 409,
  not_locked: 409,
  rate_limited: 429,
  server_error: 500,
}

const DEFAULT_MESSAGES: Record<ServerErrorCode, string> = {
  bad_request: "Something in that request wasn't right. Check it and try again.",
  invalid_json: "That request couldn't be read. Try again.",
  too_many_options: "That's too many days. The max is 62 days, or 20 with parts of the day.",
  cannot_remove_organiser: "The organiser's answers can't be removed.",
  payload_too_large: 'That request is too big.',
  unauthorized: "We couldn't find your answers on this device. Add your name to answer again.",
  forbidden: 'Only the organiser can do that.',
  not_found: "This hang doesn't exist, or it was removed.",
  name_taken: "There's already someone with that name here. Add an initial to tell you apart.",
  event_full: "This one's full (150 people). Tell the organiser.",
  last_option: 'Keep at least one day.',
  locked_option: 'Unlock before removing the locked day.',
  not_locked: "This hang isn't locked in yet.",
  rate_limited: 'Too many requests from this connection just now. Try again in a minute.',
  server_error: 'Something broke on our end. Try again in a moment.',
}

export class HangsError extends Error {
  readonly code: ServerErrorCode
  readonly status: number
  readonly headers?: Record<string, string>
  constructor(code: ServerErrorCode, message?: string, headers?: Record<string, string>) {
    super(message ?? DEFAULT_MESSAGES[code])
    this.name = 'HangsError'
    this.code = code
    this.status = ERROR_STATUS[code]
    this.headers = headers
  }
}

export function apiError(code: ServerErrorCode, message?: string, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders)
  headers.set('Cache-Control', 'no-store')
  return Response.json(
    { error: { code, message: message ?? DEFAULT_MESSAGES[code] } },
    { status: ERROR_STATUS[code], headers },
  )
}

// Logs full detail server-side with a request id; the client only sees a generic message plus the id.
export function serverError(e: unknown, ctx?: string): Response {
  const id = Math.random().toString(36).slice(2, 10)
  const msg = e instanceof Error ? e.message : String(e)
  const stack = e instanceof Error ? e.stack : ''
  console.error(`[hangs:${id}]${ctx ? ` ${ctx}:` : ''} ${msg}${stack ? '\n' + stack : ''}`)
  return apiError('server_error', `${DEFAULT_MESSAGES.server_error} (ref ${id})`, { 'x-request-id': id })
}

function nameTakenMessage(name: string, organiserName: string): string {
  return `There's already someone called ${name} here. Add an initial, like ${name} B. If that's you from another app, open the link there, or ask ${organiserName} to remove the old one.`
}

// Maps known SQLite constraint failures to typed errors; returns null for anything else.
export function mapDbError(e: unknown, ctx?: { name?: string; organiserName?: string }): HangsError | null {
  const msg = e instanceof Error ? e.message : String(e)
  const code = (e as { code?: unknown } | null)?.code
  const isConstraint = (typeof code === 'string' && code.startsWith('SQLITE_CONSTRAINT')) || /constraint failed/i.test(msg)
  if (!isConstraint) return null
  if (/people\.(event_id, people\.)?name_key/.test(msg)) {
    return new HangsError('name_taken', ctx?.name ? nameTakenMessage(ctx.name, ctx.organiserName ?? 'the organiser') : undefined)
  }
  // setEventDates' in-transaction cap guard inserts a NULL date to abort the batch.
  if (/NOT NULL constraint failed: event_options\.date/.test(msg)) return new HangsError('too_many_options')
  // setEventDates' locked-day guard inserts a NULL part to abort the batch when a removed date holds the lock.
  if (/NOT NULL constraint failed: event_options\.part/.test(msg)) return new HangsError('locked_option')
  return null
}

export function errorToResponse(e: unknown, ctx: string): Response {
  if (e instanceof HangsError) return apiError(e.code, e.message, e.headers)
  const mapped = mapDbError(e)
  if (mapped) return apiError(mapped.code, mapped.message)
  return serverError(e, ctx)
}
