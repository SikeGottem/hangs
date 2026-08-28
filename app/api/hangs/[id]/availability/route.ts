// POST /api/hangs/[id]/availability — single batched write, token-authenticated
import { NextResponse } from 'next/server'
import type { InStatement } from '@libsql/client'
import { getDb, ensureSchema, getHangState } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { AvailabilitySchema, parseBody } from '@/lib/schemas'
import { serverError, badRequest, unauthorized, forbidden, notFound } from '@/lib/errors'
import { notify } from '@/lib/notifications'

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
    const allowedDates = new Set(state.validDates)
    if (slots.some(slot => !allowedDates.has(slot.date))) {
      return badRequest('Availability includes a date outside this hang')
    }

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

    // Notify the hang creator that a new availability response arrived.
    // We fire this after the write succeeds so failures here don't block the
    // participant's submit. Errors are swallowed — notification loss is
    // preferable to a 500 for the responding user.
    //
    // We skip notifying if:
    //   (a) the creator_id is not set (old hangs without backfill), or
    //   (b) the submitter IS the creator (creator filling their own grid).
    //
    // TODO(pretest): deadline reminder — when response_deadline is within 24h
    // and <50% have responded, emit a 'response_needed' notification here too.
    try {
      const hangMeta = await db.execute({
        sql: `SELECT h.creator_id, h.name AS hang_name, h.crew_id,
                     p.name AS participant_name
              FROM hangs h
              LEFT JOIN participants p ON p.id = ? AND p.hang_id = h.id
              WHERE h.id = ?`,
        args: [auth.sub, id],
      })
      const meta = hangMeta.rows[0]
      const creatorId = meta?.creator_id as string | null
      const hangName = (meta?.hang_name as string) || 'your hang'
      const crewId = (meta?.crew_id as string) || null
      const participantName = (meta?.participant_name as string) || 'Someone'

      if (creatorId && creatorId !== auth.sub) {
        await notify({
          userId: creatorId,
          type: 'response_needed',
          hangId: id,
          crewId,
          text: `${participantName} filled in their availability for "${hangName}"`,
          url: `/h/${id}`,
        })
      }
    } catch {
      // Non-fatal — notification delivery failure must never block the response.
    }

    return NextResponse.json({ success: true, count: slots.length })
  } catch (e) {
    return serverError(e, 'POST /availability')
  }
}
