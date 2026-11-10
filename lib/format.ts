// Display formatting: answer/part labels, dates, times and list joins (UTC getters, English constants, no Intl tz).
import type { AnswerValue, DayPart, Vocabulary } from './types'

export const ANSWER_LABELS: Record<Vocabulary, Record<AnswerValue, string>> = {
  plan: { free: 'Free', maybe: 'If need be', cant: "Can't" },
  rsvp: { free: 'Going', maybe: 'Maybe', cant: 'Out' },
}

export const PART_LABELS: Record<DayPart, string> = { day: 'All day', morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' }
export const PART_ORDER: Record<DayPart, number> = { day: 0, morning: 1, afternoon: 2, evening: 3 }

const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function toUtcDate(d: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d)
  if (!m) return null
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return Number.isNaN(date.getTime()) ? null : date
}

export type DateStyle = 'short' | 'tiny' | 'long'

// short: "Sat 21 Nov" (+ " 2027" when the year differs from today's); tiny: "Sat 21"; long: "Saturday 21 November".
export function formatDate(d: string, opts: { today?: string; style?: DateStyle } = {}): string {
  const date = toUtcDate(d)
  if (!date) return d
  const style = opts.style ?? 'short'
  const wd = date.getUTCDay()
  const day = date.getUTCDate()
  const mo = date.getUTCMonth()
  if (style === 'tiny') return `${WEEKDAYS_SHORT[wd]} ${day}`
  if (style === 'long') return `${WEEKDAYS_LONG[wd]} ${day} ${MONTHS_LONG[mo]}`
  const year = date.getUTCFullYear()
  const todayYear = opts.today ? Number(opts.today.slice(0, 4)) : year
  return `${WEEKDAYS_SHORT[wd]} ${day} ${MONTHS_SHORT[mo]}${year !== todayYear ? ` ${year}` : ''}`
}

export function dateParts(d: string): { weekday: string; day: string; month: string } {
  const date = toUtcDate(d)
  if (!date) return { weekday: '', day: '', month: '' }
  return {
    weekday: WEEKDAYS_SHORT[date.getUTCDay()].toUpperCase(),
    day: String(date.getUTCDate()),
    month: MONTHS_SHORT[date.getUTCMonth()],
  }
}

export function weekdayLong(d: string): string {
  const date = toUtcDate(d)
  return date ? WEEKDAYS_LONG[date.getUTCDay()] : ''
}

export function monthYearLabel(year: number, month0: number): string {
  return `${MONTHS_LONG[month0]} ${year}`
}

// "Sat 21 Nov" or "Sat 21 Nov, morning".
export function formatOption(o: { date: string; part: DayPart }, opts: { today?: string; style?: DateStyle } = {}): string {
  const base = formatDate(o.date, { today: opts.today, style: opts.style ?? 'short' })
  return o.part === 'day' ? base : `${base}, ${PART_LABELS[o.part].toLowerCase()}`
}

// '13:30' -> '1:30pm', '13:00' -> '1pm', '00:15' -> '12:15am'.
export function formatTime(hhmm: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm)
  if (!m) return hhmm
  const h = Number(m[1])
  const min = m[2]
  const suffix = h < 12 ? 'am' : 'pm'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return min === '00' ? `${h12}${suffix}` : `${h12}:${min}${suffix}`
}

export function listJoin(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}
