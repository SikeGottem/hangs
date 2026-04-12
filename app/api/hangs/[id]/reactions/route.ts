import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    await ensureSchema()
    const res = await db.execute({ sql: 'SELECT r.emoji, p.name FROM reactions r JOIN participants p ON p.id = r.participant_id WHERE r.hang_id = ?', args: [id] })
    return NextResponse.json(res.rows)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { participantId, emoji } = await req.json()
    if (!participantId || !emoji) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    const db = getDb()
    await ensureSchema()
    await db.execute({
      sql: `INSERT INTO reactions (hang_id, participant_id, emoji) VALUES (?, ?, ?) ON CONFLICT(hang_id, participant_id) DO UPDATE SET emoji = excluded.emoji`,
      args: [id, participantId, emoji],
    })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
