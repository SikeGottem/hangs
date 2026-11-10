// LockCta: the organiser's call to action inside the hero: "Add new days" when every day has passed, else lock a day.
'use client'

import { CalendarPlus, Lock } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui'
import type { EventState } from '@/lib/types'
import { EditDaysSheet } from './EditDaysSheet'
import { optionLabel } from './hooks'
import { LockSheet } from './LockSheet'

export interface OrganiserBaseProps { state: EventState; onState: (next: EventState) => void }
export interface LockCtaProps extends OrganiserBaseProps { emphasis: 'accent' | 'secondary' }

export function LockCta({ state, onState, emphasis }: LockCtaProps) {
  const [open, setOpen] = useState(false)
  const { hero, respondentCount } = state.ranking
  if (!state.viewer.isOrganiser || state.event.lock) return null

  if (hero.kind === 'expired') {
    return (
      <>
        <Button variant={emphasis} fullWidth iconLeft={CalendarPlus} onClick={() => setOpen(true)} className="mt-4">
          Add new days
        </Button>
        <EditDaysSheet open={open} onClose={() => setOpen(false)} state={state} onState={onState} />
      </>
    )
  }

  if (respondentCount === 0) return null

  const top = state.options.find(o => o.id === hero.optionIds[0])
  const label = (hero.kind === 'winner' || hero.kind === 'everyone') && top
    ? `Lock in ${optionLabel(top, state.today)}`
    : 'Pick a day to lock'

  // With only one answer in, locking is possible but shouldn't look like the next step.
  const quiet = hero.kind === 'solo'

  return (
    <>
      <Button
        variant={quiet ? 'ghost' : emphasis}
        fullWidth={!quiet}
        iconLeft={Lock}
        onClick={() => setOpen(true)}
        className={quiet ? 'mt-2 -ml-4' : 'mt-4'}
      >
        {label}
      </Button>
      <LockSheet open={open} onClose={() => setOpen(false)} state={state} onState={onState} mode="lock" />
    </>
  )
}
