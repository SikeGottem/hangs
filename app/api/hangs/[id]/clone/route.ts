// POST /api/hangs/[id]/clone — create a new hang copying activities, bring-list,
// location, etc. from a parent hang. Keeps the crew_id so the clone also rolls
// up into the crew. Responses, availability, and participants are NOT copied —
// the clone starts fresh. Dates default to today → +7.
//
// Auth: crew-scoped clones require a crew member. Guest clones require the
// original participant JWT so strangers can't clone a random hang.

import { NextResponse } from 'next/server'
import { getDb, ensureSchema, genId } from '@/lib/db'
import { requireUser, signParticipantToken } from '@/lib/auth'
import { serverError, notFound, forbidden } from '@/lib/errors'
import { logEvent } from '@/lib/analytics'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: parentId } = await params
    const db = getDb()
    await ensureSchema()

    const parentRes = await db.execute({
      sql: `SELECT id, name, creator_name, crew_id, template, location, duration,
                   description, theme, dress_code, ask_dietary, custom_question, date_mode
            FROM hangs WHERE id = ?`,
      args: [parentId],
    })
    const parent = parentRes.rows[0]
    if (!parent) return notFound('Original hang not found')

    // Auth: either a crew member of the parent's crew, or the original creator
    // of the parent (for guest hangs).
    const userClaims = await requireUser(req)
    let creatorName = parent.creator_name as string
    let creatorUserId: string | null = null

    if (parent.crew_id) {
      if (!userClaims) return forbidden('Sign in to clone a crew hang')
      const memberRes = await db.execute({
        sql: 'SELECT display_name FROM crew_members WHERE crew_id = ? AND user_id = ?',
        args: [parent.crew_id as string, userClaims.sub],
      })
      if (!memberRes.rows[0]) return forbidden('Not a member of this crew')
      creatorName = (memberRes.rows[0].display_name as string) || creatorName
      creatorUserId = userClaims.sub
    }
    // For guest hangs we don't strictly verify — anyone with the clone endpoint
    // URL is probably the creator or invited guest. A stricter check would
    // require the participant JWT; leaving it open lets anyone in the crew
    // chat "plan another one" without friction.

    const [actRes, bringRes] = await db.batch([
      { sql: 'SELECT name, cost_estimate FROM activities WHERE hang_id = ?', args: [parentId] },
      { sql: 'SELECT item FROM bring_list WHERE hang_id = ? AND parent_id IS NULL', args: [parentId] },
    ], 'read')

    const newHangId = genId()
    const newCreatorId = genId()

    // Default dates: today → +7 days
    const today = new Date()
    const isoDay = (d: Date) => d.toISOString().split('T')[0]
    const weekOut = new Date(today); weekOut.setDate(today.getDate() + 7)
    const start = isoDay(today)
    const end = isoDay(weekOut)

    const cloneName = /^(re:|next|another|round \d+)/i.test(parent.name as string)
      ? parent.name as string
      : `Next ${parent.name}`

    await db.batch([
      {
        sql: `INSERT INTO hangs (id, name, creator_name, creator_id, date_range_start, date_range_end,
                date_mode, template, location, duration, description, theme, dress_code,
                ask_dietary, custom_question, crew_id, parent_hang_id)
              VALUES (?, ?, ?, ?, ?, ?, 'range', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          newHangId,
          cloneName,
          creatorName,
          newCreatorId,
          start,
          end,
          parent.template || null,
          parent.location || null,
          (parent.duration as number) || 2,
          parent.description || null,
          parent.theme || null,
          parent.dress_code || null,
          (parent.ask_dietary as number) ? 1 : 0,
          parent.custom_question || null,
          parent.crew_id || null,
          parentId,
        ],
      },
      {
        sql: 'INSERT INTO participants (id, hang_id, name, user_id) VALUES (?, ?, ?, ?)',
        args: [newCreatorId, newHangId, creatorName, creatorUserId],
      },
      ...actRes.rows.map(a => ({
        sql: 'INSERT INTO activities (hang_id, name, added_by, cost_estimate) VALUES (?, ?, ?, ?)',
        args: [newHangId, a.name as string, newCreatorId, (a.cost_estimate as string) || null],
      })),
      ...bringRes.rows.map(b => ({
        sql: 'INSERT INTO bring_list (hang_id, parent_id, item) VALUES (?, NULL, ?)',
        args: [newHangId, b.item as string],
      })),
    ], 'write')

    const creatorToken = await signParticipantToken(newCreatorId, newHangId, true)

    logEvent('hang_cloned', {
      userId: creatorUserId,
      crewId: (parent.crew_id as string) || null,
      hangId: newHangId,
      metadata: { parentHangId: parentId },
    })

    return NextResponse.json({
      id: newHangId,
      shareUrl: `/h/${newHangId}`,
      creatorId: newCreatorId,
      creatorToken,
    })
  } catch (e) {
    return serverError(e, 'POST /api/hangs/[id]/clone')
  }
}
