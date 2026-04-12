import { NextResponse } from 'next/server'
import { getDb, ensureSchema, synthesise } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    await ensureSchema()

    const hangRes = await db.execute({ sql: 'SELECT * FROM hangs WHERE id = ?', args: [id] })
    const hang = hangRes.rows[0]
    if (!hang) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const participantsRes = await db.execute({ sql: 'SELECT * FROM participants WHERE hang_id = ?', args: [id] })
    const respondedRes = await db.execute({ sql: 'SELECT DISTINCT participant_id FROM availability WHERE hang_id = ?', args: [id] })
    const respondedIds = new Set(respondedRes.rows.map(r => r.participant_id as string))

    const participants = participantsRes.rows.map(p => ({
      ...p, hasResponded: respondedIds.has(p.id as string),
    }))

    const activitiesRes = await db.execute({
      sql: `SELECT a.*,
        SUM(CASE WHEN av.vote = 'up' THEN 1 ELSE 0 END) as ups,
        SUM(CASE WHEN av.vote = 'meh' THEN 1 ELSE 0 END) as mehs,
        SUM(CASE WHEN av.vote = 'down' THEN 1 ELSE 0 END) as downs
      FROM activities a LEFT JOIN activity_votes av ON av.activity_id = a.id
      WHERE a.hang_id = ? GROUP BY a.id`,
      args: [id],
    })

    const availRes = await db.execute({ sql: 'SELECT participant_id, date, hour, status FROM availability WHERE hang_id = ?', args: [id] })
    const synthesis = await synthesise(id)

    return NextResponse.json({
      hang, participants, activities: activitiesRes.rows,
      availability: availRes.rows, synthesis,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
