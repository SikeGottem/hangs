// iCalendar (.ics) builder and Google Calendar template link for a locked hang.
import { addDays } from './dates'
import { zonedDateTimeToUtc } from './time'
import type { DayPart, EventState } from './types'

const PART_START: Record<Exclude<DayPart, 'day'>, string> = { morning: '09:00', afternoon: '13:00', evening: '18:00' }
const DURATION_MS = 3 * 60 * 60 * 1000

export function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n')
}

const utf8Len = (s: string) => new TextEncoder().encode(s).length

// Folds a content line at 75 octets (continuations start with a space), never splitting a UTF-8 sequence.
export function foldLine(line: string): string {
  if (utf8Len(line) <= 75) return line
  const out: string[] = []
  let current = ''
  let currentLen = 0
  let limit = 75
  for (const ch of line) {
    const len = utf8Len(ch)
    if (currentLen + len > limit) {
      out.push(current)
      current = ''
      currentLen = 0
      limit = 74 // continuation lines carry a leading space
    }
    current += ch
    currentLen += len
  }
  out.push(current)
  return out.map((l, i) => (i === 0 ? l : ` ${l}`)).join('\r\n')
}

const pad = (n: number) => String(n).padStart(2, '0')

export function toIcsUtc(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

const compactDate = (d: string) => d.replace(/-/g, '')

export type IcsTiming =
  | { allDay: true; start: string; end: string }          // YYYYMMDD, end exclusive
  | { allDay: false; start: Date; end: Date }

export function lockTiming(state: EventState): IcsTiming | null {
  const lock = state.event.lock
  if (!lock) return null
  const startTime = lock.time ?? (lock.part === 'day' ? null : PART_START[lock.part])
  if (startTime) {
    const start = zonedDateTimeToUtc(lock.date, startTime, state.event.tz)
    if (start) return { allDay: false, start, end: new Date(start.getTime() + DURATION_MS) }
  }
  return { allDay: true, start: compactDate(lock.date), end: compactDate(addDays(lock.date, 1)) }
}

function description(state: EventState, url: string): string {
  return state.event.note ? `${state.event.note}\n\n${url}` : url
}

// Throws if the event is not locked; callers (the ics route) check first.
export function buildIcs(state: EventState, opts: { url: string; now: Date }): string {
  const timing = lockTiming(state)
  if (!timing) throw new Error('Event is not locked')
  const lock = state.event.lock!
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hangs//v2//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${state.event.id}@hangs`,
    `SEQUENCE:${state.event.version}`,
    `DTSTAMP:${toIcsUtc(opts.now)}`,
    timing.allDay ? `DTSTART;VALUE=DATE:${timing.start}` : `DTSTART:${toIcsUtc(timing.start)}`,
    timing.allDay ? `DTEND;VALUE=DATE:${timing.end}` : `DTEND:${toIcsUtc(timing.end)}`,
    `SUMMARY:${escapeIcsText(state.event.title)}`,
    ...(lock.place ? [`LOCATION:${escapeIcsText(lock.place)}`] : []),
    `DESCRIPTION:${escapeIcsText(description(state, opts.url))}`,
    `URL:${opts.url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

export function googleCalendarUrl(state: EventState, opts: { url: string }): string {
  const timing = lockTiming(state)
  const dates = !timing
    ? ''
    : timing.allDay
      ? `${timing.start}/${timing.end}`
      : `${toIcsUtc(timing.start)}/${toIcsUtc(timing.end)}`
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: state.event.title,
    dates,
    details: description(state, opts.url),
    location: state.event.lock?.place ?? '',
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

// Download filename stem: a-z0-9- slug of the title, max 40 chars, default "hang".
export function icsSlug(title: string): string {
  const slug = title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  return slug || 'hang'
}
