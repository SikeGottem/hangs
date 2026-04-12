import { NextResponse } from 'next/server'
import { getDb, ensureSchema, genId } from '@/lib/db'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { name, creatorName, dateRangeStart, dateRangeEnd, activities, template, location, duration } = body

    if (!name || !creatorName || !dateRangeStart || !dateRangeEnd) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const db = getDb()
    await ensureSchema()
    const hangId = genId()
    const creatorId = genId()

    await db.execute({
      sql: 'INSERT INTO hangs (id, name, creator_name, date_range_start, date_range_end, template, location, duration) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [hangId, name, creatorName, dateRangeStart, dateRangeEnd, template || null, location || null, duration || 2],
    })

    await db.execute({
      sql: 'INSERT INTO participants (id, hang_id, name) VALUES (?, ?, ?)',
      args: [creatorId, hangId, creatorName],
    })

    if (activities && Array.isArray(activities)) {
      for (const act of activities) {
        const actName = typeof act === 'string' ? act : act.name
        const costEst = typeof act === 'string' ? null : (act.costEstimate || null)
        await db.execute({
          sql: 'INSERT INTO activities (hang_id, name, added_by, cost_estimate) VALUES (?, ?, ?, ?)',
          args: [hangId, actName, creatorId, costEst],
        })
      }
    }

    return NextResponse.json({ id: hangId, shareUrl: `/h/${hangId}`, creatorId })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
