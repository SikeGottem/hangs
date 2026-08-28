// .ics export for a confirmed hang — emits UTC timestamps so cross-timezone imports land at the right hour
import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'
import { zonedCalendarDateTimeToUtc } from '@/lib/time'

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
    const hang = res.rows[0]
    if (!hang || !hang.confirmed_date) return NextResponse.json({ error: 'No confirmed plan yet' }, { status: 400 })

    const confirmedDate = hang.confirmed_date as string
    const startHour = (hang.confirmed_hour as number | null) ?? 12
    const durationHours = (hang.duration as number | null) || 2
    // Clamp end so it never spills past midnight on the confirmed date.
    const endHour: number = Math.min(startHour + durationHours, 23)

    // Convert Sydney wall-clock times to UTC for unambiguous cross-timezone export.
    const startUtc = zonedCalendarDateTimeToUtc(confirmedDate, startHour, 'Australia/Sydney')
    const endUtc = zonedCalendarDateTimeToUtc(confirmedDate, endHour, 'Australia/Sydney')
    if (!startUtc || !endUtc) return NextResponse.json({ error: 'Invalid confirmed date' }, { status: 400 })
    const dtStart = toIcsUtc(startUtc)
    const dtEnd = toIcsUtc(endUtc)

    const location = (hang.location as string) || ''
    const activity = (hang.confirmed_activity as string) || ''
    const hangName = (hang.name as string) || 'Hangout'
    const description = `Hangout: ${hangName}${activity ? `\\nActivity: ${activity}` : ''}${location ? `\\nLocation: ${location}` : ''}`

    const ics = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//hangs//EN','BEGIN:VEVENT',
      `DTSTART:${dtStart}`,`DTEND:${dtEnd}`,
      `SUMMARY:${hangName}${activity ? ` — ${activity}` : ''}`,
      `DESCRIPTION:${description}`, location ? `LOCATION:${location}` : '',
      `UID:${id}@hangs`,'END:VEVENT','END:VCALENDAR',
    ].filter(Boolean).join('\r\n')

    // Google Calendar's dates= parameter also accepts UTC compact stamps.
    const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(hangName + (activity ? ` — ${activity}` : ''))}&dates=${dtStart}/${dtEnd}&details=${encodeURIComponent(description.replace(/\\n/g, '\n'))}${location ? `&location=${encodeURIComponent(location)}` : ''}`

    return NextResponse.json({ ics, gcalUrl, filename: `${hangName.replace(/[^a-zA-Z0-9]/g, '_')}.ics` })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Calendar export failed' }, { status: 500 })
  }
}
