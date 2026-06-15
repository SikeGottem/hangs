// GET /api/me/hangs — every hang the logged-in user created or joined, so the
// returning creator finds their hangs on ANY device (not just the browser that
// holds the localStorage history). Returns { hangs: [] } for guests (200, not 401).
import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { serverError } from '@/lib/errors'

export async function GET(req: Request) {
  try {
    const claims = await requireUser(req)
    if (!claims) return NextResponse.json({ hangs: [] })

    const db = getDb()
    await ensureSchema()

    const res = await db.execute({
      sql: `SELECT h.id, h.name, h.status, h.date_range_start, h.date_range_end,
                   h.confirmed_date, h.confirmed_hour, h.confirmed_activity, h.created_at,
                   p.id AS participant_id, h.creator_id,
                   (SELECT COUNT(*) FROM participants pp WHERE pp.hang_id = h.id) AS participant_count
            FROM participants p
            JOIN hangs h ON h.id = p.hang_id
            WHERE p.user_id = ?
            ORDER BY h.created_at DESC`,
      args: [claims.sub],
    })

    const hangs = res.rows.map(r => ({
      id: r.id,
      name: r.name,
      status: r.status,
      dateRangeStart: r.date_range_start,
      dateRangeEnd: r.date_range_end,
      createdAt: r.created_at,
      confirmedDate: r.confirmed_date,
      confirmedHour: r.confirmed_hour,
      confirmedActivity: r.confirmed_activity,
      participantId: r.participant_id,
      isCreator: r.creator_id === r.participant_id,
      participantCount: r.participant_count,
    }))

    return NextResponse.json({ hangs })
  } catch (e) {
    return serverError(e, 'GET /api/me/hangs')
  }
}
