import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { participantId } = await req.json()
    if (!participantId) return NextResponse.json({ error: 'Missing participantId' }, { status: 400 })

    const db = getDb()
    await ensureSchema()

    // Don't allow removing the creator
    const hang = await db.execute({ sql: 'SELECT creator_name FROM hangs WHERE id = ?', args: [id] })
    const participant = await db.execute({ sql: 'SELECT name FROM participants WHERE id = ? AND hang_id = ?', args: [participantId, id] })
    if (participant.rows[0] && hang.rows[0] && participant.rows[0].name === hang.rows[0].creator_name) {
      return NextResponse.json({ error: "Can't remove the creator" }, { status: 400 })
    }

    // Remove all related data
    await db.execute({ sql: 'DELETE FROM availability WHERE participant_id = ? AND hang_id = ?', args: [participantId, id] })
    await db.execute({ sql: 'DELETE FROM activity_votes WHERE participant_id = ?', args: [participantId] })
    await db.execute({ sql: 'DELETE FROM comments WHERE participant_id = ? AND hang_id = ?', args: [participantId, id] })
    await db.execute({ sql: 'DELETE FROM transport WHERE participant_id = ? AND hang_id = ?', args: [participantId, id] })
    await db.execute({ sql: 'DELETE FROM rsvp WHERE participant_id = ? AND hang_id = ?', args: [participantId, id] })
    await db.execute({ sql: 'DELETE FROM reactions WHERE participant_id = ? AND hang_id = ?', args: [participantId, id] })
    await db.execute({ sql: 'DELETE FROM bring_list_claims WHERE participant_id = ?', args: [participantId] })
    await db.execute({ sql: 'DELETE FROM participants WHERE id = ? AND hang_id = ?', args: [participantId, id] })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
