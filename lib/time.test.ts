// Regression coverage for timezone-safe calendar-date helpers.
import { describe, expect, it } from 'vitest'
import { addCalendarDays, calendarDateInTimeZone, calendarDayOfWeek, zonedDateTimeToUtc } from './time'

describe('calendar-date arithmetic', () => {
  it('adds dates without DST or host-timezone shifts', () => {
    expect(addCalendarDays('2026-10-03', 1)).toBe('2026-10-04')
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addCalendarDays('2026-02-30', 1)).toBeNull()
    expect(calendarDayOfWeek('2026-08-28')).toBe(5)
  })

  it('reads the Sydney calendar day at a cross-zone boundary', () => {
    const instant = new Date('2026-08-28T15:00:00.000Z')
    expect(calendarDateInTimeZone(instant, 'Australia/Sydney')).toBe('2026-08-29')
  })
})

describe('zonedDateTimeToUtc', () => {
  it('converts Sydney wall-clock time with minutes to UTC (AEDT, +11)', () => {
    expect(zonedDateTimeToUtc('2026-11-21', '13:30', 'Australia/Sydney')?.toISOString()).toBe('2026-11-21T02:30:00.000Z')
  })

  it('handles AEST (+10) in winter', () => {
    expect(zonedDateTimeToUtc('2026-07-04', '09:05', 'Australia/Sydney')?.toISOString()).toBe('2026-07-03T23:05:00.000Z')
  })

  it('handles the day DST starts in Sydney', () => {
    // 4 Oct 2026: clocks jump 02:00 -> 03:00; 13:00 is AEDT.
    expect(zonedDateTimeToUtc('2026-10-04', '13:00', 'Australia/Sydney')?.toISOString()).toBe('2026-10-04T02:00:00.000Z')
  })

  it('works for UTC and other zones', () => {
    expect(zonedDateTimeToUtc('2026-11-21', '18:45', 'UTC')?.toISOString()).toBe('2026-11-21T18:45:00.000Z')
    expect(zonedDateTimeToUtc('2026-11-21', '18:00', 'America/New_York')?.toISOString()).toBe('2026-11-21T23:00:00.000Z')
  })

  it('rejects bad input', () => {
    expect(zonedDateTimeToUtc('2026-02-30', '10:00', 'UTC')).toBeNull()
    expect(zonedDateTimeToUtc('2026-11-21', '24:00', 'UTC')).toBeNull()
    expect(zonedDateTimeToUtc('2026-11-21', '9:00', 'UTC')).toBeNull()
    expect(zonedDateTimeToUtc('2026-11-21', '09:00', 'Not/AZone')).toBeNull()
  })
})
