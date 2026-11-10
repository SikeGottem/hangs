// Who has answered (respondents in people order) plus a "Copy a nudge" message for the group chat. In the locked view
// the list is left to "Who's coming" and the nudge only shows when someone has not answered for the locked day.
'use client'

import { Megaphone } from 'lucide-react'
import { CopyButton, MonoLabel, PersonChip } from '@/components/ui'
import { buildLockedNudgeMessage, buildNudgeMessage, eventUrl, lockedEventUrl } from '@/lib/share'
import { LOCAL_PERSON_ID } from '@/lib/state'
import type { EventState } from '@/lib/types'

export interface RespondentsProps {
  state: EventState
  viewerIds: ReadonlySet<string>
  origin: string
  showNudge?: boolean
  className?: string
}

export function Respondents({ state, viewerIds, origin, showNudge = true, className }: RespondentsProps) {
  // Saved people only: answers held before a name is saved never reach the shared state (see useEvent).
  const respondents = state.people.filter(p => p.answeredCount > 0 && p.id !== LOCAL_PERSON_ID)
  const R = respondents.length
  if (respondents.length === 0) return null
  const lock = state.event.lock
  // Locked: "Who's coming" already lists everyone, so no second list here. A nudge only when it is known that
  // someone who joined has not answered for the locked day (people who never opened the link cannot be known).
  const unansweredLocked = state.attendance?.none.length ?? 0
  if (lock && (!showNudge || unansweredLocked === 0)) return null
  // Planning: chase answers. Locked: chase RSVPs for the locked day, with the going count and who's still to answer.
  const nudge = !origin
    ? ''
    : lock
      ? buildLockedNudgeMessage(state).textWithUrl(lockedEventUrl(origin, state.event.id, lock.lockedAt))
      : buildNudgeMessage(state).textWithUrl(eventUrl(origin, state.event.id))

  return (
    <section aria-labelledby={lock ? undefined : 'respondents-heading'} aria-label={lock ? 'Nudge' : undefined} className={className}>
      {!lock && (
        <>
          <MonoLabel as="h2" id="respondents-heading" tone="ink-2" className="tabular">ANSWERED · {R}</MonoLabel>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {respondents.map(p => (
              <li key={p.id} className="max-w-full">
                <PersonChip name={p.name} isYou={viewerIds.has(p.id)} isOrganiser={p.isOrganiser} />
              </li>
            ))}
          </ul>
        </>
      )}
      {showNudge && nudge && R > 0 && (
        <div className={lock ? 'flex flex-wrap items-center gap-x-3 gap-y-2' : 'mt-4 flex flex-wrap items-center gap-x-3 gap-y-2'}>
          <p className="text-sm text-ink-2">
            {lock ? `${unansweredLocked} ${unansweredLocked === 1 ? "hasn't" : "haven't"} answered for this day yet.` : 'Missing someone?'}
          </p>
          <CopyButton variant="secondary" icon={Megaphone} text={nudge} label="Copy a nudge" />
        </div>
      )}
    </section>
  )
}
