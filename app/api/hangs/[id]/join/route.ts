import { NextResponse } from 'next/server'
import { getDb, ensureSchema, genId } from '@/lib/db'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { name } = await req.json()
    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })

    const db = getDb()
    await ensureSchema()

    const hangRes = await db.execute({ sql: 'SELECT id FROM hangs WHERE id = ?', args: [id] })
    if (!hangRes.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const participantId = genId()
    await db.execute({ sql: 'INSERT INTO participants (id, hang_id, name) VALUES (?, ?, ?)', args: [participantId, id, name] })

    return NextResponse.json({ participantId })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
