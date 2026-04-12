import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    await ensureSchema()
    const res = await db.execute({ sql: 'SELECT * FROM hangs WHERE id = ?', args: [id] })
    const hang = res.rows[0] as any
    if (!hang || !hang.confirmed_date) return NextResponse.json({ error: 'No confirmed plan yet' }, { status: 400 })

    const startDate = (hang.confirmed_date as string).replace(/-/g, '')
    const startHour = String(hang.confirmed_hour || 12).padStart(2, '0')
    const endHour = String(Math.min((hang.confirmed_hour || 12) + (hang.duration || 2), 23)).padStart(2, '0')
    const dtStart = `${startDate}T${startHour}0000`
    const dtEnd = `${startDate}T${endHour}0000`
    const location = (hang.location as string) || ''
    const activity = (hang.confirmed_activity as string) || ''
    const description = `Hangout: ${hang.name}${activity ? `\\nActivity: ${activity}` : ''}${location ? `\\nLocation: ${location}` : ''}`

    const ics = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//hangs//EN','BEGIN:VEVENT',
      `DTSTART:${dtStart}`,`DTEND:${dtEnd}`,
      `SUMMARY:${hang.name}${activity ? ` — ${activity}` : ''}`,
      `DESCRIPTION:${description}`, location ? `LOCATION:${location}` : '',
      `UID:${id}@hangs`,'END:VEVENT','END:VCALENDAR',
    ].filter(Boolean).join('\r\n')

    const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(hang.name + (activity ? ` — ${activity}` : ''))}&dates=${dtStart}/${dtEnd}&details=${encodeURIComponent(description.replace(/\\n/g, '\n'))}${location ? `&location=${encodeURIComponent(location)}` : ''}`

    return NextResponse.json({ ics, gcalUrl, filename: `${(hang.name as string).replace(/[^a-zA-Z0-9]/g, '_')}.ics` })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
