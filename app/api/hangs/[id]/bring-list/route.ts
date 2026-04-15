// /api/hangs/[id]/bring-list — GET (public), POST (token-authenticated) with action
import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { BringListSchema, parseBody } from '@/lib/schemas'
import { serverError, badRequest, unauthorized } from '@/lib/errors'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    await ensureSchema()

    const [itemsRes, claimsRes] = await db.batch(
      [
        { sql: 'SELECT id, parent_id, item, created_at FROM bring_list WHERE hang_id = ? ORDER BY created_at ASC', args: [id] },
        {
          sql: `SELECT blc.item_id, blc.note, p.name, p.id as participant_id
                FROM bring_list_claims blc
                JOIN participants p ON p.id = blc.participant_id
                JOIN bring_list bl ON bl.id = blc.item_id
                WHERE bl.hang_id = ?`,
          args: [id],
        },
      ],
      'read',
    )

    const claimsByItem: Record<number, any[]> = {}
    for (const c of claimsRes.rows) {
      const itemId = c.item_id as number
      if (!claimsByItem[itemId]) claimsByItem[itemId] = []
      claimsByItem[itemId].push({ name: c.name, participantId: c.participant_id, note: c.note })
    }
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
  } catch (e) {
    return serverError(e, 'GET /bring-list')
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const raw = await req.json()
    const auth = await requireAuth(req, id, raw)
    if (!auth) return unauthorized()

    const parsed = parseBody(raw, BringListSchema)
    if ('error' in parsed) return badRequest(parsed.error)
    const body = parsed.data

    const db = getDb()
    await ensureSchema()

    if (body.action === 'add') {
      await db.execute({
        sql: 'INSERT INTO bring_list (hang_id, parent_id, item) VALUES (?, ?, ?)',
        args: [id, body.parentId ?? null, body.item],
      })
    } else if (body.action === 'claim') {
      await db.execute({
        sql: `INSERT INTO bring_list_claims (item_id, participant_id, note) VALUES (?, ?, ?)
              ON CONFLICT(item_id, participant_id) DO UPDATE SET note = excluded.note`,
        args: [body.itemId, auth.sub, body.note || null],
      })
    } else if (body.action === 'unclaim') {
      await db.execute({
        sql: 'DELETE FROM bring_list_claims WHERE item_id = ? AND participant_id = ?',
        args: [body.itemId, auth.sub],
      })
    } else if (body.action === 'remove') {
      // Cascade: remove claims on sub-items, sub-items, claims on item, item.
      await db.batch(
        [
          {
            sql: 'DELETE FROM bring_list_claims WHERE item_id IN (SELECT id FROM bring_list WHERE parent_id = ? AND hang_id = ?)',
            args: [body.itemId, id],
          },
          { sql: 'DELETE FROM bring_list_claims WHERE item_id = ?', args: [body.itemId] },
          { sql: 'DELETE FROM bring_list WHERE parent_id = ? AND hang_id = ?', args: [body.itemId, id] },
          { sql: 'DELETE FROM bring_list WHERE id = ? AND hang_id = ?', args: [body.itemId, id] },
        ],
        'write',
      )
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return serverError(e, 'POST /bring-list')
  }
}
