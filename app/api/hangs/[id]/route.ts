// GET /api/hangs/[id] — single batched read, one network round-trip.
// PATCH /api/hangs/[id] — creator-only field edits (name, description, theme, etc.)
// DELETE /api/hangs/[id] — creator-only cascade delete.
import { NextResponse } from 'next/server'
import { getDb, ensureSchema, synthesiseFromData } from '@/lib/db'
import { requireCreator } from '@/lib/auth'
import { EditHangSchema, parseBody } from '@/lib/schemas'
import { serverError, badRequest, unauthorized, notFound } from '@/lib/errors'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    await ensureSchema()

    const [hangRes, partRes, actRes, availRes, commitRes] = await db.batch([
      { sql: 'SELECT * FROM hangs WHERE id = ?', args: [id] },
      { sql: 'SELECT * FROM participants WHERE hang_id = ? ORDER BY created_at', args: [id] },
      {
        sql: `SELECT a.*,
          SUM(CASE WHEN av.vote = 'up' THEN 1 ELSE 0 END) as ups,
          SUM(CASE WHEN av.vote = 'meh' THEN 1 ELSE 0 END) as mehs,
          SUM(CASE WHEN av.vote = 'down' THEN 1 ELSE 0 END) as downs
        FROM activities a LEFT JOIN activity_votes av ON av.activity_id = a.id
        WHERE a.hang_id = ? GROUP BY a.id`,
        args: [id],
      },
      { sql: 'SELECT participant_id, date, hour, status FROM availability WHERE hang_id = ?', args: [id] },
      { sql: 'SELECT participant_id, level FROM commitment WHERE hang_id = ?', args: [id] },
    ], 'read')

    const hang = hangRes.rows[0]
    if (!hang) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const respondedIds = new Set(availRes.rows.map(r => r.participant_id as string))
    // Per-participant commitment lookup for the social-proof list on step 0
    // of the respond flow. Same shape as /state endpoint for consistency.
    const commitmentByParticipant: Record<string, 'in' | 'probably' | 'cant'> = {}
    for (const r of commitRes.rows) {
      commitmentByParticipant[r.participant_id as string] = r.level as 'in' | 'probably' | 'cant'
    }
    const participants = partRes.rows.map(p => ({
      ...p,
      hasResponded: respondedIds.has(p.id as string),
      commitmentLevel: commitmentByParticipant[p.id as string] || null,
    }))

    const activities = actRes.rows
    const availability = availRes.rows

    const synthesis = synthesiseFromData(
      partRes.rows.map(r => ({ id: r.id as string, name: r.name as string })),
      availability.map(r => ({
        participant_id: r.participant_id as string,
        date: r.date as string,
        hour: r.hour as number,
        status: r.status as string,
      })),
      activities.map(r => ({
        id: r.id as number,
        name: r.name as string,
        ups: (r.ups as number) || 0,
        downs: (r.downs as number) || 0,
      })),
    )

    return NextResponse.json({ hang, participants, activities, availability, synthesis })
  } catch (e) {
    return serverError(e, 'GET /api/hangs/[id]')
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const raw = await req.json()

    const db = getDb()
    await ensureSchema()

    // Look up the hang + verify caller is the creator
    const hangRes = await db.execute({
      sql: 'SELECT creator_id FROM hangs WHERE id = ?',
      args: [id],
    })
    if (!hangRes.rows[0]) return notFound('Hang not found')
    const creatorId = hangRes.rows[0].creator_id as string | null

    const creator = await requireCreator(req, id, raw)
    if (!creator || creator.sub !== creatorId) return unauthorized('Creator only')

    const parsed = parseBody(raw, EditHangSchema)
    if ('error' in parsed) return badRequest(parsed.error)
    const body = parsed.data

    // Build dynamic UPDATE statement with only the provided fields
    const updates: string[] = []
    const args: (string | number | null)[] = []
    const pushField = (col: string, val: unknown) => {
      updates.push(`${col} = ?`)
      args.push(val == null || val === '' ? null : (val as string | number))
    }

    if (body.name !== undefined) pushField('name', body.name)
    if (body.description !== undefined) pushField('description', body.description)
    if (body.theme !== undefined) pushField('theme', body.theme)
    if (body.dressCode !== undefined) pushField('dress_code', body.dressCode)
    if (body.location !== undefined) pushField('location', body.location)
    if (body.customQuestion !== undefined) pushField('custom_question', body.customQuestion)
    if (body.askDietary !== undefined) {
      updates.push('ask_dietary = ?')
      args.push(body.askDietary ? 1 : 0)
    }
    if (body.responseDeadline !== undefined) pushField('response_deadline', body.responseDeadline)

    if (updates.length === 0) return badRequest('No fields to update')

    updates.push(`updated_at = datetime('now')`)
    args.push(id)

    await db.execute({
      sql: `UPDATE hangs SET ${updates.join(', ')} WHERE id = ?`,
      args,
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    return serverError(e, 'PATCH /api/hangs/[id]')
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    await ensureSchema()

    // Verify caller has a creator token for this hang AND matches the stored creator_id.
    const hangRes = await db.execute({
      sql: 'SELECT creator_id FROM hangs WHERE id = ?',
      args: [id],
    })
    if (!hangRes.rows[0]) return notFound('Hang not found')
    const creatorId = hangRes.rows[0].creator_id as string | null

    const creator = await requireCreator(req, id)
    if (!creator || creator.sub !== creatorId) return unauthorized('Creator only')

    // Cascade delete all child tables in one batched write.
    await db.batch(
      [
        // bring-list is a tree — drop claims first, then items
        { sql: 'DELETE FROM bring_list_claims WHERE item_id IN (SELECT id FROM bring_list WHERE hang_id = ?)', args: [id] },
        { sql: 'DELETE FROM bring_list WHERE hang_id = ?', args: [id] },
        // poll options + votes
        { sql: 'DELETE FROM poll_votes WHERE poll_option_id IN (SELECT id FROM poll_options WHERE poll_id IN (SELECT id FROM polls WHERE hang_id = ?))', args: [id] },
        { sql: 'DELETE FROM poll_options WHERE poll_id IN (SELECT id FROM polls WHERE hang_id = ?)', args: [id] },
        { sql: 'DELETE FROM polls WHERE hang_id = ?', args: [id] },
        // activity votes + activities
        { sql: 'DELETE FROM activity_votes WHERE activity_id IN (SELECT id FROM activities WHERE hang_id = ?)', args: [id] },
        { sql: 'DELETE FROM activities WHERE hang_id = ?', args: [id] },
        // per-participant rows
        { sql: 'DELETE FROM availability WHERE hang_id = ?', args: [id] },
        { sql: 'DELETE FROM comments WHERE hang_id = ?', args: [id] },
        { sql: 'DELETE FROM transport WHERE hang_id = ?', args: [id] },
        { sql: 'DELETE FROM rsvp WHERE hang_id = ?', args: [id] },
        { sql: 'DELETE FROM reactions WHERE hang_id = ?', args: [id] },
        { sql: 'DELETE FROM photos WHERE hang_id = ?', args: [id] },
        { sql: 'DELETE FROM expenses WHERE hang_id = ?', args: [id] },
        { sql: 'DELETE FROM confirm_votes WHERE hang_id = ?', args: [id] },
        { sql: 'DELETE FROM commitment WHERE hang_id = ?', args: [id] },
        { sql: 'DELETE FROM participants WHERE hang_id = ?', args: [id] },
        // finally the hang itself
        { sql: 'DELETE FROM hangs WHERE id = ?', args: [id] },
      ],
      'write',
    )

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (e) {
    return serverError(e, 'DELETE /api/hangs/[id]')
  }
}
