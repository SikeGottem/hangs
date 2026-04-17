// JWT sign/verify for participant and creator identity. Every mutation endpoint
// must call verifyParticipantToken and use payload.sub as the authoritative
// participantId — NEVER trust a participantId that comes from the request body.
//
// Two parallel identity systems:
//   1. Participant JWT (below) — per-hang, 90d, localStorage. Legacy guest flow.
//   2. User session JWT (further below) — per-user, 30d, HTTP-only cookie. Crew flow.

import { SignJWT, jwtVerify } from 'jose'

const rawSecret = process.env.PARTICIPANT_SECRET
if (!rawSecret && process.env.NODE_ENV === 'production') {
  console.error('[hangs] PARTICIPANT_SECRET is not set — tokens will be insecure')
}
const secret = new TextEncoder().encode(
  rawSecret || 'dev-only-insecure-secret-change-me-in-production'
)

// Separate secret for user sessions so a participant token can't be swapped
// for a session token and vice versa.
const rawUserSecret = process.env.USER_SECRET
if (!rawUserSecret && process.env.NODE_ENV === 'production') {
  console.error('[hangs] USER_SECRET is not set — user sessions will be insecure')
}
const userSecret = new TextEncoder().encode(
  rawUserSecret || 'dev-only-insecure-user-secret-change-me-in-production'
)

export const SESSION_COOKIE = 'hangs_session'

export type ParticipantClaims = {
  sub: string       // participantId
  hangId: string
  role: 'creator' | 'guest'
}

export async function signParticipantToken(
  participantId: string,
  hangId: string,
  isCreator = false,
): Promise<string> {
  return new SignJWT({ hangId, role: isCreator ? 'creator' : 'guest' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(participantId)
    .setIssuedAt()
    .setExpirationTime('90d')
    .sign(secret)
}

export async function verifyParticipantToken(
  token: string,
  expectedHangId: string,
): Promise<ParticipantClaims | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret)
    if (!payload.sub || payload.hangId !== expectedHangId) return null
    if (payload.role !== 'creator' && payload.role !== 'guest') return null
    return {
      sub: payload.sub,
      hangId: payload.hangId as string,
      role: payload.role as 'creator' | 'guest',
    }
  } catch {
    return null
  }
}

// Pulls the Authorization: Bearer <token> header (or falls back to body.token
// for legacy clients during a graceful rollout — kept for one release).
export function extractToken(req: Request, body?: { token?: string }): string {
  const header = req.headers.get('authorization') || ''
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim()
  return body?.token || ''
}

export async function requireAuth(
  req: Request,
  hangId: string,
  body?: { token?: string },
): Promise<ParticipantClaims | null> {
  return verifyParticipantToken(extractToken(req, body), hangId)
}

export async function requireCreator(
  req: Request,
  hangId: string,
  body?: { token?: string },
): Promise<ParticipantClaims | null> {
  const claims = await requireAuth(req, hangId, body)
  if (!claims || claims.role !== 'creator') return null
  return claims
}

// ── User session (crew pivot) ───────────────────────────────────────────────
//
// Issued after magic-link verification. Stored in HTTP-only cookie `hangs_session`.
// Survives device changes and is the source of truth for "am I logged in".

export type UserClaims = {
  sub: string       // userId
  email: string
}

export async function signUserToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(userSecret)
}

export async function verifyUserToken(token: string): Promise<UserClaims | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, userSecret)
    if (!payload.sub || typeof payload.email !== 'string') return null
    return { sub: payload.sub, email: payload.email }
  } catch {
    return null
  }
}

// Reads the session cookie from the request. Next's Request has cookies on the
// NextRequest variant, but we stay framework-agnostic by parsing the header.
export function getSessionTokenFromRequest(req: Request): string {
  const cookieHeader = req.headers.get('cookie') || ''
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === SESSION_COOKIE) return decodeURIComponent(rest.join('='))
  }
  return ''
}

export async function requireUser(req: Request): Promise<UserClaims | null> {
  return verifyUserToken(getSessionTokenFromRequest(req))
}

// Build a Set-Cookie header value. HTTP-only, SameSite=Lax so it's sent on
// top-level navigations from magic-link emails. Secure only in production.
export function buildSessionCookie(token: string, maxAgeSec = 60 * 60 * 24 * 30): string {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
  ]
  if (process.env.NODE_ENV === 'production') parts.push('Secure')
  return parts.join('; ')
}

export function buildClearSessionCookie(): string {
  const parts = [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ]
  if (process.env.NODE_ENV === 'production') parts.push('Secure')
  return parts.join('; ')
}
