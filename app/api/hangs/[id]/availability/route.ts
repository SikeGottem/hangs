import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { participantId, slots } = await req.json()
    if (!participantId || !slots) return NextResponse.json({ error: 'Missing data' }, { status: 400 })

    const db = getDb()
    await ensureSchema()

    for (const s of slots) {
      await db.execute({
        sql: `INSERT INTO availability (hang_id, participant_id, date, hour, status) VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(hang_id, participant_id, date, hour) DO UPDATE SET status = excluded.status`,
        args: [id, participantId, s.date, s.hour, s.status],
      })
    }

    return NextResponse.json({ success: true, count: slots.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
