// Regression coverage for timezone-safe calendar-date helpers.
import { describe, expect, it } from 'vitest'
import { addCalendarDays, calendarDateInTimeZone, calendarDayOfWeek, differenceInCalendarDays, expandDateRange, formatCalendarDateTime, formatDeadline, isDateBeforeLocalToday, isDateBeforeTodayInTimeZone, zonedCalendarDateTimeToUtc } from './time'

describe('expandDateRange', () => {
  it('keeps an inclusive date range on the selected calendar days', () => {
    expect(expandDateRange('2026-08-28', '2026-08-30')).toEqual([
      '2026-08-28',
      '2026-08-29',
      '2026-08-30',
    ])
  })

  it('caps long ranges at 31 days', () => {
    const dates = expandDateRange('2026-01-01', '2026-12-31')
    expect(dates).toHaveLength(31)
    expect(dates.at(-1)).toBe('2026-01-31')
  })

  it('rejects invalid or reversed ranges', () => {
    expect(expandDateRange('2026-02-31', '2026-03-02')).toEqual([])
    expect(expandDateRange('2026-08-30', '2026-08-28')).toEqual([])
    expect(expandDateRange('not-a-date', '2026-08-28')).toEqual([])
  })
})

describe('calendar-date arithmetic', () => {
  it('adds and compares dates without DST or host-timezone shifts', () => {
    expect(addCalendarDays('2026-10-03', 1)).toBe('2026-10-04')
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(differenceInCalendarDays('2026-08-28', '2026-08-30')).toBe(2)
    expect(calendarDayOfWeek('2026-08-28')).toBe(5)
  })

  it('reads the Sydney calendar day at a cross-zone boundary', () => {
    const instant = new Date('2026-08-28T15:00:00.000Z')
    expect(calendarDateInTimeZone(instant, 'Australia/Sydney')).toBe('2026-08-29')
  })
})

describe('isDateBeforeLocalToday', () => {
  const localNoon = new Date(2026, 7, 28, 12)

  it('only marks calendar days before the viewer\'s local day as past', () => {
    expect(isDateBeforeLocalToday('2026-08-27', localNoon)).toBe(true)
    expect(isDateBeforeLocalToday('2026-08-28', localNoon)).toBe(false)
    expect(isDateBeforeLocalToday('2026-08-29', localNoon)).toBe(false)
  })
})

describe('isDateBeforeTodayInTimeZone', () => {
  it('uses the event timezone rather than the viewer timezone', () => {
    const instant = new Date('2026-08-29T15:00:00.000Z')
    expect(isDateBeforeTodayInTimeZone('2026-08-29', 'Australia/Sydney', instant)).toBe(true)
    expect(isDateBeforeTodayInTimeZone('2026-08-29', 'America/New_York', instant)).toBe(false)
  })
})

describe('formatCalendarDateTime', () => {
  it('formats the locked calendar date and handles midnight', () => {
    expect(formatCalendarDateTime('2026-08-29', 17)).toBe('Sat 29 Aug, 5pm')
    expect(formatCalendarDateTime('2026-08-29', 0)).toBe('Sat 29 Aug, 12am')
  })
})

describe('zonedCalendarDateTimeToUtc', () => {
  it('converts Sydney wall time independently of the server timezone', () => {
    expect(zonedCalendarDateTimeToUtc('2026-08-29', 0, 'Australia/Sydney')?.toISOString())
      .toBe('2026-08-28T14:00:00.000Z')
    expect(zonedCalendarDateTimeToUtc('2026-01-15', 12, 'Australia/Sydney')?.toISOString())
      .toBe('2026-01-15T01:00:00.000Z')
  })
})

describe('formatDeadline', () => {
  it('uses the Sydney end of day instead of the viewer timezone', () => {
    const beforeSydneyMidnight = new Date('2026-08-28T13:30:00.000Z')
    const afterSydneyMidnight = new Date('2026-08-28T14:00:01.000Z')

    expect(formatDeadline('2026-08-28', beforeSydneyMidnight)?.text).toBe('closes in 30m')
    expect(formatDeadline('2026-08-28', afterSydneyMidnight)).toEqual({
      text: 'responses closed',
      urgent: false,
      closed: true,
    })
  })
})
