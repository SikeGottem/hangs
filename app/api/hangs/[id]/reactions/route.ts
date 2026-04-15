// /api/hangs/[id]/reactions — GET (public), POST (token-authenticated)
import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { ReactionSchema, parseBody } from '@/lib/schemas'
import { serverError, badRequest, unauthorized } from '@/lib/errors'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    await ensureSchema()
    const res = await db.execute({
      sql: 'SELECT r.emoji, p.name FROM reactions r JOIN participants p ON p.id = r.participant_id WHERE r.hang_id = ?',
      args: [id],
    })
    return NextResponse.json(res.rows)
  } catch (e) {
    return serverError(e, 'GET /reactions')
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const raw = await req.json()
    const auth = await requireAuth(req, id, raw)
    if (!auth) return unauthorized()

    const parsed = parseBody(raw, ReactionSchema)
    if ('error' in parsed) return badRequest(parsed.error)

    const db = getDb()
    await ensureSchema()
    await db.execute({
      sql: `INSERT INTO reactions (hang_id, participant_id, emoji) VALUES (?, ?, ?)
            ON CONFLICT(hang_id, participant_id) DO UPDATE SET emoji = excluded.emoji`,
      args: [id, auth.sub, parsed.data.emoji],
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    return serverError(e, 'POST /reactions')
  }
}
