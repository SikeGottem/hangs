// POST /api/auth/request-magic-link — accepts an email, issues a 15-min
// one-shot token, emails the magic link. Rate-limited per-email + per-IP.

import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getDb, ensureSchema } from '@/lib/db'
import { RequestMagicLinkSchema, parseBody } from '@/lib/schemas'
import { badRequest, serverError, tooMany } from '@/lib/errors'
import { sendMagicLink } from '@/lib/email'

// Cheap in-memory rate-limit fallback when Upstash isn't configured.
// Keyed by email + IP. Window: 1 minute per email, 10 per hour per IP.
const recentByEmail = new Map<string, number>()
const recentByIp: Map<string, number[]> = new Map()

function localRateLimit(email: string, ip: string): { ok: boolean; reason?: string } {
  const now = Date.now()
  const oneMin = 60_000
  const oneHour = 60 * oneMin

  const last = recentByEmail.get(email) || 0
  if (now - last < oneMin) return { ok: false, reason: 'email' }
  recentByEmail.set(email, now)

  const hits = (recentByIp.get(ip) || []).filter(t => now - t < oneHour)
  if (hits.length >= 10) return { ok: false, reason: 'ip' }
  hits.push(now)
  recentByIp.set(ip, hits)

  return { ok: true }
}

function getIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for') || ''
  return fwd.split(',')[0].trim() || req.headers.get('x-real-ip') || 'local'
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = parseBody(body, RequestMagicLinkSchema)
    if ('error' in parsed) return badRequest(parsed.error)

    const { email, redirect } = parsed.data
    const ip = getIp(req)

    const rl = localRateLimit(email, ip)
    if (!rl.ok) return tooMany(`Slow down — too many attempts (${rl.reason}).`)

    const db = getDb()
    await ensureSchema()

    // Upsert the user row; issue a fresh magic-link token.
    const existing = await db.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: [email],
    })

    let userId: string
    if (existing.rows[0]) {
      userId = existing.rows[0].id as string
    } else {
      userId = randomBytes(8).toString('base64url').slice(0, 10)
      await db.execute({
        sql: 'INSERT INTO users (id, email) VALUES (?, ?)',
        args: [userId, email],
      })
    }

    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString()

    await db.execute({
      sql: `INSERT INTO auth_tokens (token, user_id, email, purpose, crew_context, expires_at)
            VALUES (?, ?, ?, 'magic_link', ?, ?)`,
      args: [token, userId, email, redirect || null, expiresAt],
    })

    // Use the incoming request's origin for the link so dev port changes (3000 → 3003)
    // don't leave users clicking links that point to the wrong port.
    const origin = new URL(req.url).origin
    await sendMagicLink({ email, token, origin })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return serverError(e, 'POST /api/auth/request-magic-link')
  }
}
