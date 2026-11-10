// LockedInvitation: the locked-day invitation: stamp, date block, Going/Maybe/Out answer, add to calendar, attendance, share.
'use client'

import { CalendarPlus, Clock, MapPin, Pencil, Share2, StickyNote } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { AnswerControl, Button, Card, SaveStatus, useToast } from '@/components/ui'
import type { OrganiserBaseProps } from '@/components/organiser'
import { LockSheet } from '@/components/organiser/LockSheet'
import { UnlockControl } from '@/components/organiser/UnlockControl'
import { formatOption, formatTime, MONTHS_LONG, PART_LABELS, weekdayLong } from '@/lib/format'
import { buildLockedMessage, lockedEventUrl, shareOrCopy } from '@/lib/share'
import type { AnswerValue, SaveStatus as SaveStatusValue } from '@/lib/types'
import { AddToCalendarSheet } from './AddToCalendarSheet'
import { Attendance } from './Attendance'

export interface LockedInvitationProps extends OrganiserBaseProps {
  viewerAnswer: AnswerValue | null
  onAnswer: (value: AnswerValue | null) => void
  saveStatus: SaveStatusValue
  accent: boolean
}

function Detail({ icon: Icon, children }: { icon: typeof Clock; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-base text-ink">
      <Icon aria-hidden size={18} className="mt-0.5 shrink-0 text-ink-2" />
      <span className="min-w-0 break-words">{children}</span>
    </li>
  )
}

export function LockedInvitation({ state, onState, viewerAnswer, onAnswer, saveStatus, accent }: LockedInvitationProps) {
  const { toast } = useToast()
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const { event, viewer, today } = state
  const lock = event.lock
  if (!lock) return null

  const [y, m, d] = lock.date.split('-').map(Number)
  const dayMonth = `${d} ${MONTHS_LONG[m - 1]}${String(y) !== today.slice(0, 4) ? ` ${y}` : ''}`
  const timeText = lock.time
    ? formatTime(lock.time)
    : lock.part === 'day'
      ? 'Time TBC'
      : `${PART_LABELS[lock.part]}, time TBC`
  const L = formatOption(lock, { today })
  const owner = viewer.isOrganiser ? 'YOUR HANG' : `${event.organiserName.toUpperCase()}'S HANG`
  const calendarVariant = accent ? 'accent' : viewerAnswer === 'cant' ? 'secondary' : 'primary'

  async function share() {
    const msg = buildLockedMessage(state)
    const result = await shareOrCopy({
      title: event.title,
      text: msg.text,
      url: lockedEventUrl(window.location.origin, event.id, lock!.lockedAt),
    })
    if (result === 'copied') toast({ message: 'Copied. Paste it in the chat.' })
    else if (result === 'failed') toast({ message: "Couldn't share. Copy the link from the address bar instead.", tone: 'error' })
  }

  return (
    <article aria-labelledby="locked-title" className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="mono-label inline-block animate-stamp rounded-sm bg-ink px-2 py-1 text-white">IT&apos;S ON</span>
          <span className="mono-label min-w-0 truncate text-ink-2">{owner}</span>
        </div>
        <h1 id="locked-title" tabIndex={-1} className="font-display text-2xl leading-display font-extrabold tracking-display text-balance text-ink break-words sm:text-3xl">
          {event.title}
        </h1>
      </header>

      <Card padding="lg" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="mono-label text-ink-2">{weekdayLong(lock.date).toUpperCase()}</span>
          <p className="font-display text-date leading-none font-extrabold tracking-display text-ink">
            <time dateTime={lock.time ? `${lock.date}T${lock.time}` : lock.date}>{dayMonth}</time>
          </p>
        </div>
        <ul className="flex flex-col gap-2 border-t border-line pt-4">
          <Detail icon={Clock}>{timeText}</Detail>
          {lock.place && <Detail icon={MapPin}>{lock.place}</Detail>}
          {event.note && <Detail icon={StickyNote}>{event.note}</Detail>}
        </ul>
      </Card>

      <section aria-labelledby="rsvp-heading" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          {viewerAnswer === null && <span className="mono-label text-ink">ANSWER THIS ONE</span>}
          {/* The save status sits beside the heading, so no blank row is reserved between the answer and the button. */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h2 id="rsvp-heading" className="font-display text-h2 font-bold tracking-display text-ink">Are you in?</h2>
            <SaveStatus status={saveStatus} />
          </div>
        </div>
        <AnswerControl
          value={viewerAnswer}
          onChange={onAnswer}
          label={`Your answer for ${L}`}
          vocabulary="rsvp"
          size="large"
        />
        <Button variant={calendarVariant} size="lg" fullWidth iconLeft={CalendarPlus} onClick={() => setCalendarOpen(true)}>
          Add to calendar
        </Button>
      </section>

      <Attendance state={state} />

      <div className="flex flex-col gap-2">
        <Button variant="secondary" fullWidth iconLeft={Share2} onClick={() => void share()}>
          Share the plan
        </Button>
        {viewer.isOrganiser && (
          <div className="flex flex-wrap items-start gap-2">
            <Button variant="ghost" iconLeft={Pencil} onClick={() => setEditOpen(true)}>
              Change time or place
            </Button>
            <UnlockControl state={state} onState={onState} />
          </div>
        )}
      </div>

      <AddToCalendarSheet open={calendarOpen} onClose={() => setCalendarOpen(false)} state={state} />
      {viewer.isOrganiser && (
        <LockSheet open={editOpen} onClose={() => setEditOpen(false)} state={state} onState={onState} mode="edit" />
      )}
    </article>
  )
}
