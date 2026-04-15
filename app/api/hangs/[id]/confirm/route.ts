// /api/hangs/[id]/confirm — GET (public summary), POST (token-authenticated).
// Unconfirm is creator-only; cast-vote is guest-or-creator.
import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'
import { requireAuth, requireCreator } from '@/lib/auth'
import { ConfirmSchema, parseBody } from '@/lib/schemas'
import { serverError, badRequest, unauthorized } from '@/lib/errors'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    await ensureSchema()

    const [votesRes, totalRes] = await db.batch(
      [
        {
          sql: `SELECT cv.vote, p.name FROM confirm_votes cv
                JOIN participants p ON p.id = cv.participant_id
                WHERE cv.hang_id = ?`,
          args: [id],
        },
        { sql: 'SELECT COUNT(*) as cnt FROM participants WHERE hang_id = ?', args: [id] },
      ],
      'read',
    )
    const total = (totalRes.rows[0].cnt as number) || 0
    const yesCount = votesRes.rows.filter(v => v.vote === 'yes').length
    const threshold = Math.ceil(total / 2)

    return NextResponse.json({
      votes: votesRes.rows,
      yesCount,
      totalParticipants: total,
      threshold,
      met: yesCount >= threshold,
    })
  } catch (e) {
    return serverError(e, 'GET /confirm')
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const raw = await req.json()

    // Parse first so discriminated union tells us which branch
    const parsed = parseBody(raw, ConfirmSchema)
    if ('error' in parsed) return badRequest(parsed.error)
    const body = parsed.data

    const db = getDb()
    await ensureSchema()

    if ('action' in body && body.action === 'unconfirm') {
      // Creator-only: reset everything
      const creator = await requireCreator(req, id, raw as { token?: string })
      if (!creator) return unauthorized('Only the creator can unconfirm')
      await db.batch(
        [
          { sql: 'DELETE FROM confirm_votes WHERE hang_id = ?', args: [id] },
          {
            sql: `UPDATE hangs SET status = 'planning', confirmed_date = NULL, confirmed_hour = NULL,
                  confirmed_activity = NULL, confirmed_notes = NULL, updated_at = datetime('now') WHERE id = ?`,
            args: [id],
          },
        ],
        'write',
      )
      return NextResponse.json({ success: true, status: 'planning' })
    }

    if ('action' in body && body.action === 'force') {
      // Creator override: confirm without waiting for the vote threshold.
      const creator = await requireCreator(req, id, raw as { token?: string })
      if (!creator) return unauthorized('Only the creator can force-confirm')
      await db.execute({
        sql: `UPDATE hangs SET status = 'confirmed', confirmed_date = ?, confirmed_hour = ?,
              confirmed_activity = ?, updated_at = datetime('now') WHERE id = ?`,
        args: [body.date, body.hour, body.activityName || '', id],
      })
      return NextResponse.json({ success: true, status: 'confirmed', forced: true })
    }

    // Cast vote (any authenticated participant)
    const auth = await requireAuth(req, id, raw as any)
    if (!auth) return unauthorized()
    const vote = (body as any).vote || 'yes'
    const date = (body as any).date
    const hour = (body as any).hour
    const activityName = (body as any).activityName

    await db.execute({
      sql: `INSERT INTO confirm_votes (hang_id, participant_id, vote) VALUES (?, ?, ?)
            ON CONFLICT(hang_id, participant_id) DO UPDATE SET vote = excluded.vote`,
      args: [id, auth.sub, vote],
    })

    // Threshold check and auto-confirm
    const [totalRes, yesRes] = await db.batch(
      [
        { sql: 'SELECT COUNT(*) as cnt FROM participants WHERE hang_id = ?', args: [id] },
        { sql: "SELECT COUNT(*) as cnt FROM confirm_votes WHERE hang_id = ? AND vote = 'yes'", args: [id] },
      ],
      'read',
    )
    const total = (totalRes.rows[0].cnt as number) || 0
    const yesCount = (yesRes.rows[0].cnt as number) || 0
    const threshold = Math.ceil(total / 2)

    if (yesCount >= threshold && date && hour != null) {
      await db.execute({
        sql: `UPDATE hangs SET status = 'confirmed', confirmed_date = ?, confirmed_hour = ?,
              confirmed_activity = ?, updated_at = datetime('now') WHERE id = ?`,
        args: [date, hour, activityName || '', id],
      })
      return NextResponse.json({ success: true, status: 'confirmed', yesCount, threshold })
    }

    return NextResponse.json({ success: true, status: 'voting', yesCount, threshold, totalParticipants: total })
  } catch (e) {
    return serverError(e, 'POST /confirm')
  }
}
