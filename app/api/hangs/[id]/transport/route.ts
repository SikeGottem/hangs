// /api/hangs/[id]/transport — GET (public), POST (token-authenticated)
import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { TransportSchema, parseBody } from '@/lib/schemas'
import { serverError, badRequest, unauthorized } from '@/lib/errors'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    await ensureSchema()
    const res = await db.execute({
      sql: 'SELECT t.mode, t.seats, p.name FROM transport t JOIN participants p ON p.id = t.participant_id WHERE t.hang_id = ?',
      args: [id],
    })
    return NextResponse.json(res.rows)
  } catch (e) {
    return serverError(e, 'GET /transport')
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const raw = await req.json()
    const auth = await requireAuth(req, id, raw)
    if (!auth) return unauthorized()

    const parsed = parseBody(raw, TransportSchema)
    if ('error' in parsed) return badRequest(parsed.error)

    const db = getDb()
    await ensureSchema()
    await db.execute({
      sql: `INSERT INTO transport (hang_id, participant_id, mode, seats) VALUES (?, ?, ?, ?)
            ON CONFLICT(hang_id, participant_id) DO UPDATE SET mode = excluded.mode, seats = excluded.seats`,
      args: [id, auth.sub, parsed.data.mode, parsed.data.seats || 0],
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    return serverError(e, 'POST /transport')
  }
}
