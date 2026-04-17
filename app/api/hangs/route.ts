// POST /api/hangs — create a new hang, return creator token
import { NextResponse } from 'next/server'
import { getDb, ensureSchema, genId } from '@/lib/db'
import { signParticipantToken, requireUser } from '@/lib/auth'
import { CreateHangSchema, parseBody } from '@/lib/schemas'
import { serverError, badRequest, forbidden } from '@/lib/errors'
import { notifyCrewMembers } from '@/lib/notifications'
import { logEvent } from '@/lib/analytics'

export async function POST(req: Request) {
  try {
    const raw = await req.json()
    const parsed = parseBody(raw, CreateHangSchema)
    if ('error' in parsed) return badRequest(parsed.error)
    const body = parsed.data

    // Crew-scoped hang: verify the caller is a logged-in member of that crew.
    // Falls through to guest flow (user=null, crew_id=null) when crewId absent.
    let userClaims = null
    let crewMemberDisplay: string | null = null
    if (body.crewId) {
      userClaims = await requireUser(req)
      if (!userClaims) return forbidden('Sign in to create a crew hang')
      const db0 = getDb()
      await ensureSchema()
      const memberRes = await db0.execute({
        sql: `SELECT display_name FROM crew_members
              WHERE crew_id = ? AND user_id = ?`,
        args: [body.crewId, userClaims.sub],
      })
      if (!memberRes.rows[0]) return forbidden('Not a member of this crew')
      crewMemberDisplay = memberRes.rows[0].display_name as string | null
    }

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

    // If the creator is a logged-in crew member, prefer their crew display name
    // over the body-supplied creatorName (avoids name drift within a crew).
    const creatorName = crewMemberDisplay || body.creatorName

    await db.batch(
      [
        {
          sql: `INSERT INTO hangs (id, name, creator_name, creator_id, date_range_start, date_range_end,
                  date_mode, selected_dates, template, location, duration,
                  description, theme, dress_code, response_deadline, ask_dietary, custom_question,
                  crew_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            hangId,
            body.name,
            creatorName,
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
            body.crewId || null,
          ],
        },
        {
          sql: 'INSERT INTO participants (id, hang_id, name, user_id) VALUES (?, ?, ?, ?)',
          args: [creatorId, hangId, creatorName, userClaims?.sub || null],
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

    // Fan-out notifications to crew members if this is a crew hang
    if (body.crewId) {
      try {
        await notifyCrewMembers(body.crewId, userClaims?.sub || null, {
          type: 'hang_created',
          text: `New hang: ${body.name}`,
          url: `/h/${hangId}`,
          hangId,
        })
      } catch (e) {
        console.warn('[hangs] notification fanout failed:', e)
      }
    }

    logEvent('hang_created', {
      userId: userClaims?.sub || null,
      crewId: body.crewId || null,
      hangId,
      metadata: { hasCrew: !!body.crewId },
    })

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
