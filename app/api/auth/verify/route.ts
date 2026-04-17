// GET /api/auth/verify?token=... — consumes a magic-link token, issues a
// 30-day session cookie, and redirects to the intended destination.

import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'
import { signUserToken, buildSessionCookie } from '@/lib/auth'
import { serverError } from '@/lib/errors'
import { logEvent } from '@/lib/analytics'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const token = url.searchParams.get('token') || ''
    if (!token) return NextResponse.redirect(new URL('/login?e=missing', url.origin))

    const db = getDb()
    await ensureSchema()

    const res = await db.execute({
      sql: `SELECT t.token, t.user_id, t.email, t.crew_context, t.expires_at, t.consumed_at,
                   u.id as user_id_joined, u.email as user_email
            FROM auth_tokens t
            LEFT JOIN users u ON u.id = t.user_id
            WHERE t.token = ? AND t.purpose = 'magic_link'`,
      args: [token],
    })
    const row = res.rows[0]

    if (!row) return NextResponse.redirect(new URL('/login?e=invalid', url.origin))
    if (row.consumed_at) return NextResponse.redirect(new URL('/login?e=used', url.origin))
    if (new Date(row.expires_at as string) < new Date()) {
      return NextResponse.redirect(new URL('/login?e=expired', url.origin))
    }

    // One-shot: mark consumed.
    await db.execute({
      sql: 'UPDATE auth_tokens SET consumed_at = datetime(\'now\') WHERE token = ?',
      args: [token],
    })

    const userId = row.user_id as string
    const email = (row.user_email || row.email) as string

    const sessionToken = await signUserToken(userId, email)
    const redirectPath = (row.crew_context as string | null) || '/crews'

    logEvent('auth_login', { userId })

    const resp = NextResponse.redirect(new URL(redirectPath, url.origin))
    resp.headers.set('Set-Cookie', buildSessionCookie(sessionToken))
    return resp
  } catch (e) {
    return serverError(e, 'GET /api/auth/verify')
  }
}
