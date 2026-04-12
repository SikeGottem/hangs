import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const db = getDb()
    await ensureSchema()

    // Unconfirm
    if (body.action === 'unconfirm') {
      await db.execute({
        sql: `UPDATE hangs SET status = 'planning', confirmed_date = NULL, confirmed_hour = NULL,
              confirmed_activity = NULL, confirmed_notes = NULL, updated_at = datetime('now') WHERE id = ?`,
        args: [id],
      })
      return NextResponse.json({ success: true, status: 'planning' })
    }

    // Confirm
    const { date, hour, activityName, notes } = body
    await db.execute({
      sql: `UPDATE hangs SET status = 'confirmed', confirmed_date = ?, confirmed_hour = ?,
            confirmed_activity = ?, confirmed_notes = ?, updated_at = datetime('now') WHERE id = ?`,
      args: [date, hour, activityName, notes || '', id],
    })

    return NextResponse.json({ success: true, status: 'confirmed' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
