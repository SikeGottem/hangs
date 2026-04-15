// /api/hangs/[id]/rsvp — GET (public), POST (token-authenticated)
import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { RsvpSchema, parseBody } from '@/lib/schemas'
import { serverError, badRequest, unauthorized } from '@/lib/errors'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    await ensureSchema()
    const res = await db.execute({
      sql: 'SELECT r.status, p.name FROM rsvp r JOIN participants p ON p.id = r.participant_id WHERE r.hang_id = ?',
      args: [id],
    })
    return NextResponse.json(res.rows)
  } catch (e) {
    return serverError(e, 'GET /rsvp')
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const raw = await req.json()
    const auth = await requireAuth(req, id, raw)
    if (!auth) return unauthorized()

    const parsed = parseBody(raw, RsvpSchema)
    if ('error' in parsed) return badRequest(parsed.error)

    const db = getDb()
    await ensureSchema()
    await db.execute({
      sql: `INSERT INTO rsvp (hang_id, participant_id, status) VALUES (?, ?, ?)
            ON CONFLICT(hang_id, participant_id) DO UPDATE SET status = excluded.status`,
      args: [id, auth.sub, parsed.data.status],
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    return serverError(e, 'POST /rsvp')
  }
}
