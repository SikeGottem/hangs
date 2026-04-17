// POST /api/auth/logout — clears the session cookie.

import { NextResponse } from 'next/server'
import { buildClearSessionCookie } from '@/lib/auth'

export async function POST() {
  const resp = NextResponse.json({ ok: true })
  resp.headers.set('Set-Cookie', buildClearSessionCookie())
  return resp
}
