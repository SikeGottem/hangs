// /api/hangs/[id]/comments — GET (public), POST (token-authenticated)
import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { CommentSchema, parseBody } from '@/lib/schemas'
import { serverError, badRequest, unauthorized } from '@/lib/errors'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    await ensureSchema()
    const res = await db.execute({
      sql: `SELECT c.id, c.text, c.created_at, p.name as author FROM comments c
            JOIN participants p ON p.id = c.participant_id WHERE c.hang_id = ? ORDER BY c.created_at ASC`,
      args: [id],
    })
    return NextResponse.json(res.rows)
  } catch (e) {
    return serverError(e, 'GET /comments')
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const raw = await req.json()
    const auth = await requireAuth(req, id, raw)
    if (!auth) return unauthorized()

    const parsed = parseBody(raw, CommentSchema)
    if ('error' in parsed) return badRequest(parsed.error)

    const db = getDb()
    await ensureSchema()
    await db.execute({
      sql: 'INSERT INTO comments (hang_id, participant_id, text) VALUES (?, ?, ?)',
      args: [id, auth.sub, parsed.data.text],
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    return serverError(e, 'POST /comments')
  }
}
