// Pure link-preview copy (og:title / description) for a hang, branching on planning versus locked.
import type { EventSummary } from '@/lib/types'

export function eventPreviewCopy(s: EventSummary): { ogTitle: string; description: string } {
  if (s.lock) {
    const when = `${s.lock.label}, ${s.lock.timeLabel ?? 'time TBC'}${s.lock.place ? ` at ${s.lock.place}` : ''}`
    const going = s.lock.going > 0 ? ` ${s.lock.going} going.` : ''
    return {
      ogTitle: `${s.title}: ${s.lock.label}`,
      description: `It's on: ${when}.${going} Tap for details and add it to your calendar.`,
    }
  }
  const answered = s.respondentCount > 0 ? ` ${s.respondentCount} answered so far.` : ''
  return {
    ogTitle: `${s.title}: pick your days`,
    description: `${s.organiserName} is finding a day. Tap the days you're free, takes 20 seconds, no sign-up.${answered}`,
  }
}

// The page URL a share points at (relative to metadataBase): locked shares carry ?l={lockedAt} as a cache-buster.
// Same shapes as lib/share's eventUrl / lockedEventUrl.
export const pageUrl = (id: string, lockedAt: number | null) => (lockedAt ? `/h/${id}?l=${lockedAt}` : `/h/${id}`)
