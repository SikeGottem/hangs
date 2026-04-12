import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    await ensureSchema()

    const pollsRes = await db.execute({ sql: 'SELECT * FROM polls WHERE hang_id = ? ORDER BY created_at DESC', args: [id] })

    const result = []
    for (const poll of pollsRes.rows) {
      const optRes = await db.execute({
        sql: `SELECT po.id, po.text, (SELECT COUNT(*) FROM poll_votes pv WHERE pv.poll_option_id = po.id) as votes FROM poll_options po WHERE po.poll_id = ?`,
        args: [poll.id],
      })
      const voterRes = await db.execute({
        sql: `SELECT pv.poll_option_id, p.name FROM poll_votes pv JOIN participants p ON p.id = pv.participant_id JOIN poll_options po ON po.id = pv.poll_option_id WHERE po.poll_id = ?`,
        args: [poll.id],
      })
      result.push({ ...poll, options: optRes.rows, voters: voterRes.rows })
    }

    return NextResponse.json(result)
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

    if (body.action === 'create' && body.question && body.options?.length >= 2) {
      const res = await db.execute({
        sql: 'INSERT INTO polls (hang_id, question, created_by) VALUES (?, ?, ?)',
        args: [id, body.question, body.participantId || null],
      })
      const pollId = Number(res.lastInsertRowid)
      for (const opt of body.options) {
        await db.execute({ sql: 'INSERT INTO poll_options (poll_id, text) VALUES (?, ?)', args: [pollId, opt] })
      }
    }

    if (body.action === 'vote' && body.optionId && body.participantId) {
      const optRes = await db.execute({ sql: 'SELECT poll_id FROM poll_options WHERE id = ?', args: [body.optionId] })
      if (optRes.rows[0]) {
        await db.execute({
          sql: 'DELETE FROM poll_votes WHERE participant_id = ? AND poll_option_id IN (SELECT id FROM poll_options WHERE poll_id = ?)',
          args: [body.participantId, optRes.rows[0].poll_id],
        })
      }
      await db.execute({ sql: 'INSERT INTO poll_votes (poll_option_id, participant_id) VALUES (?, ?)', args: [body.optionId, body.participantId] })
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
