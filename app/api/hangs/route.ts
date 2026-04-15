// POST /api/hangs — create a new hang, return creator token
import { NextResponse } from 'next/server'
import { getDb, ensureSchema, genId } from '@/lib/db'
import { signParticipantToken } from '@/lib/auth'
import { CreateHangSchema, parseBody } from '@/lib/schemas'
import { serverError, badRequest } from '@/lib/errors'

export async function POST(req: Request) {
  try {
    const raw = await req.json()
    const parsed = parseBody(raw, CreateHangSchema)
    if ('error' in parsed) return badRequest(parsed.error)
    const body = parsed.data

    // Date-mode cross-field validation (zod can't express this cleanly)
    if (body.dateMode === 'specific') {
      if (!body.selectedDates || body.selectedDates.length === 0) {
        return badRequest('Select at least one date')
      }
    } else {
      if (!body.dateRangeStart || !body.dateRangeEnd) {
        return badRequest('Missing date range')
      }
    }

    const db = getDb()
    await ensureSchema()

    const hangId = genId()
    const creatorId = genId()

    const sortedSelected = body.selectedDates ? [...body.selectedDates].sort() : undefined
    const start = body.dateMode === 'specific' ? sortedSelected![0] : body.dateRangeStart!
    const end = body.dateMode === 'specific' ? sortedSelected![sortedSelected!.length - 1] : body.dateRangeEnd!

    // Normalize activities into {name, costEstimate}[] for bulk insert
    const activities = (body.activities || []).map(a =>
      typeof a === 'string' ? { name: a, costEstimate: '' } : a,
    )

    // One batched write: hang row + creator participant row + activity rows + bring-list seeds.
    const bringListSeed = body.bringListSeed || []

    await db.batch(
      [
        {
          sql: `INSERT INTO hangs (id, name, creator_name, creator_id, date_range_start, date_range_end,
                  date_mode, selected_dates, template, location, duration,
                  description, theme, dress_code, response_deadline, ask_dietary, custom_question)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            hangId,
            body.name,
            body.creatorName,
            creatorId,
            start,
            end,
            body.dateMode,
            sortedSelected ? JSON.stringify(sortedSelected) : null,
            body.template || null,
            body.location || null,
            body.duration,
            body.description || null,
            body.theme || null,
            body.dressCode || null,
            body.responseDeadline || null,
            body.askDietary ? 1 : 0,
            body.customQuestion || null,
          ],
        },
        {
          sql: 'INSERT INTO participants (id, hang_id, name) VALUES (?, ?, ?)',
          args: [creatorId, hangId, body.creatorName],
        },
        ...activities.map(a => ({
          sql: 'INSERT INTO activities (hang_id, name, added_by, cost_estimate) VALUES (?, ?, ?, ?)',
          args: [hangId, a.name, creatorId, a.costEstimate || null],
        })),
        ...bringListSeed.map(item => ({
          sql: 'INSERT INTO bring_list (hang_id, parent_id, item) VALUES (?, NULL, ?)',
          args: [hangId, item],
        })),
      ],
      'write',
    )

    const creatorToken = await signParticipantToken(creatorId, hangId, true)

    return NextResponse.json({
      id: hangId,
      shareUrl: `/h/${hangId}`,
      creatorId,
      creatorToken,
    })
  } catch (e) {
    return serverError(e, 'POST /api/hangs')
  }
}
