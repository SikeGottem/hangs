// GET /api/hangs/[id] — single batched read, one network round-trip.
// PATCH /api/hangs/[id] — creator-only field edits (name, description, theme, etc.)
// DELETE /api/hangs/[id] — creator-only cascade delete.
import { NextResponse } from 'next/server'
import { getDb, ensureSchema, synthesiseFromData } from '@/lib/db'
import { requireCreator, requireUser } from '@/lib/auth'
import { EditHangSchema, parseBody } from '@/lib/schemas'
import { serverError, badRequest, unauthorized, notFound } from '@/lib/errors'

// Expand a YYYY-MM-DD start..end (inclusive) into a list of dates, capped at 31.
// Parsed + incremented in UTC so the round-trip through toISOString() never
// shifts a day (a local-tz parse here drops every date back one day in AEST).
function expandDateRange(start: string, end: string): string[] {
  const dates: string[] = []
  const d = new Date(start + 'T00:00:00Z')
  const e = new Date(end + 'T00:00:00Z')
  while (d <= e && dates.length < 31) {
    dates.push(d.toISOString().split('T')[0])
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return dates
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

    // Crew branding (for responder hero + share cards). Only fetched when the
    // hang is crew-scoped — guest hangs have no crew context.
    let crew: {
      id: string
      name: string
      slug: string | null
      coverColor: string | null
      coverEmoji: string | null
      publicInviteToken: string | null
    } | null = null
    const crewId = (hang as any).crew_id as string | null
    if (crewId) {
      const crewRes = await db.execute({
        sql: 'SELECT id, name, slug, cover_color, cover_emoji, public_invite_token FROM crews WHERE id = ?',
        args: [crewId],
      })
      const row = crewRes.rows[0]
      if (row) {
        crew = {
          id: row.id as string,
          name: row.name as string,
          slug: (row.slug as string) || null,
          coverColor: (row.cover_color as string) || null,
          coverEmoji: (row.cover_emoji as string) || null,
          publicInviteToken: (row.public_invite_token as string) || null,
        }
      }
    }

    // viewerIsCrewMember — set when the session cookie matches a member of this
    // hang's crew. Used by the results page to hide the guest→crew CTA for
    // people who are already in.
    let viewerIsCrewMember = false
    if (crewId) {
      const viewer = await requireUser(req)
      if (viewer) {
        const memberRes = await db.execute({
          sql: 'SELECT 1 FROM crew_members WHERE crew_id = ? AND user_id = ?',
          args: [crewId, viewer.sub],
        })
        viewerIsCrewMember = !!memberRes.rows[0]
      }
    }

    return NextResponse.json({ hang, participants, activities, availability, synthesis, crew, viewerIsCrewMember })
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

    // ── Date editing ──────────────────────────────────────────────────────
    // Dates can be added/changed after creation. The client sends a full date
    // spec (dateMode + range OR selectedDates), mirroring the create flow.
    // Adding dates is non-destructive (existing availability stays valid, new
    // dates just start empty); only dates that fall OUTSIDE the new set get
    // their availability pruned below.
    let newValidDates: string[] | null = null
    if (body.dateMode !== undefined) {
      if (body.dateMode === 'specific') {
        if (!body.selectedDates || body.selectedDates.length === 0) {
          return badRequest('Select at least one date')
        }
        const sorted = [...body.selectedDates].sort()
        pushField('date_mode', 'specific')
        pushField('date_range_start', sorted[0])
        pushField('date_range_end', sorted[sorted.length - 1])
        updates.push('selected_dates = ?')
        args.push(JSON.stringify(sorted))
        newValidDates = sorted
      } else {
        if (!body.dateRangeStart || !body.dateRangeEnd) {
          return badRequest('Missing date range')
        }
        if (body.dateRangeEnd < body.dateRangeStart) {
          return badRequest('End date is before start date')
        }
        pushField('date_mode', 'range')
        pushField('date_range_start', body.dateRangeStart)
        pushField('date_range_end', body.dateRangeEnd)
        updates.push('selected_dates = ?')
        args.push(null)
        newValidDates = expandDateRange(body.dateRangeStart, body.dateRangeEnd)
      }
    }

    if (updates.length === 0) return badRequest('No fields to update')

    updates.push(`updated_at = datetime('now')`)
    args.push(id)

    // Apply the hang update, then prune availability for any now-orphaned dates.
    const writes: { sql: string; args: (string | number | null)[] }[] = [
      { sql: `UPDATE hangs SET ${updates.join(', ')} WHERE id = ?`, args },
    ]
    if (newValidDates !== null) {
      const placeholders = newValidDates.map(() => '?').join(', ')
      writes.push({
        sql: `DELETE FROM availability WHERE hang_id = ? AND date NOT IN (${placeholders})`,
        args: [id, ...newValidDates],
      })
    }
    await db.batch(writes, 'write')

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
