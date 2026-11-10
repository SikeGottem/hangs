// OrganiserMenu: Settings2 button opening the "Organiser tools" sheet (details, days, answers, organiser link, lock).
'use client'

import { CalendarDays, KeyRound, Lock, Pencil, Settings2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button, CopyButton, IconButton, MonoLabel, Sheet, useOrigin } from '@/components/ui'
import { formatTime, plural } from '@/lib/format'
import { organiserLink } from '@/lib/share'
import { EditDaysSheet } from './EditDaysSheet'
import { EditDetailsForm } from './EditDetailsForm'
import { optionLabel, useOrganiserKey } from './hooks'
import type { OrganiserBaseProps } from './LockCta'
import { LockSheet } from './LockSheet'
import { ResponsesManager } from './ResponsesManager'
import { UnlockControl } from './UnlockControl'

export type OrganiserMenuProps = OrganiserBaseProps

type Open = 'menu' | 'days' | 'lock' | 'lock-new' | null

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-line pt-5 first:border-t-0 first:pt-1">
      <MonoLabel as="h3" tone="ink-3">{label}</MonoLabel>
      {children}
    </section>
  )
}

export function OrganiserMenu({ state, onState }: OrganiserMenuProps) {
  const [open, setOpen] = useState<Open>(null)
  const origin = useOrigin()
  const key = useOrganiserKey(state.event.id)
  if (!state.viewer.isOrganiser) return null

  const lock = state.event.lock
  const dates = new Set(state.options.map(o => o.date)).size
  const parts = state.event.mode === 'parts'
  const close = () => setOpen(null)

  return (
    <>
      <IconButton icon={Settings2} label="Organiser tools" onClick={() => setOpen('menu')} />

      <Sheet open={open === 'menu'} onClose={close} title="Organiser tools">
        {open === 'menu' && (
          <div className="flex flex-col gap-5">
            <Section label="DETAILS">
              <EditDetailsForm state={state} onState={onState} />
            </Section>

            <Section label="DAYS">
              <p className="text-md text-ink-2">
                {dates} {plural(dates, 'day', 'days')} on the table{parts ? ', 3 parts each' : ''}.
              </p>
              <Button variant="secondary" iconLeft={CalendarDays} onClick={() => setOpen('days')} className="self-start">
                Add or remove days
              </Button>
            </Section>

            <Section label="ANSWERS">
              <ResponsesManager state={state} onState={onState} />
            </Section>

            <Section label="ORGANISER LINK">
              <p className="text-md text-ink-2">
                Keep this private. It lets you manage this plan from another phone or laptop.
              </p>
              {key && origin ? (
                <CopyButton
                  text={organiserLink(origin, state.event.id, key)}
                  label="Copy organiser link"
                  icon={KeyRound}
                  className="self-start"
                />
              ) : (
                <p className="text-sm text-ink-3">This device doesn&apos;t have the organiser link saved. Open it from the device you made the plan on.</p>
              )}
            </Section>

            {!lock && (
              <Section label="LOCK">
                <p className="text-md text-ink-2">Already know the day? You can lock it in now, even before anyone answers.</p>
                <Button variant="secondary" iconLeft={Lock} onClick={() => setOpen('lock-new')} className="self-start">
                  Lock a day
                </Button>
              </Section>
            )}

            {lock && (
              <Section label="LOCK">
                <p className="text-md text-ink">
                  {optionLabel(lock, state.today)}, {lock.time ? formatTime(lock.time) : 'time TBC'}
                  {lock.place ? ` at ${lock.place}` : ''}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" iconLeft={Pencil} onClick={() => setOpen('lock')}>
                    Change time or place
                  </Button>
                  <UnlockControl state={state} onState={onState} onDone={close} />
                </div>
              </Section>
            )}
          </div>
        )}
      </Sheet>

      <EditDaysSheet open={open === 'days'} onClose={close} state={state} onState={onState} />
      <LockSheet open={open === 'lock'} onClose={close} state={state} onState={onState} mode="edit" />
      {!lock && <LockSheet open={open === 'lock-new'} onClose={close} state={state} onState={onState} mode="lock" />}
    </>
  )
}
