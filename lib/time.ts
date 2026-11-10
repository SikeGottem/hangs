// Calendar-date and timezone primitives (no deps, pure): date arithmetic, weekday, today in a zone, and
// wall-clock-in-zone to UTC for calendar exports.

export function addCalendarDays(dateStr: string, days: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !Number.isInteger(days)) return null
  const date = new Date(`${dateStr}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateStr) return null
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
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

// Convert a wall-clock 'HH:MM' on a calendar date in a named IANA timezone to a UTC instant.
export function zonedDateTimeToUtc(dateStr: string, hhmm: string, timeZone: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  const t = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm)
  if (!d || !t) return null
  const year = Number(d[1])
  const month = Number(d[2])
  const day = Number(d[3])
  const guess = new Date(Date.UTC(year, month - 1, day, Number(t[1]), Number(t[2])))
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
