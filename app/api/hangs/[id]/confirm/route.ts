import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { date, hour, activityName, notes } = await req.json()
    const db = getDb()
    await ensureSchema()

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
