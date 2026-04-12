import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    await ensureSchema()
    const res = await db.execute({
      sql: 'SELECT ph.id, ph.data, ph.caption, ph.created_at, p.name as author FROM photos ph JOIN participants p ON p.id = ph.participant_id WHERE ph.hang_id = ? ORDER BY ph.created_at DESC',
      args: [id],
    })
    return NextResponse.json(res.rows)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { participantId, data, caption } = await req.json()
    if (!participantId || !data) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    if (data.length > 5_000_000) return NextResponse.json({ error: 'Photo too large' }, { status: 400 })
    const db = getDb()
    await ensureSchema()
    await db.execute({ sql: 'INSERT INTO photos (hang_id, participant_id, data, caption) VALUES (?, ?, ?, ?)', args: [id, participantId, data, caption || null] })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
