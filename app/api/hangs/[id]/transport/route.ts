import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    await ensureSchema()
    const res = await db.execute({ sql: 'SELECT t.mode, t.seats, p.name FROM transport t JOIN participants p ON p.id = t.participant_id WHERE t.hang_id = ?', args: [id] })
    return NextResponse.json(res.rows)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { participantId, mode, seats } = await req.json()
    if (!participantId || !mode) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    const db = getDb()
    await ensureSchema()
    await db.execute({
      sql: `INSERT INTO transport (hang_id, participant_id, mode, seats) VALUES (?, ?, ?, ?)
            ON CONFLICT(hang_id, participant_id) DO UPDATE SET mode = excluded.mode, seats = excluded.seats`,
      args: [id, participantId, mode, seats || 0],
    })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
