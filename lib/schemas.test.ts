// Regression coverage for mutation schemas that protect stored calendar dates.
import { describe, expect, it } from 'vitest'
import { CreateHangSchema, EditHangSchema } from './schemas'

const baseHang = {
  name: 'Friday dinner',
  creatorName: 'Ethan',
  dateMode: 'range' as const,
  dateRangeStart: '2026-08-28',
  dateRangeEnd: '2026-08-30',
  duration: 2,
}

describe('calendar-date schemas', () => {
  it('accepts real dates, including leap day', () => {
    expect(CreateHangSchema.safeParse({
      ...baseHang,
      dateRangeStart: '2028-02-29',
      dateRangeEnd: '2028-03-01',
    }).success).toBe(true)
  })

  it('rejects impossible dates on create and edit', () => {
    expect(CreateHangSchema.safeParse({ ...baseHang, dateRangeStart: '2026-02-31' }).success).toBe(false)
    expect(EditHangSchema.safeParse({
      dateMode: 'range',
      dateRangeStart: '2026-02-31',
      dateRangeEnd: '2026-03-02',
    }).success).toBe(false)
  })
})
