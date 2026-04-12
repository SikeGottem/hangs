import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    await ensureSchema()

    const votesRes = await db.execute({
      sql: `SELECT cv.vote, p.name FROM confirm_votes cv
            JOIN participants p ON p.id = cv.participant_id
            WHERE cv.hang_id = ?`,
      args: [id],
    })
    const totalRes = await db.execute({ sql: 'SELECT COUNT(*) as cnt FROM participants WHERE hang_id = ?', args: [id] })
    const total = (totalRes.rows[0].cnt as number) || 0
    const yesCount = votesRes.rows.filter(v => v.vote === 'yes').length
    const threshold = Math.ceil(total / 2) // majority

    return NextResponse.json({
      votes: votesRes.rows,
      yesCount,
      totalParticipants: total,
      threshold,
      met: yesCount >= threshold,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const db = getDb()
    await ensureSchema()

    // Unconfirm — reset everything
    if (body.action === 'unconfirm') {
      await db.execute({ sql: 'DELETE FROM confirm_votes WHERE hang_id = ?', args: [id] })
      await db.execute({
        sql: `UPDATE hangs SET status = 'planning', confirmed_date = NULL, confirmed_hour = NULL,
              confirmed_activity = NULL, confirmed_notes = NULL, updated_at = datetime('now') WHERE id = ?`,
        args: [id],
      })
      return NextResponse.json({ success: true, status: 'planning' })
    }

    // Cast vote
    const { participantId, vote, date, hour, activityName } = body
    if (!participantId) return NextResponse.json({ error: 'Missing participantId' }, { status: 400 })

    await db.execute({
      sql: `INSERT INTO confirm_votes (hang_id, participant_id, vote) VALUES (?, ?, ?)
            ON CONFLICT(hang_id, participant_id) DO UPDATE SET vote = excluded.vote`,
      args: [id, participantId, vote || 'yes'],
    })

    // Check if threshold met
    const totalRes = await db.execute({ sql: 'SELECT COUNT(*) as cnt FROM participants WHERE hang_id = ?', args: [id] })
    const total = (totalRes.rows[0].cnt as number) || 0
    const yesRes = await db.execute({ sql: "SELECT COUNT(*) as cnt FROM confirm_votes WHERE hang_id = ? AND vote = 'yes'", args: [id] })
    const yesCount = (yesRes.rows[0].cnt as number) || 0
    const threshold = Math.ceil(total / 2)

    if (yesCount >= threshold && date && hour) {
      // Auto-confirm the plan
      await db.execute({
        sql: `UPDATE hangs SET status = 'confirmed', confirmed_date = ?, confirmed_hour = ?,
              confirmed_activity = ?, updated_at = datetime('now') WHERE id = ?`,
        args: [date, hour, activityName || '', id],
      })
      return NextResponse.json({ success: true, status: 'confirmed', yesCount, threshold })
    }

    return NextResponse.json({ success: true, status: 'voting', yesCount, threshold, totalParticipants: total })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
