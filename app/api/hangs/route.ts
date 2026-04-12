import { NextResponse } from 'next/server'
import { getDb, ensureSchema, genId } from '@/lib/db'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { name, creatorName, dateRangeStart, dateRangeEnd, activities, template, location, duration, dateMode, selectedDates } = body

    if (!name || !creatorName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // For 'specific' mode, selectedDates is required. For 'range' mode, start/end required.
    if (dateMode === 'specific' && (!selectedDates || selectedDates.length === 0)) {
      return NextResponse.json({ error: 'Select at least one date' }, { status: 400 })
    }
    if (dateMode !== 'specific' && (!dateRangeStart || !dateRangeEnd)) {
      return NextResponse.json({ error: 'Missing date range' }, { status: 400 })
    }

    const db = getDb()
    await ensureSchema()
    const hangId = genId()
    const creatorId = genId()

    // For specific mode, use first/last selected date as range bounds
    const start = dateMode === 'specific' ? selectedDates[0] : dateRangeStart
    const end = dateMode === 'specific' ? selectedDates[selectedDates.length - 1] : dateRangeEnd

    await db.execute({
      sql: `INSERT INTO hangs (id, name, creator_name, date_range_start, date_range_end, date_mode, selected_dates, template, location, duration)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [hangId, name, creatorName, start, end, dateMode || 'range', selectedDates ? JSON.stringify(selectedDates) : null, template || null, location || null, duration || 2],
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
