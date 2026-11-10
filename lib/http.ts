// Server HTTP helpers for route handlers: capped JSON body parsing, auth headers, client IP, JSON responses and the
// Server-Timing header (database time and round trips) on every API response.
import 'server-only'
import type { z } from 'zod'
import { measureDb, serverTimingValue } from './db'
import { errorToResponse, HangsError } from './errors'
import { firstIssueMessage } from './schemas'

const MAX_BODY_BYTES = 16 * 1024

const PERSON_HEADER = 'x-hangs-person'
const ORGANISER_HEADER = 'x-hangs-organiser'

interface Auth { personToken: string | null; organiserKey: string | null }

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const h = new Headers(headers)
  h.set('Cache-Control', 'no-store')
  return Response.json(data, { status, headers: h })
}

// The client IP, for rate limiting only. On Vercel the edge sets x-vercel-forwarded-for / x-real-ip and overwrites
// any client-sent value, so they are trusted there. Elsewhere x-real-ip is assumed to come from a trusted reverse
// proxy, and only the last x-forwarded-for hop (the one our proxy appended) is used, never the client-supplied first.
// Takes a Request (route handlers) or its Headers (server components, via next/headers).
export function clientIp(src: Request | Headers): string {
  const h = 'get' in src ? src : src.headers
  if (process.env.VERCEL) {
    const v = h.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip')?.trim()
    if (v) return v
    return h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  }
  const real = h.get('x-real-ip')?.trim()
  if (real) return real
  const hops = h.get('x-forwarded-for')?.split(',').map(s => s.trim()).filter(Boolean) ?? []
  return hops[hops.length - 1] || 'unknown'
}

// Any non-empty header value counts as "sent"; a malformed one simply fails to match (and is flagged as rejected).
function headerToken(req: Request, name: string): string | null {
  const v = req.headers.get(name)?.trim()
  return v ? v.slice(0, 200) : null
}

export function readAuth(req: Request): Auth {
  return { personToken: headerToken(req, PERSON_HEADER), organiserKey: headerToken(req, ORGANISER_HEADER) }
}

async function readCapped(req: Request): Promise<string> {
  if (!req.body) return ''
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {})
      throw new HangsError('payload_too_large')
    }
    chunks.push(value)
  }
  const buf = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) { buf.set(c, offset); offset += c.byteLength }
  return new TextDecoder().decode(buf)
}

// Content-Type check -> 16 KB stream cap (413) -> JSON parse (invalid_json) -> zod (bad_request).
export async function parseJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.output<S>> {
  const ct = req.headers.get('content-type')
  if (!ct || ct.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new HangsError('bad_request', 'Send this as JSON.')
  }
  const text = await readCapped(req)
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new HangsError('invalid_json')
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) throw new HangsError('bad_request', firstIssueMessage(parsed.error))
  return parsed.data
}

// Adds a header, copying the response first if its headers are immutable.
function withHeader(res: Response, key: string, value: string): Response {
  try {
    res.headers.set(key, value)
    return res
  } catch {
    const copy = new Response(res.body, res)
    copy.headers.set(key, value)
    return copy
  }
}

// Runs a handler with a per-request database counter and reports it as Server-Timing (no extra round trips).
export async function timed(fn: () => Promise<Response>): Promise<Response> {
  const { value, timing } = await measureDb(fn)
  return withHeader(value, 'Server-Timing', serverTimingValue(timing))
}

// Wraps a handler so HangsErrors become typed JSON errors and anything else a sanitised 500; adds Server-Timing.
export async function handle(ctx: string, fn: () => Promise<Response>): Promise<Response> {
  return timed(async () => {
    try {
      return await fn()
    } catch (e) {
      return errorToResponse(e, ctx)
    }
  })
}
