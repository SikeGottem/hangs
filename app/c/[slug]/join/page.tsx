// /c/[slug]/join?token=... — consumes a public invite token.
// If logged in + token valid: add to crew_members, redirect to /crews/[id].
// If not logged in: redirect to /login with redirect back to here so the
// magic-link flow picks up where we left off.

import { getDb, ensureSchema, genId } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { notFound, redirect } from 'next/navigation'
import { headers, cookies } from 'next/headers'
import { logEvent } from '@/lib/analytics'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ token?: string }>
}

export default async function JoinCrewPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { token } = await searchParams
  if (!token) notFound()

  const db = getDb()
  await ensureSchema()

  const crewRes = await db.execute({
    sql: 'SELECT id, name, public_invite_token FROM crews WHERE slug = ?',
    args: [slug],
  })
  const crew = crewRes.rows[0]
  if (!crew) notFound()

  const validToken = crew.public_invite_token as string | null
  if (!validToken || validToken !== token) {
    return (
      <div style={{ maxWidth: 420, margin: '0 auto', padding: '48px 24px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Link expired or revoked</h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
          Ask an exec for a fresh invite link.
        </p>
      </div>
    )
  }

  // Build a manual Request-shape from next/headers so requireUser can check cookies
  const h = await headers()
  const c = await cookies()
  const fakeHeaders = new Headers()
  h.forEach((value, key) => fakeHeaders.set(key, value))
  const cookieStr = c.getAll().map(cc => `${cc.name}=${cc.value}`).join('; ')
  if (cookieStr) fakeHeaders.set('cookie', cookieStr)
  const fakeReq = new Request('http://local', { headers: fakeHeaders })

  const user = await requireUser(fakeReq)
  if (!user) {
    // Not logged in — send to login, come back here after
    const redirectTarget = `/c/${slug}/join?token=${encodeURIComponent(token)}`
    redirect(`/login?redirect=${encodeURIComponent(redirectTarget)}`)
  }

  const crewId = crew.id as string

  // Idempotent: add to crew_members if not already a member
  const existing = await db.execute({
    sql: 'SELECT id FROM crew_members WHERE crew_id = ? AND user_id = ?',
    args: [crewId, user.sub],
  })

  if (!existing.rows[0]) {
    const displayName = user.email.split('@')[0]
    await db.execute({
      sql: `INSERT INTO crew_members (id, crew_id, user_id, display_name, role)
            VALUES (?, ?, ?, ?, 'member')`,
      args: [genId(10), crewId, user.sub, displayName],
    })
    logEvent('member_joined', { userId: user.sub, crewId, metadata: { source: 'public_link' } })
  }

  redirect(`/crews/${crewId}/profile`)
}
