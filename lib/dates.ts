// Pure calendar-date helpers (YYYY-MM-DD strings, no timezone conversion) for pickers and validation.
import { addCalendarDays, calendarDateInTimeZone, calendarDayOfWeek } from './time'

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isRealCalendarDate(s: string): boolean {
  const m = DATE_RE.exec(s)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])
}

export function isValidTimeZone(tz: string): boolean {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

// Today's calendar date in an IANA timezone; falls back to the UTC date for an unknown zone.
export function todayIn(tz: string, now: Date = new Date()): string {
  return calendarDateInTimeZone(now, tz) ?? now.toISOString().slice(0, 10)
}

export function addDays(d: string, n: number): string {
  return addCalendarDays(d, n) ?? d
}

// The next `weekends` Saturday+Sunday pairs' worth of weekend dates on or after today (2 -> 4 dates).
export function nextWeekends(today: string, weekends = 2): string[] {
  const out: string[] = []
  let d = today
  for (let i = 0; out.length < weekends * 2 && i < 400; i++) {
    const dow = calendarDayOfWeek(d)
    if (dow === 6 || dow === 0) out.push(d)
    d = addDays(d, 1)
  }
  return out
}

export function nextDays(today: string, n = 14): string[] {
  return Array.from({ length: Math.max(0, n) }, (_, i) => addDays(today, i))
}

export interface MonthCell { date: string; inMonth: boolean }

// Monday-first weeks covering the month; only as many rows as needed (max 6).
export function monthGrid(year: number, month0: number): MonthCell[][] {
  const first = new Date(Date.UTC(year, month0, 1))
  const lead = (first.getUTCDay() + 6) % 7 // days before the 1st in a Monday-first week
  const start = new Date(Date.UTC(year, month0, 1 - lead))
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()
  const rows = Math.ceil((lead + daysInMonth) / 7)
  const grid: MonthCell[][] = []
  for (let r = 0; r < rows; r++) {
    const row: MonthCell[] = []
    for (let c = 0; c < 7; c++) {
      const d = new Date(start.getTime() + (r * 7 + c) * 86_400_000)
      row.push({ date: d.toISOString().slice(0, 10), inMonth: d.getUTCMonth() === ((month0 % 12) + 12) % 12 })
    }
    grid.push(row)
  }
  return grid
}

export function parseDate(d: string): { year: number; month0: number; day: number } {
  const m = DATE_RE.exec(d)
  if (!m) return { year: 1970, month0: 0, day: 1 }
  return { year: Number(m[1]), month0: Number(m[2]) - 1, day: Number(m[3]) }
}
