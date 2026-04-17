// POST /api/crews/[id]/invite-link — generate (or rotate) a public invite token
// DELETE /api/crews/[id]/invite-link — clear the token, instantly revoking any
// previously-shared links.
//
// Exec-only. The token is opaque base64url (no collision risk); rotating
// doesn't change who's currently in the crew, only who can *future-join*.

import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getDb, ensureSchema } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { serverError, unauthorized, notFound, forbidden } from '@/lib/errors'

async function requireExec(req: Request, crewId: string): Promise<{ userId: string } | Response> {
  const claims = await requireUser(req)
  if (!claims) return unauthorized('Sign in first')
  const db = getDb()
  await ensureSchema()
  const res = await db.execute({
    sql: 'SELECT role FROM crew_members WHERE crew_id = ? AND user_id = ?',
    args: [crewId, claims.sub],
  })
  const role = res.rows[0]?.role as string | undefined
  if (!role) return notFound('Crew not found')
  if (role !== 'exec') return forbidden('Only execs can manage invite links')
  return { userId: claims.sub }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireExec(req, id)
    if (auth instanceof Response) return auth

    const token = randomBytes(18).toString('base64url')

    const db = getDb()
    await db.execute({
      sql: "UPDATE crews SET public_invite_token = ?, updated_at = datetime('now') WHERE id = ?",
      args: [token, id],
    })

    const slugRes = await db.execute({ sql: 'SELECT slug FROM crews WHERE id = ?', args: [id] })
    const slug = slugRes.rows[0]?.slug as string
    return NextResponse.json({ token, slug, url: `/c/${slug}/join?token=${token}` })
  } catch (e) {
    return serverError(e, 'POST /api/crews/[id]/invite-link')
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireExec(req, id)
    if (auth instanceof Response) return auth

    const db = getDb()
    await db.execute({
      sql: "UPDATE crews SET public_invite_token = NULL, updated_at = datetime('now') WHERE id = ?",
      args: [id],
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return serverError(e, 'DELETE /api/crews/[id]/invite-link')
  }
}
