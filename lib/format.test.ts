// Unit tests for date/time/list formatting and label tables.
import { describe, expect, it } from 'vitest'
import { ANSWER_LABELS, dateParts, formatDate, formatOption, formatTime, listJoin, PART_LABELS, plural } from './format'

describe('formatDate', () => {
  it('short, tiny and long', () => {
    expect(formatDate('2026-11-21', { today: '2026-11-10' })).toBe('Sat 21 Nov')
    expect(formatDate('2026-11-21', { style: 'tiny' })).toBe('Sat 21')
    expect(formatDate('2026-11-21', { style: 'long' })).toBe('Saturday 21 November')
  })
  it('appends the year when it differs from today', () => {
    expect(formatDate('2027-01-02', { today: '2026-12-30' })).toBe('Sat 2 Jan 2027')
    expect(formatDate('2027-01-02', { today: '2027-01-01' })).toBe('Sat 2 Jan')
  })
  it('returns invalid input untouched', () => {
    expect(formatDate('nope')).toBe('nope')
  })
})

describe('formatOption / dateParts', () => {
  it('adds a lowercase part', () => {
    expect(formatOption({ date: '2026-11-21', part: 'day' }, { today: '2026-11-10' })).toBe('Sat 21 Nov')
    expect(formatOption({ date: '2026-11-21', part: 'evening' }, { today: '2026-11-10' })).toBe('Sat 21 Nov, evening')
    expect(formatOption({ date: '2026-11-21', part: 'morning' }, { style: 'tiny' })).toBe('Sat 21, morning')
  })
  it('splits a date for tiles', () => {
    expect(dateParts('2026-11-21')).toEqual({ weekday: 'SAT', day: '21', month: 'Nov' })
  })
})

describe('formatTime', () => {
  it('formats 12-hour times', () => {
    expect(formatTime('13:30')).toBe('1:30pm')
    expect(formatTime('13:00')).toBe('1pm')
    expect(formatTime('00:15')).toBe('12:15am')
    expect(formatTime('12:00')).toBe('12pm')
    expect(formatTime('09:05')).toBe('9:05am')
  })
})

describe('listJoin / plural / labels', () => {
  it('joins names', () => {
    expect(listJoin([])).toBe('')
    expect(listJoin(['A'])).toBe('A')
    expect(listJoin(['A', 'B'])).toBe('A and B')
    expect(listJoin(['A', 'B', 'C'])).toBe('A, B and C')
  })
  it('plural', () => {
    expect(plural(1, 'day', 'days')).toBe('day')
    expect(plural(0, 'day', 'days')).toBe('days')
  })
  it('labels', () => {
    expect(ANSWER_LABELS.plan).toEqual({ free: 'Free', maybe: 'If need be', cant: "Can't" })
    expect(ANSWER_LABELS.rsvp).toEqual({ free: 'Going', maybe: 'Maybe', cant: 'Out' })
    expect(PART_LABELS.afternoon).toBe('Afternoon')
  })
})
