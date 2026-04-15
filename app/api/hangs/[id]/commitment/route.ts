// POST /api/hangs/[id]/commitment — set commitment level + optional dietary / custom answer.
// Token-authenticated. Uses caller's identity from JWT, never trusts body participantId.
import { NextResponse } from 'next/server'
import { getDb, ensureSchema, getHangState } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { CommitmentSchema, parseBody } from '@/lib/schemas'
import { serverError, badRequest, unauthorized, forbidden, notFound } from '@/lib/errors'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const raw = await req.json()
    const auth = await requireAuth(req, id, raw)
    if (!auth) return unauthorized()

    const parsed = parseBody(raw, CommitmentSchema)
    if ('error' in parsed) return badRequest(parsed.error)
    const { level, dietary, customAnswer } = parsed.data

    const db = getDb()
    await ensureSchema()

    const state = await getHangState(id)
    if (!state.exists) return notFound()
    if (state.cancelled) return forbidden('This hang was cancelled')
    if (state.locked) return forbidden('Responses are locked for this hang')

    await db.batch(
      [
        {
          sql: `INSERT INTO commitment (hang_id, participant_id, level, updated_at)
                VALUES (?, ?, ?, datetime('now'))
                ON CONFLICT(hang_id, participant_id) DO UPDATE SET level = excluded.level, updated_at = excluded.updated_at`,
          args: [id, auth.sub, level],
        },
        {
          sql: `UPDATE participants SET
                  dietary = COALESCE(?, dietary),
                  custom_answer = COALESCE(?, custom_answer)
                WHERE id = ? AND hang_id = ?`,
          args: [dietary ?? null, customAnswer ?? null, auth.sub, id],
        },
      ],
      'write',
    )

    return NextResponse.json({ success: true, level })
  } catch (e) {
    return serverError(e, 'POST /commitment')
  }
}
