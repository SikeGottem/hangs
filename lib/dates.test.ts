// Unit tests for calendar-date helpers: presets, month grid, validation.
import { describe, expect, it } from 'vitest'
import { addDays, isRealCalendarDate, isValidTimeZone, monthGrid, nextDays, nextWeekends, todayIn } from './dates'

describe('dates', () => {
  it('todayIn reads the calendar day in a zone', () => {
    const instant = new Date('2026-11-10T14:00:00Z')
    expect(todayIn('Australia/Sydney', instant)).toBe('2026-11-11')
    expect(todayIn('UTC', instant)).toBe('2026-11-10')
    expect(todayIn('Bad/Zone', instant)).toBe('2026-11-10')
  })

  it('addDays', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('nextWeekends returns the next 4 Sat/Sun dates on or after today', () => {
    expect(nextWeekends('2026-11-10')).toEqual(['2026-11-14', '2026-11-15', '2026-11-21', '2026-11-22'])
    expect(nextWeekends('2026-11-15')).toEqual(['2026-11-15', '2026-11-21', '2026-11-22', '2026-11-28'])
    expect(nextWeekends('2026-11-14', 1)).toEqual(['2026-11-14', '2026-11-15'])
  })

  it('nextDays includes today', () => {
    const d = nextDays('2026-11-10')
    expect(d).toHaveLength(14)
    expect(d[0]).toBe('2026-11-10')
    expect(d[13]).toBe('2026-11-23')
  })

  it('monthGrid is Monday-first with only the rows needed', () => {
    const nov = monthGrid(2026, 10)
    expect(nov[0][0]).toEqual({ date: '2026-10-26', inMonth: false })
    expect(nov[0][6]).toEqual({ date: '2026-11-01', inMonth: true })
    expect(nov).toHaveLength(6)
    expect(nov.flat().filter(c => c.inMonth)).toHaveLength(30)
    const feb = monthGrid(2027, 1) // 1 Feb 2027 is a Monday, 28 days
    expect(feb).toHaveLength(4)
    expect(feb[0][0]).toEqual({ date: '2027-02-01', inMonth: true })
  })

  it('validates dates and zones', () => {
    expect(isRealCalendarDate('2028-02-29')).toBe(true)
    expect(isRealCalendarDate('2026-02-29')).toBe(false)
    expect(isRealCalendarDate('2026-13-01')).toBe(false)
    expect(isValidTimeZone('Australia/Sydney')).toBe(true)
    expect(isValidTimeZone('Mars/Base')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
  })
})
