// Invite-token consumer; preserves membership creation and authentication redirects.

import Link from 'next/link'
import { cookies, headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getDb, ensureSchema, genId } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { logEvent } from '@/lib/analytics'
import styles from '@/app/product.module.css'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ token?: string }> }

export default async function JoinCrewPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { token } = await searchParams
  if (!token) notFound()
  const db = getDb()
  await ensureSchema()
  const crewRes = await db.execute({ sql: 'SELECT id, name, public_invite_token FROM crews WHERE slug = ?', args: [slug] })
  const crew = crewRes.rows[0]
  if (!crew) notFound()
  const validToken = crew.public_invite_token as string | null
  if (!validToken || validToken !== token) {
    return <section className={styles.statusPage}><span className={styles.statusCode}>INVITE UNAVAILABLE</span><h1 className={styles.title}>This link has run its course.</h1><p>It may have expired or been revoked. Ask an exec from {crew.name as string} for a fresh invite.</p><div className={styles.statusActions}><Link href={`/c/${slug}`} className="btn-secondary">View crew</Link><Link href="/" className="btn-primary">Back to hangs</Link></div></section>
  }

  const requestHeaders = await headers()
  const requestCookies = await cookies()
  const fakeHeaders = new Headers()
  requestHeaders.forEach((value, key) => fakeHeaders.set(key, value))
  const cookieString = requestCookies.getAll().map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
  if (cookieString) fakeHeaders.set('cookie', cookieString)
  const user = await requireUser(new Request('http://local', { headers: fakeHeaders }))
  if (!user) redirect(`/login?redirect=${encodeURIComponent(`/c/${slug}/join?token=${encodeURIComponent(token)}`)}`)

  const crewId = crew.id as string
  const existing = await db.execute({ sql: 'SELECT id FROM crew_members WHERE crew_id = ? AND user_id = ?', args: [crewId, user.sub] })
  if (!existing.rows[0]) {
    await db.execute({ sql: `INSERT INTO crew_members (id, crew_id, user_id, display_name, role) VALUES (?, ?, ?, ?, 'member')`, args: [genId(10), crewId, user.sub, user.email.split('@')[0]] })
    logEvent('member_joined', { userId: user.sub, crewId, metadata: { source: 'public_link' } })
  }
  redirect(`/crews/${crewId}/profile`)
}
