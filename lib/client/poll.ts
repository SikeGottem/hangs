// Pure polling policy for the event page: how long to wait before the next poll, and which errors count as failures.
import type { ApiError } from '../types'

export const POLL_FOCUSED_MS = 6000   // someone actively looking at the page sees a friend's answer land within seconds
export const POLL_MS = 15_000         // visible but not focused
const FOCUSED_IDLE_CAP_MS = 30_000
const IDLE_CAP_MS = 60_000
const ERROR_CAP_MS = 60_000

export interface PollDelayInput {
  failures: number          // consecutive real failures (network, 5xx, 429)
  unchanged: number         // consecutive polls that came back 304
  focused: boolean
  retryAfterMs?: number     // time left on a server Retry-After
  random?: () => number     // for tests
}

// Failures back off exponentially from the first one (6, 12, 24, 48, 60 s) with jitter so tabs do not retry in
// lockstep, and never sooner than a Retry-After. While nothing changes, polling slows by 1.5x per quiet poll after
// the third, up to 30 s focused / 60 s unfocused; any change, focus or visibility resets it (unchanged = 0).
export function pollDelay({ failures, unchanged, focused, retryAfterMs = 0, random = Math.random }: PollDelayInput): number {
  let ms: number
  if (failures > 0) {
    ms = Math.min(ERROR_CAP_MS, POLL_FOCUSED_MS * 2 ** (failures - 1)) * (0.75 + random() * 0.5)
  } else {
    const base = focused ? POLL_FOCUSED_MS : POLL_MS
    const cap = focused ? FOCUSED_IDLE_CAP_MS : IDLE_CAP_MS
    ms = Math.min(cap, base * 1.5 ** Math.max(0, unchanged - 2)) * (0.9 + random() * 0.2)
  }
  return Math.round(Math.max(ms, retryAfterMs))
}

// What a failed poll means: 'gone' (404: stop the timer), 'failure' (network, server or rate limit: back off and show
// the connection banner), or 'ignore' (another 4xx: the connection is fine, keep the normal pace).
export function classifyPollError(e: ApiError): 'gone' | 'failure' | 'ignore' {
  if (e.status === 404) return 'gone'
  if (e.status === 0 || e.status >= 500 || e.status === 429) return 'failure'
  return 'ignore'
}
