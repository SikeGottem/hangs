import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    await ensureSchema()

    // Get all items (top-level and sub-items)
    const itemsRes = await db.execute({
      sql: 'SELECT id, parent_id, item, created_at FROM bring_list WHERE hang_id = ? ORDER BY created_at ASC',
      args: [id],
    })

    // Get all claims
    const claimsRes = await db.execute({
      sql: `SELECT blc.item_id, blc.note, p.name, p.id as participant_id
            FROM bring_list_claims blc
            JOIN participants p ON p.id = blc.participant_id
            JOIN bring_list bl ON bl.id = blc.item_id
            WHERE bl.hang_id = ?`,
      args: [id],
    })

    // Group claims by item_id
    const claimsByItem: Record<number, any[]> = {}
    for (const c of claimsRes.rows) {
      const itemId = c.item_id as number
      if (!claimsByItem[itemId]) claimsByItem[itemId] = []
      claimsByItem[itemId].push({ name: c.name, participantId: c.participant_id, note: c.note })
    }

    // Build tree: top-level items with sub-items nested
    const topLevel = itemsRes.rows.filter(i => !i.parent_id)
    const subItems = itemsRes.rows.filter(i => i.parent_id)

    const result = topLevel.map(item => ({
      id: item.id,
      item: item.item,
      claims: claimsByItem[item.id as number] || [],
      subItems: subItems
        .filter(s => s.parent_id === item.id)
        .map(s => ({
          id: s.id,
          item: s.item,
          claims: claimsByItem[s.id as number] || [],
        })),
    }))

    return NextResponse.json(result)
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

    // Add top-level item
    if (body.action === 'add' && body.item) {
      await db.execute({
        sql: 'INSERT INTO bring_list (hang_id, parent_id, item) VALUES (?, ?, ?)',
        args: [id, body.parentId || null, body.item.trim()],
      })
    }

    // Claim — adds current user as a claimer (multiple people can claim)
    if (body.action === 'claim' && body.itemId && body.participantId) {
      await db.execute({
        sql: `INSERT INTO bring_list_claims (item_id, participant_id, note) VALUES (?, ?, ?)
              ON CONFLICT(item_id, participant_id) DO UPDATE SET note = excluded.note`,
        args: [body.itemId, body.participantId, body.note || null],
      })
    }

    // Unclaim — remove current user's claim
    if (body.action === 'unclaim' && body.itemId && body.participantId) {
      await db.execute({
        sql: 'DELETE FROM bring_list_claims WHERE item_id = ? AND participant_id = ?',
        args: [body.itemId, body.participantId],
      })
    }

    // Remove item (and its sub-items and all claims)
    if (body.action === 'remove' && body.itemId) {
      // Remove claims for sub-items
      await db.execute({
        sql: 'DELETE FROM bring_list_claims WHERE item_id IN (SELECT id FROM bring_list WHERE parent_id = ? AND hang_id = ?)',
        args: [body.itemId, id],
      })
      // Remove claims for the item itself
      await db.execute({
        sql: 'DELETE FROM bring_list_claims WHERE item_id = ?',
        args: [body.itemId],
      })
      // Remove sub-items
      await db.execute({
        sql: 'DELETE FROM bring_list WHERE parent_id = ? AND hang_id = ?',
        args: [body.itemId, id],
      })
      // Remove item
      await db.execute({
        sql: 'DELETE FROM bring_list WHERE id = ? AND hang_id = ?',
        args: [body.itemId, id],
      })
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
