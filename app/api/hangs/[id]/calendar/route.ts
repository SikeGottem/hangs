// .ics export for a confirmed hang — emits UTC timestamps so cross-timezone imports land at the right hour
import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'

/**
 * Convert a Sydney wall-clock time (YYYY-MM-DD + hour integer) to a UTC Date.
 * Uses Intl.DateTimeFormat to determine the Sydney UTC offset at that exact
 * instant, which correctly handles AEST (UTC+10) vs AEDT (UTC+11) DST.
 */
function sydneyToUtc(dateStr: string, hour: number): Date {
  // Construct a Date using the naive ISO string (interpreted as local time by
  // the runtime). We then ask Intl what offset Sydney has at that moment and
  // subtract it to obtain the true UTC instant.  One pass is sufficient
  // because DST transitions in Sydney happen on whole-hour boundaries.
  const naive = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:00:00`)

  // Extract the UTC offset that Australia/Sydney has at the naive instant.
  // Intl.DateTimeFormat with timeZoneName:'shortOffset' returns e.g. "GMT+11".
  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    hour: 'numeric',
    hour12: false,
    timeZoneName: 'shortOffset',
  })
  const parts = formatter.formatToParts(naive)
  const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+10'
  const offsetMatch = tzPart.match(/GMT([+-]\d+)/)
  const offsetHours = offsetMatch ? parseInt(offsetMatch[1], 10) : 10

  // Subtract the offset to get UTC.
  return new Date(naive.getTime() - offsetHours * 60 * 60 * 1000)
}

/** Format a Date as a compact UTC iCalendar stamp: YYYYMMDDTHHmmssZ */
function toIcsUtc(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    await ensureSchema()
    const res = await db.execute({ sql: 'SELECT * FROM hangs WHERE id = ?', args: [id] })
    const hang = res.rows[0] as any
    if (!hang || !hang.confirmed_date) return NextResponse.json({ error: 'No confirmed plan yet' }, { status: 400 })

    const confirmedDate = hang.confirmed_date as string
    const startHour: number = hang.confirmed_hour || 12
    const durationHours: number = hang.duration || 2
    // Clamp end so it never spills past midnight on the confirmed date.
    const endHour: number = Math.min(startHour + durationHours, 23)

    // Convert Sydney wall-clock times to UTC for unambiguous cross-timezone export.
    const startUtc = sydneyToUtc(confirmedDate, startHour)
    const endUtc = sydneyToUtc(confirmedDate, endHour)
    const dtStart = toIcsUtc(startUtc)
    const dtEnd = toIcsUtc(endUtc)

    const location = (hang.location as string) || ''
    const activity = (hang.confirmed_activity as string) || ''
    const description = `Hangout: ${hang.name}${activity ? `\\nActivity: ${activity}` : ''}${location ? `\\nLocation: ${location}` : ''}`

    const ics = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//hangs//EN','BEGIN:VEVENT',
      `DTSTART:${dtStart}`,`DTEND:${dtEnd}`,
      `SUMMARY:${hang.name}${activity ? ` — ${activity}` : ''}`,
      `DESCRIPTION:${description}`, location ? `LOCATION:${location}` : '',
      `UID:${id}@hangs`,'END:VEVENT','END:VCALENDAR',
    ].filter(Boolean).join('\r\n')

    // Google Calendar's dates= parameter also accepts UTC compact stamps.
    const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(hang.name + (activity ? ` — ${activity}` : ''))}&dates=${dtStart}/${dtEnd}&details=${encodeURIComponent(description.replace(/\\n/g, '\n'))}${location ? `&location=${encodeURIComponent(location)}` : ''}`

    return NextResponse.json({ ics, gcalUrl, filename: `${(hang.name as string).replace(/[^a-zA-Z0-9]/g, '_')}.ics` })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
