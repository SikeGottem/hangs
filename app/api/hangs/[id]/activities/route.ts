// POST /api/hangs/[id]/activities — creator adds a new activity mid-flight.
// DELETE /api/hangs/[id]/activities — creator removes an activity (cascades its votes).
import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'
import { requireCreator } from '@/lib/auth'
import { AddActivitySchema, parseBody } from '@/lib/schemas'
import { serverError, badRequest, unauthorized, notFound } from '@/lib/errors'

async function requireCreatorOfHang(req: Request, id: string, raw?: unknown) {
  const db = getDb()
  const hangRes = await db.execute({
    sql: 'SELECT creator_id FROM hangs WHERE id = ?',
    args: [id],
  })
  if (!hangRes.rows[0]) return { kind: 'not-found' as const }
  const creatorId = hangRes.rows[0].creator_id as string | null
  const creator = await requireCreator(req, id, raw as { token?: string } | undefined)
  if (!creator || creator.sub !== creatorId) return { kind: 'unauthorized' as const }
  return { kind: 'ok' as const, creatorId: creator.sub }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const raw = await req.json()

    await ensureSchema()
    const check = await requireCreatorOfHang(req, id, raw)
    if (check.kind === 'not-found') return notFound('Hang not found')
    if (check.kind === 'unauthorized') return unauthorized('Creator only')

    const parsed = parseBody(raw, AddActivitySchema)
    if ('error' in parsed) return badRequest(parsed.error)

    const db = getDb()
    await db.execute({
      sql: 'INSERT INTO activities (hang_id, name, added_by, cost_estimate) VALUES (?, ?, ?, ?)',
      args: [id, parsed.data.name, check.creatorId, parsed.data.costEstimate || null],
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    return serverError(e, 'POST /activities')
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const raw = await req.json().catch(() => ({}))
    const activityId = Number((raw as { activityId?: unknown }).activityId)
    if (!activityId || !Number.isFinite(activityId)) {
      return badRequest('activityId required')
    }

    await ensureSchema()
    const check = await requireCreatorOfHang(req, id, raw)
    if (check.kind === 'not-found') return notFound('Hang not found')
    if (check.kind === 'unauthorized') return unauthorized('Creator only')

    const db = getDb()
    // Verify activity belongs to this hang, then cascade delete
    const actRes = await db.execute({
      sql: 'SELECT id FROM activities WHERE id = ? AND hang_id = ?',
      args: [activityId, id],
    })
    if (!actRes.rows[0]) return notFound('Activity not found')

    await db.batch(
      [
        { sql: 'DELETE FROM activity_votes WHERE activity_id = ?', args: [activityId] },
        { sql: 'DELETE FROM activities WHERE id = ? AND hang_id = ?', args: [activityId, id] },
      ],
      'write',
    )

    return NextResponse.json({ success: true })
  } catch (e) {
    return serverError(e, 'DELETE /activities')
  }
}
