// Small date/time helpers shared across the respond flow and the results page.
// No deps — pure functions, safe to import anywhere.

export type DeadlineInfo = {
  text: string       // e.g. "closes in 6h"
  urgent: boolean    // <24h remaining
  closed: boolean    // deadline passed
}

// Format a YYYY-MM-DD response deadline as a human-readable countdown.
// Returns null if no deadline is set.
export function formatDeadline(dateStr: string | null | undefined): DeadlineInfo | null {
  if (!dateStr) return null
  // Treat the deadline as end-of-day on the given date.
  const deadline = new Date(dateStr + 'T23:59:59')
  const diff = deadline.getTime() - Date.now()
  if (diff <= 0) return { text: 'responses closed', urgent: false, closed: true }
  const hours = diff / 3600000
  const days = Math.floor(hours / 24)
  if (days >= 2) return { text: `closes in ${days}d`, urgent: false, closed: false }
  if (days === 1) return { text: `closes tomorrow`, urgent: false, closed: false }
  if (hours >= 1) return { text: `closes in ${Math.floor(hours)}h`, urgent: true, closed: false }
  const mins = Math.max(1, Math.floor(diff / 60000))
  return { text: `closes in ${mins}m`, urgent: true, closed: false }
}
