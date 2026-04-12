import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await params
    const { participantId, activityId, vote } = await req.json()
    const db = getDb()
    await ensureSchema()

    await db.execute({
      sql: `INSERT INTO activity_votes (activity_id, participant_id, vote) VALUES (?, ?, ?)
            ON CONFLICT(activity_id, participant_id) DO UPDATE SET vote = excluded.vote`,
      args: [activityId, participantId, vote],
    })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
