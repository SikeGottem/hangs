import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    await ensureSchema()
    const res = await db.execute({
      sql: `SELECT c.id, c.text, c.created_at, p.name as author FROM comments c
            JOIN participants p ON p.id = c.participant_id WHERE c.hang_id = ? ORDER BY c.created_at ASC`,
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
    const { participantId, text } = await req.json()
    if (!participantId || !text?.trim()) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    const db = getDb()
    await ensureSchema()
    await db.execute({ sql: 'INSERT INTO comments (hang_id, participant_id, text) VALUES (?, ?, ?)', args: [id, participantId, text.trim()] })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
