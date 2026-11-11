// Polling policy tests: exponential error backoff with jitter and Retry-After, idle slow-down, error classes.
import { describe, expect, it } from 'vitest'
import { classifyPollError, pollDelay, POLL_FOCUSED_MS, POLL_MS } from './poll'

const mid = () => 0.5 // no jitter

describe('pollDelay', () => {
  it('uses the normal pace while things change', () => {
    expect(pollDelay({ failures: 0, unchanged: 0, focused: true, random: mid })).toBe(POLL_FOCUSED_MS)
    expect(pollDelay({ failures: 0, unchanged: 2, focused: false, random: mid })).toBe(POLL_MS)
  })

  it('slows down while nothing changes, capped at 30 s focused and 60 s unfocused', () => {
    const focused = [3, 4, 5, 6, 10].map(unchanged => pollDelay({ failures: 0, unchanged, focused: true, random: mid }))
    expect(focused).toEqual([9000, 13500, 20250, 30000, 30000])
    expect(pollDelay({ failures: 0, unchanged: 20, focused: false, random: mid })).toBe(60_000)
  })

  it('backs off exponentially from the first failure, with jitter, capped at 60 s', () => {
    expect([1, 2, 3, 4, 5, 9].map(failures => pollDelay({ failures, unchanged: 0, focused: true, random: mid })))
      .toEqual([6000, 12000, 24000, 48000, 60000, 60000])
    expect(pollDelay({ failures: 1, unchanged: 0, focused: true, random: () => 0 })).toBe(4500)
    expect(pollDelay({ failures: 1, unchanged: 0, focused: true, random: () => 1 })).toBe(7500)
  })

  it('never polls sooner than a Retry-After', () => {
    expect(pollDelay({ failures: 1, unchanged: 0, focused: true, retryAfterMs: 120_000, random: mid })).toBe(120_000)
  })
})

describe('classifyPollError', () => {
  it('404 stops polling; network, 5xx and 429 are failures; other 4xx are not', () => {
    const e = (status: number) => ({ code: 'bad_request' as const, message: '', status })
    expect(classifyPollError(e(404))).toBe('gone')
    for (const s of [0, 500, 503, 429]) expect(classifyPollError(e(s))).toBe('failure')
    for (const s of [400, 401, 403, 409]) expect(classifyPollError(e(s))).toBe('ignore')
  })
})
