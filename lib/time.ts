// Small date/time helpers shared across the respond flow and the results page.
// No deps — pure functions, safe to import anywhere.

export type DeadlineInfo = {
  text: string       // e.g. "closes in 6h"
  urgent: boolean    // <24h remaining
  closed: boolean    // deadline passed
}

// Expand an inclusive YYYY-MM-DD range without letting the host timezone
// shift calendar days during Date -> ISO conversion.
export function expandDateRange(start: string, end: string, maxDays = 31): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return []

  const current = new Date(`${start}T00:00:00Z`)
  const final = new Date(`${end}T00:00:00Z`)
  if (
    Number.isNaN(current.getTime())
    || Number.isNaN(final.getTime())
    || current.toISOString().slice(0, 10) !== start
    || final.toISOString().slice(0, 10) !== end
    || current > final
  ) return []

  const limit = Number.isFinite(maxDays) ? Math.max(0, Math.floor(maxDays)) : 31
  const dates: string[] = []
  while (current <= final && dates.length < limit) {
    dates.push(current.toISOString().slice(0, 10))
    current.setUTCDate(current.getUTCDate() + 1)
  }
  return dates
}

export function addCalendarDays(dateStr: string, days: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !Number.isInteger(days)) return null
  const date = new Date(`${dateStr}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateStr) return null
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function differenceInCalendarDays(start: string, end: string): number | null {
  const startDate = new Date(`${start}T00:00:00Z`)
  const endDate = new Date(`${end}T00:00:00Z`)
  if (
    Number.isNaN(startDate.getTime())
    || Number.isNaN(endDate.getTime())
    || startDate.toISOString().slice(0, 10) !== start
    || endDate.toISOString().slice(0, 10) !== end
  ) return null
  return Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000)
}

export function calendarDayOfWeek(dateStr: string): number | null {
  const date = new Date(`${dateStr}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateStr) return null
  return date.getUTCDay()
}

export function calendarDateInTimeZone(now: Date, timeZone: string): string | null {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const values: Record<string, string> = {}
    for (const part of formatter.formatToParts(now)) {
      if (part.type !== 'literal') values[part.type] = part.value
    }
    return `${values.year}-${values.month}-${values.day}`
  } catch {
    return null
  }
}

// Compare a stored calendar date with the viewer's local calendar day.
export function isDateBeforeLocalToday(dateStr: string | null | undefined, now = new Date()): boolean {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false
  const localToday = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
  return dateStr < localToday
}

// Compare a stored calendar date with today's date in a named IANA timezone.
export function isDateBeforeTodayInTimeZone(
  dateStr: string | null | undefined,
  timeZone: string,
  now = new Date(),
): boolean {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false
  const today = calendarDateInTimeZone(now, timeZone)
  return today ? dateStr < today : false
}

// Format a stored calendar date and hour without parsing the date as UTC.
export function formatCalendarDateTime(dateStr: string, hour: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!match) return dateStr
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) return dateStr

  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const normalizedHour = ((Math.floor(hour) % 24) + 24) % 24
  const clock = normalizedHour === 0
    ? '12am'
    : normalizedHour < 12
      ? `${normalizedHour}am`
      : normalizedHour === 12
        ? '12pm'
        : `${normalizedHour - 12}pm`
  return `${weekdays[date.getDay()]} ${day} ${months[month - 1]}, ${clock}`
}

function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const values: Record<string, string> = {}
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') values[part.type] = part.value
  }
  const representedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  )
  return representedAsUtc - instant.getTime()
}

// Convert a wall-clock calendar date in a named IANA timezone to a UTC instant.
export function zonedCalendarDateTimeToUtc(dateStr: string, hour: number, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!match || !Number.isInteger(hour) || hour < 0 || hour > 23) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const guess = new Date(Date.UTC(year, month - 1, day, hour))
  if (
    guess.getUTCFullYear() !== year
    || guess.getUTCMonth() !== month - 1
    || guess.getUTCDate() !== day
  ) return null

  try {
    const firstOffset = timeZoneOffsetMs(guess, timeZone)
    let utcMs = guess.getTime() - firstOffset
    const correctedOffset = timeZoneOffsetMs(new Date(utcMs), timeZone)
    if (correctedOffset !== firstOffset) utcMs = guess.getTime() - correctedOffset
    return new Date(utcMs)
  } catch {
    return null
  }
}

// Format a YYYY-MM-DD response deadline as a human-readable countdown.
// Returns null if no deadline is set.
export function formatDeadline(
  dateStr: string | null | undefined,
  now = new Date(),
  timeZone = 'Australia/Sydney',
): DeadlineInfo | null {
  if (!dateStr) return null
  // Treat the deadline as end-of-day in the event timezone. Using the next
  // local midnight keeps the countdown stable across viewer timezones and DST.
  const nextDay = addCalendarDays(dateStr, 1)
  const nextMidnight = nextDay
    ? zonedCalendarDateTimeToUtc(nextDay, 0, timeZone)
    : null
  if (!nextMidnight) return null
  const diff = nextMidnight.getTime() - now.getTime()
  if (diff <= 0) return { text: 'responses closed', urgent: false, closed: true }
  const hours = diff / 3600000
  const days = Math.floor(hours / 24)
  if (days >= 2) return { text: `closes in ${days}d`, urgent: false, closed: false }
  if (days === 1) return { text: `closes tomorrow`, urgent: false, closed: false }
  if (hours >= 1) return { text: `closes in ${Math.floor(hours)}h`, urgent: true, closed: false }
  const mins = Math.max(1, Math.floor(diff / 60000))
  return { text: `closes in ${mins}m`, urgent: true, closed: false }
}
