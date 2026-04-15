// JWT sign/verify for participant and creator identity. Every mutation endpoint
// must call verifyParticipantToken and use payload.sub as the authoritative
// participantId — NEVER trust a participantId that comes from the request body.

import { SignJWT, jwtVerify } from 'jose'

const rawSecret = process.env.PARTICIPANT_SECRET
if (!rawSecret && process.env.NODE_ENV === 'production') {
  console.error('[hangs] PARTICIPANT_SECRET is not set — tokens will be insecure')
}
const secret = new TextEncoder().encode(
  rawSecret || 'dev-only-insecure-secret-change-me-in-production'
)

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
