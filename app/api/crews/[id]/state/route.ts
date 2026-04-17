// GET /api/crews/[id]/state — batched read: crew meta + members + upcoming &
// past hangs. Polled by the crew page. Caller must be a member of the crew.

import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { serverError, unauthorized, notFound, forbidden } from '@/lib/errors'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const claims = await requireUser(req)
    if (!claims) return unauthorized('Sign in first')

    const db = getDb()
    await ensureSchema()

    const [crewRes, membershipRes, membersRes, upcomingRes, pastRes] = await db.batch([
      { sql: `SELECT id, name, slug, description, created_by, created_at,
                     recurring_rule, recurring_template_hang_id, cover_color, cover_emoji,
                     public_invite_token
              FROM crews WHERE id = ?`, args: [id] },
      {
        sql: 'SELECT role FROM crew_members WHERE crew_id = ? AND user_id = ?',
        args: [id, claims.sub],
      },
      {
        sql: `SELECT cm.id, cm.user_id, cm.display_name, cm.role, cm.dietary,
                     cm.transport_preference, cm.contact_phone, cm.availability_shape,
                     cm.joined_at, u.email
              FROM crew_members cm
              JOIN users u ON u.id = cm.user_id
              WHERE cm.crew_id = ?
              ORDER BY cm.role DESC, cm.joined_at ASC`,
        args: [id],
      },
      {
        sql: `SELECT id, name, status, confirmed_date, confirmed_hour, confirmed_activity,
                     date_range_start, date_range_end, location, created_at
              FROM hangs
              WHERE crew_id = ?
                AND (status IS NULL OR status != 'cancelled')
                AND (confirmed_date IS NULL OR confirmed_date >= date('now'))
              ORDER BY COALESCE(confirmed_date, date_range_start) ASC
              LIMIT 20`,
        args: [id],
      },
      {
        sql: `SELECT id, name, status, confirmed_date, confirmed_hour, confirmed_activity,
                     date_range_start, date_range_end, location, created_at
              FROM hangs
              WHERE crew_id = ?
                AND (
                  status = 'cancelled'
                  OR (confirmed_date IS NOT NULL AND confirmed_date < date('now'))
                )
              ORDER BY COALESCE(confirmed_date, created_at) DESC
              LIMIT 20`,
        args: [id],
      },
    ], 'read')

    const crew = crewRes.rows[0]
    if (!crew) return notFound('Crew not found')

    const membership = membershipRes.rows[0]
    if (!membership) return forbidden('Not a member of this crew')

    const me = membersRes.rows.find(r => r.user_id === claims.sub)

    // ── Stats: hangs this month, avg attendance, my streak ──
    const now = new Date()
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const statsRes = await db.batch([
      // Hangs with a confirmed_date in the current calendar month
      {
        sql: `SELECT COUNT(*) as cnt FROM hangs
              WHERE crew_id = ?
                AND confirmed_date IS NOT NULL
                AND substr(confirmed_date, 1, 7) = ?`,
        args: [id, monthPrefix],
      },
      // Recent confirmed hangs with attendance ratio (in / total participants),
      // limited to last 6 so it reflects current cadence not deep history.
      {
        sql: `SELECT h.id,
                     (SELECT COUNT(*) FROM participants p WHERE p.hang_id = h.id) AS total,
                     (SELECT COUNT(*) FROM commitment c WHERE c.hang_id = h.id AND c.level = 'in') AS ins
              FROM hangs h
              WHERE h.crew_id = ?
                AND h.confirmed_date IS NOT NULL
                AND h.confirmed_date < date('now')
              ORDER BY h.confirmed_date DESC
              LIMIT 6`,
        args: [id],
      },
      // My commitment history on crew hangs, ordered by confirmed_date desc so
      // we can walk it to count a consecutive "in" streak.
      {
        sql: `SELECT c.level, h.confirmed_date
              FROM commitment c
              JOIN participants p ON p.id = c.participant_id
              JOIN hangs h ON h.id = c.hang_id
              WHERE h.crew_id = ?
                AND p.user_id = ?
                AND h.confirmed_date IS NOT NULL
              ORDER BY h.confirmed_date DESC
              LIMIT 30`,
        args: [id, claims.sub],
      },
    ], 'read')

    const hangsThisMonth = (statsRes[0].rows[0]?.cnt as number) || 0

    const attendanceRows = statsRes[1].rows
    let avgAttendance: number | null = null
    if (attendanceRows.length) {
      let totalRatio = 0
      let counted = 0
      for (const row of attendanceRows) {
        const total = (row.total as number) || 0
        if (total > 0) {
          totalRatio += ((row.ins as number) || 0) / total
          counted++
        }
      }
      if (counted > 0) avgAttendance = totalRatio / counted
    }

    let myStreak = 0
    for (const row of statsRes[2].rows) {
      if (row.level === 'in') myStreak++
      else break
    }

    return NextResponse.json({
      crew: {
        id: crew.id,
        name: crew.name,
        slug: crew.slug,
        description: crew.description,
        createdBy: crew.created_by,
        createdAt: crew.created_at,
        recurringRule: crew.recurring_rule,
        recurringTemplateHangId: crew.recurring_template_hang_id,
        coverColor: crew.cover_color,
        coverEmoji: crew.cover_emoji,
        publicInviteToken: crew.public_invite_token,
      },
      myRole: membership.role,
      myProfile: me ? {
        userId: me.user_id,
        displayName: me.display_name,
        dietary: me.dietary,
        transportPreference: me.transport_preference,
        contactPhone: me.contact_phone,
        availabilityShape: me.availability_shape
          ? (() => { try { return JSON.parse(me.availability_shape as string) } catch { return {} } })()
          : {},
      } : null,
      members: membersRes.rows.map(r => ({
        userId: r.user_id,
        email: r.email,
        displayName: r.display_name,
        role: r.role,
        dietary: r.dietary,
        transportPreference: r.transport_preference,
        joinedAt: r.joined_at,
      })),
      upcomingHangs: upcomingRes.rows,
      pastHangs: pastRes.rows,
      stats: {
        hangsThisMonth,
        avgAttendance, // null if no confirmed past hangs yet
        myStreak,
      },
    })
  } catch (e) {
    return serverError(e, 'GET /api/crews/[id]/state')
  }
}
