// POST /api/hangs/[id]/availability — single batched write, token-authenticated
import { NextResponse } from 'next/server'
import type { InStatement } from '@libsql/client'
import { getDb, ensureSchema, getHangState } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { AvailabilitySchema, parseBody } from '@/lib/schemas'
import { serverError, badRequest, unauthorized, forbidden, notFound } from '@/lib/errors'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const raw = await req.json()
    const auth = await requireAuth(req, id, raw)
    if (!auth) return unauthorized()

    const parsed = parseBody(raw, AvailabilitySchema)
    if ('error' in parsed) return badRequest(parsed.error)
    const { slots, commitment, dietary, customAnswer } = parsed.data

    const db = getDb()
    await ensureSchema()

    const state = await getHangState(id)
    if (!state.exists) return notFound()
    if (state.cancelled) return forbidden('This hang was cancelled')
    if (state.locked) return forbidden('Responses are locked for this hang')

    // One batched write: availability + commitment + participant profile fields.
    // All three are submitted together in the final step of the respond flow.
    const writes: InStatement[] = [
      { sql: 'DELETE FROM availability WHERE hang_id = ? AND participant_id = ?', args: [id, auth.sub] },
      ...slots
        .filter(s => s.status !== 'busy')
        .map(s => ({
          sql: `INSERT INTO availability (hang_id, participant_id, date, hour, status)
                VALUES (?, ?, ?, ?, ?)`,
          args: [id, auth.sub, s.date, s.hour, s.status],
        })),
    ]

    if (commitment) {
      writes.push({
        sql: `INSERT INTO commitment (hang_id, participant_id, level, updated_at)
              VALUES (?, ?, ?, datetime('now'))
              ON CONFLICT(hang_id, participant_id) DO UPDATE SET level = excluded.level, updated_at = excluded.updated_at`,
        args: [id, auth.sub, commitment],
      })
    }

    if (dietary !== undefined || customAnswer !== undefined) {
      writes.push({
        sql: `UPDATE participants SET
                dietary = COALESCE(?, dietary),
                custom_answer = COALESCE(?, custom_answer)
              WHERE id = ? AND hang_id = ?`,
        args: [dietary ?? null, customAnswer ?? null, auth.sub, id],
      })
    }

    await db.batch(writes, 'write')

    return NextResponse.json({ success: true, count: slots.length })
  } catch (e) {
    return serverError(e, 'POST /availability')
  }
}
