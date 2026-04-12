import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    await ensureSchema()
    const res = await db.execute({ sql: 'SELECT r.status, p.name FROM rsvp r JOIN participants p ON p.id = r.participant_id WHERE r.hang_id = ?', args: [id] })
    return NextResponse.json(res.rows)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { participantId, status } = await req.json()
    if (!participantId || !status) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    const db = getDb()
    await ensureSchema()
    await db.execute({
      sql: `INSERT INTO rsvp (hang_id, participant_id, status) VALUES (?, ?, ?) ON CONFLICT(hang_id, participant_id) DO UPDATE SET status = excluded.status`,
      args: [id, participantId, status],
    })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
