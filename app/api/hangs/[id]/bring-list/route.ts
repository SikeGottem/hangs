import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    await ensureSchema()
    const res = await db.execute({
      sql: 'SELECT bl.id, bl.item, bl.claimed_by, p.name as claimed_by_name FROM bring_list bl LEFT JOIN participants p ON p.id = bl.claimed_by WHERE bl.hang_id = ? ORDER BY bl.created_at ASC',
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
    const body = await req.json()
    const db = getDb()
    await ensureSchema()

    if (body.action === 'add' && body.item) {
      await db.execute({ sql: 'INSERT INTO bring_list (hang_id, item) VALUES (?, ?)', args: [id, body.item.trim()] })
    }
    if (body.action === 'claim' && body.itemId && body.participantId) {
      await db.execute({ sql: 'UPDATE bring_list SET claimed_by = ? WHERE id = ? AND hang_id = ?', args: [body.participantId, body.itemId, id] })
    }
    if (body.action === 'unclaim' && body.itemId) {
      await db.execute({ sql: 'UPDATE bring_list SET claimed_by = NULL WHERE id = ? AND hang_id = ?', args: [body.itemId, id] })
    }
    if (body.action === 'remove' && body.itemId) {
      await db.execute({ sql: 'DELETE FROM bring_list WHERE id = ? AND hang_id = ?', args: [body.itemId, id] })
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
