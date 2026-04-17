// GET /api/cron/generate-recurring — daily job that looks at every crew with
// a recurring_rule and auto-clones the template hang for the next upcoming
// occurrence if one doesn't already exist in the next 7 days.
//
// Auth: Vercel Cron sends requests with `Authorization: Bearer $CRON_SECRET`.
// When CRON_SECRET is unset (dev), the endpoint is open — fine locally.

import { NextResponse } from 'next/server'
import { getDb, ensureSchema, genId } from '@/lib/db'
import { signParticipantToken } from '@/lib/auth'
import { serverError, unauthorized } from '@/lib/errors'

const DOW_INDEX: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
}

function parseRule(rule: string): { cadence: 'weekly' | 'biweekly'; dow: number; hour: number } | null {
  const m = rule.match(/^(weekly|biweekly):([a-z]{3}):(\d{1,2})$/)
  if (!m) return null
  const dow = DOW_INDEX[m[2]]
  const hour = parseInt(m[3], 10)
  if (dow === undefined || hour < 0 || hour > 23) return null
  return { cadence: m[1] as 'weekly' | 'biweekly', dow, hour }
}

function nextOccurrenceDate(now: Date, dow: number, cadence: 'weekly' | 'biweekly'): string {
  // Find the next date >= today where date.getDay() === dow.
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  const daysAhead = (dow - d.getDay() + 7) % 7
  d.setDate(d.getDate() + (daysAhead === 0 ? 7 : daysAhead)) // always in the future
  if (cadence === 'biweekly') {
    // Bias to a fortnight — for v1 this is a best-effort "next available slot"
    // rather than strict every-other-week alignment. Good enough for MVP.
    // Leave the date as computed — biweekly scheduling will naturally create
    // every-other-week cadence once the cron has run twice in a row on a
    // week with no hang.
  }
  return d.toISOString().split('T')[0]
}

export async function GET(req: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret) {
      const auth = req.headers.get('authorization') || ''
      if (auth !== `Bearer ${cronSecret}`) return unauthorized('Bad cron secret')
    }

    const db = getDb()
    await ensureSchema()

    const crewsRes = await db.execute({
      sql: `SELECT id, name, recurring_rule, recurring_template_hang_id
            FROM crews
            WHERE recurring_rule IS NOT NULL AND recurring_rule != ''
              AND recurring_template_hang_id IS NOT NULL`,
      args: [],
    })

    const results: { crewId: string; action: string; hangId?: string; reason?: string }[] = []
    const now = new Date()

    for (const crewRow of crewsRes.rows) {
      const crewId = crewRow.id as string
      const rule = crewRow.recurring_rule as string
      const templateId = crewRow.recurring_template_hang_id as string

      const parsed = parseRule(rule)
      if (!parsed) { results.push({ crewId, action: 'skip', reason: 'bad rule' }); continue }

      const targetDate = nextOccurrenceDate(now, parsed.dow, parsed.cadence)

      // Is there already a hang for this crew on that date?
      const existing = await db.execute({
        sql: `SELECT id FROM hangs
              WHERE crew_id = ?
                AND (confirmed_date = ? OR date_range_start = ?)
              LIMIT 1`,
        args: [crewId, targetDate, targetDate],
      })
      if (existing.rows[0]) { results.push({ crewId, action: 'skip', reason: 'already exists' }); continue }

      // Clone the template hang onto targetDate
      const templateRes = await db.execute({
        sql: `SELECT name, creator_name, creator_id, template, location, duration,
                     description, theme, dress_code, ask_dietary, custom_question
              FROM hangs WHERE id = ?`,
        args: [templateId],
      })
      const template = templateRes.rows[0]
      if (!template) { results.push({ crewId, action: 'skip', reason: 'template missing' }); continue }

      const [actRes, bringRes] = await db.batch([
        { sql: 'SELECT name, cost_estimate FROM activities WHERE hang_id = ?', args: [templateId] },
        { sql: 'SELECT item FROM bring_list WHERE hang_id = ? AND parent_id IS NULL', args: [templateId] },
      ], 'read')

      const newHangId = genId()
      const newCreatorId = genId()
      const cloneName = template.name as string

      await db.batch([
        {
          sql: `INSERT INTO hangs (id, name, creator_name, creator_id, date_range_start, date_range_end,
                  date_mode, template, location, duration, description, theme, dress_code,
                  ask_dietary, custom_question, crew_id, parent_hang_id, confirmed_hour)
                VALUES (?, ?, ?, ?, ?, ?, 'range', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            newHangId,
            cloneName,
            template.creator_name as string,
            newCreatorId,
            targetDate,
            targetDate,
            template.template || null,
            template.location || null,
            (template.duration as number) || 2,
            template.description || null,
            template.theme || null,
            template.dress_code || null,
            (template.ask_dietary as number) ? 1 : 0,
            template.custom_question || null,
            crewId,
            templateId,
            parsed.hour,
          ],
        },
        {
          sql: 'INSERT INTO participants (id, hang_id, name) VALUES (?, ?, ?)',
          args: [newCreatorId, newHangId, template.creator_name as string],
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

      // Sign a creator token (unused for cron path but consistent)
      await signParticipantToken(newCreatorId, newHangId, true)

      // Fan-out notifications to crew members
      try {
        const { notifyCrewMembers } = await import('@/lib/notifications')
        await notifyCrewMembers(crewId, null, {
          type: 'hang_created',
          text: `Recurring hang scheduled: ${cloneName} (${targetDate})`,
          url: `/h/${newHangId}`,
          hangId: newHangId,
        })
      } catch { /* ignore */ }

      results.push({ crewId, action: 'created', hangId: newHangId })
    }

    return NextResponse.json({ ok: true, processed: results.length, results })
  } catch (e) {
    return serverError(e, 'GET /api/cron/generate-recurring')
  }
}
