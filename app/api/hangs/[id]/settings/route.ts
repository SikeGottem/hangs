// POST /api/hangs/[id]/settings — creator-only admin actions: lock, unlock, cancel, uncancel.
// Mutation routes check locked_at / cancelled_at before accepting writes.
import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'
import { requireCreator } from '@/lib/auth'
import { SettingsSchema, parseBody } from '@/lib/schemas'
import { serverError, badRequest, unauthorized, notFound } from '@/lib/errors'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const raw = await req.json()

    const db = getDb()
    await ensureSchema()

    // Verify creator
    const hangRes = await db.execute({
      sql: 'SELECT creator_id FROM hangs WHERE id = ?',
      args: [id],
    })
    if (!hangRes.rows[0]) return notFound('Hang not found')
    const creatorId = hangRes.rows[0].creator_id as string | null

    const creator = await requireCreator(req, id, raw)
    if (!creator || creator.sub !== creatorId) return unauthorized('Creator only')

    const parsed = parseBody(raw, SettingsSchema)
    if ('error' in parsed) return badRequest(parsed.error)
    const body = parsed.data

    switch (body.action) {
      case 'lock':
        await db.execute({
          sql: `UPDATE hangs SET locked_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
          args: [id],
        })
        break
      case 'unlock':
        await db.execute({
          sql: `UPDATE hangs SET locked_at = NULL, updated_at = datetime('now') WHERE id = ?`,
          args: [id],
        })
        break
      case 'cancel':
        await db.execute({
          sql: `UPDATE hangs SET cancelled_at = datetime('now'), status = 'cancelled', updated_at = datetime('now') WHERE id = ?`,
          args: [id],
        })
        break
      case 'uncancel':
        await db.execute({
          sql: `UPDATE hangs SET cancelled_at = NULL, status = 'planning', updated_at = datetime('now') WHERE id = ?`,
          args: [id],
        })
        break
    }

    return NextResponse.json({ success: true, action: body.action })
  } catch (e) {
    return serverError(e, 'POST /settings')
  }
}
