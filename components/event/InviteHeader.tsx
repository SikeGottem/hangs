// Invitation header: who is planning, the title, the note and a mono day / answer count line.
import { MonoLabel } from '@/components/ui'
import { plural } from '@/lib/format'
import { LOCAL_PERSON_ID } from '@/lib/state'
import type { EventState } from '@/lib/types'

export function InviteHeader({ state }: { state: EventState }) {
  const { event, options, people, viewer } = state
  const dates = new Set(options.map(o => o.date)).size
  // Saved answers only: the viewer's held, not-yet-saved answers (the 'local' overlay) aren't counted here.
  const R = people.filter(p => p.id !== LOCAL_PERSON_ID && p.answeredCount > 0).length
  const meta = [
    `${dates} ${plural(dates, 'DAY', 'DAYS')}`,
    event.mode === 'parts' ? '3 PARTS EACH' : null,
    R === 0 ? 'NO ANSWERS YET' : `${R} ANSWERED`,
  ].filter(Boolean).join(' · ')

  return (
    <header className="flex flex-col gap-2">
      <MonoLabel as="p" tone="ink-3">
        {viewer.isOrganiser ? "YOU'RE PLANNING" : `${event.organiserName.toUpperCase()} IS PLANNING`}
      </MonoLabel>
      <h1 id="invite-title" tabIndex={-1} className="font-display text-2xl leading-display font-extrabold tracking-display text-balance text-ink break-words sm:text-3xl">
        {event.title}
      </h1>
      {event.note && <p className="text-md text-pretty text-ink-2 break-words">{event.note}</p>}
      <p className="mono-label tabular text-ink-3">{meta}</p>
    </header>
  )
}
