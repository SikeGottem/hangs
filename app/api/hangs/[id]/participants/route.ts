// DELETE /api/hangs/[id]/participants — creator can remove anyone (except themselves),
// or a participant can remove themselves. Cascade-deletes all owned rows.
import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { serverError, badRequest, unauthorized, notFound } from '@/lib/errors'

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const raw = await req.json().catch(() => ({}))
    const auth = await requireAuth(req, id, raw)
    if (!auth) return unauthorized()

    const db = getDb()
    await ensureSchema()

    const hangRes = await db.execute({
      sql: 'SELECT creator_id FROM hangs WHERE id = ?',
      args: [id],
    })
    if (!hangRes.rows[0]) return notFound('Hang not found')
    const creatorId = hangRes.rows[0].creator_id as string | null

    // Target defaults to the caller (self-delete) unless explicitly passed.
    const target = (raw as any).participantId || auth.sub
    const isSelfDelete = target === auth.sub
    const isCreatorCall = auth.role === 'creator' && auth.sub === creatorId

    if (!isSelfDelete && !isCreatorCall) {
      return unauthorized('Only the creator or the participant themselves can remove this')
    }

    // Creator can't delete themselves via this endpoint — they should delete the hang.
    if (isSelfDelete && auth.sub === creatorId) {
      return badRequest('Creator cannot remove themselves — delete the hang instead')
    }

    await db.batch(
      [
        { sql: 'DELETE FROM availability WHERE participant_id = ? AND hang_id = ?', args: [target, id] },
        { sql: 'DELETE FROM activity_votes WHERE participant_id = ?', args: [target] },
        { sql: 'DELETE FROM comments WHERE participant_id = ? AND hang_id = ?', args: [target, id] },
        { sql: 'DELETE FROM transport WHERE participant_id = ? AND hang_id = ?', args: [target, id] },
        { sql: 'DELETE FROM rsvp WHERE participant_id = ? AND hang_id = ?', args: [target, id] },
        { sql: 'DELETE FROM reactions WHERE participant_id = ? AND hang_id = ?', args: [target, id] },
        { sql: 'DELETE FROM bring_list_claims WHERE participant_id = ?', args: [target] },
        { sql: 'DELETE FROM confirm_votes WHERE participant_id = ? AND hang_id = ?', args: [target, id] },
        { sql: 'DELETE FROM participants WHERE id = ? AND hang_id = ?', args: [target, id] },
      ],
      'write',
    )

    return NextResponse.json({ success: true })
  } catch (e) {
    return serverError(e, 'DELETE /participants')
  }
}
