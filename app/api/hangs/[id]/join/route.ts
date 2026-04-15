// POST /api/hangs/[id]/join — returns participant token
import { NextResponse } from 'next/server'
import { getDb, ensureSchema, genId } from '@/lib/db'
import { signParticipantToken } from '@/lib/auth'
import { JoinSchema, parseBody } from '@/lib/schemas'
import { serverError, badRequest, notFound } from '@/lib/errors'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const raw = await req.json()
    const parsed = parseBody(raw, JoinSchema)
    if ('error' in parsed) return badRequest(parsed.error)

    const db = getDb()
    await ensureSchema()

    const hangRes = await db.execute({ sql: 'SELECT id FROM hangs WHERE id = ?', args: [id] })
    if (!hangRes.rows[0]) return notFound()

    const participantId = genId()
    await db.execute({
      sql: 'INSERT INTO participants (id, hang_id, name) VALUES (?, ?, ?)',
      args: [participantId, id, parsed.data.name],
    })

    const token = await signParticipantToken(participantId, id, false)

    return NextResponse.json({ participantId, token })
  } catch (e) {
    return serverError(e, 'POST /api/hangs/[id]/join')
  }
}
