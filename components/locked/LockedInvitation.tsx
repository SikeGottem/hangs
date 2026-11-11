// LockedInvitation: the plan is on. The whole page is the locked day's poster: date, time, place, Going/Maybe/Out, add to calendar, who's coming.
'use client'

import { CalendarPlus, Check, Clock, MapPin, Pencil, Share2, StickyNote } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useEffect, useState, type ReactNode } from 'react'
import { Button, cx, SaveStatus, useToast } from '@/components/ui'
import type { OrganiserBaseProps } from '@/components/organiser'
import { EventFooter } from '@/components/event/EventFooter'
import { NameForm } from '@/components/event/NameForm'
import { Poster, PosterButton } from '@/components/event/Poster'
import { TopBar } from '@/components/event/TopBar'
import { parseDate } from '@/lib/dates'
import { ANSWER_LABELS, formatTime, MONTHS_LONG, PART_LABELS, weekdayLong } from '@/lib/format'
import { dayColour, NIGHT } from '@/lib/poster'
import { buildLockedMessage, lockedEventUrl, shareOrCopy } from '@/lib/share'
import type { AnswerValue, ApiError, ApiResult, JoinResponse, SaveStatus as SaveStatusValue } from '@/lib/types'
import { Attendance } from './Attendance'

// Loaded on demand: the organiser's controls only for the organiser, the calendar sheet only once someone taps it.
const LockSheet = dynamic(() => import('@/components/organiser/LockSheet').then(m => m.LockSheet), { ssr: false })
const UnlockControl = dynamic(() => import('@/components/organiser/UnlockControl').then(m => m.UnlockControl), { ssr: false })
const AddToCalendarSheet = dynamic(() => import('./AddToCalendarSheet').then(m => m.AddToCalendarSheet), { ssr: false })

export interface LockedInvitationProps extends OrganiserBaseProps {
  origin: string
  viewerAnswer: AnswerValue | null
  onAnswer: (value: AnswerValue | null) => void
  saveStatus: SaveStatusValue
  needsName: boolean
  defaultName: string
  join: (name: string) => Promise<ApiResult<JoinResponse>>
  joinError: ApiError | null
}

function Detail({ icon: Icon, children }: { icon: typeof Clock; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-h2 leading-snug font-medium">
      <Icon aria-hidden size={22} strokeWidth={2.5} className="mt-0.5 shrink-0" />
      <span className="min-w-0 break-words">{children}</span>
    </li>
  )
}

const CHOICES: AnswerValue[] = ['cant', 'maybe', 'free']

export function LockedInvitation({ state, origin, onState, viewerAnswer, onAnswer, saveStatus, needsName, defaultName, join, joinError }: LockedInvitationProps) {
  const { toast } = useToast()
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [calendarUsed, setCalendarUsed] = useState(false)
  // Fetch the calendar sheet's code once the page has settled, so the first tap opens it straight away.
  useEffect(() => {
    const t = setTimeout(() => { void import('./AddToCalendarSheet') }, 2000)
    return () => clearTimeout(t)
  }, [])
  const [editOpen, setEditOpen] = useState(false)
  const { event, viewer, today } = state
  const lock = event.lock
  if (!lock) return null

  const { year, month0, day } = parseDate(lock.date)
  const timeText = lock.time ? formatTime(lock.time) : lock.part === 'day' ? 'Time TBC' : `${PART_LABELS[lock.part]}, time TBC`
  const otherYear = String(year) !== today.slice(0, 4)

  async function share() {
    const msg = buildLockedMessage(state)
    const result = await shareOrCopy({ title: event.title, text: msg.text, url: lockedEventUrl(window.location.origin, event.id, lock!.lockedAt) })
    if (result === 'copied') toast({ message: 'Copied. Paste it in the chat.' })
    else if (result === 'failed') toast({ message: "Couldn't share. Copy the link from the address bar instead.", tone: 'error' })
  }

  if (needsName) {
    return (
      <Poster colour={NIGHT}>
        <TopBar state={state} origin={origin} onState={onState} kicker="It's on" />
        <div className="mt-8 flex flex-1 flex-col">
          <NameForm organiserName={event.organiserName} defaultName={defaultName} join={join} joinError={joinError} heading="Who should we put down?" submitLabel="Save" />
        </div>
      </Poster>
    )
  }

  return (
    <Poster colour={dayColour(lock.date)}>
      <TopBar state={state} origin={origin} onState={onState} kicker={viewer.isOrganiser ? "It's on" : `It's on · ${event.organiserName}'s hang`} />
      <article aria-labelledby="locked-title" className="mt-5 flex flex-1 flex-col gap-7 lg:mt-10 lg:grid lg:grid-cols-2 lg:gap-16">
        <div className="flex flex-col gap-5">
          <h2 id="locked-title" tabIndex={-1} className="font-display font-extrabold outline-none">
            <span className="block text-weekday leading-none tracking-poster">{weekdayLong(lock.date)}</span>
            <span className="block text-day leading-poster tracking-day tabular">{day}</span>
            <span className="mt-2 block text-weekday leading-none tracking-poster">{MONTHS_LONG[month0]}{otherYear ? ` ${year}` : ''}</span>
          </h2>
          <ul className="flex flex-col gap-2">
            <Detail icon={Clock}>{timeText}</Detail>
            {lock.place && <Detail icon={MapPin}>{lock.place}</Detail>}
            {event.note && <Detail icon={StickyNote}>{event.note}</Detail>}
          </ul>
        </div>

        <div className="flex flex-col gap-7">
          <section aria-labelledby="rsvp-heading" className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h3 id="rsvp-heading" className="text-display font-extrabold tracking-display">Are you in?</h3>
              <SaveStatus status={saveStatus} />
            </div>
            <div role="group" aria-label="Your answer" className="grid grid-cols-3 gap-2">
              {CHOICES.map(v => {
                const on = viewerAnswer === v
                return (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onAnswer(on ? null : v)}
                    className={cx(
                      'inline-flex min-h-16 items-center justify-center gap-1.5 rounded-lg border-3 border-current text-lg font-extrabold transition duration-(--dur-fast) active:scale-[0.98]',
                      on && 'bg-(--poster-fg)',
                    )}
                  >
                    <span className={cx('inline-flex items-center gap-1.5', on && 'text-(--poster-bg)')}>
                      {on && <Check aria-hidden size={18} strokeWidth={3} />}
                      {ANSWER_LABELS.rsvp[v]}
                    </span>
                  </button>
                )
              })}
            </div>
            <PosterButton icon={CalendarPlus} onClick={() => { setCalendarUsed(true); setCalendarOpen(true) }}>Add to calendar</PosterButton>
          </section>

          <Attendance state={state} />

          <div className="flex flex-col gap-2">
            <PosterButton kind="outline" size="md" icon={Share2} onClick={() => void share()}>Tell the group</PosterButton>
            {viewer.isOrganiser && (
              <div className="flex flex-wrap items-start gap-2">
                <Button variant="ghost" iconLeft={Pencil} onClick={() => setEditOpen(true)}>Change time or place</Button>
                <UnlockControl state={state} onState={onState} />
              </div>
            )}
          </div>
        </div>
      </article>
      <EventFooter className="mt-6" />

      {calendarUsed && <AddToCalendarSheet open={calendarOpen} onClose={() => setCalendarOpen(false)} state={state} />}
      {viewer.isOrganiser && <LockSheet open={editOpen} onClose={() => setEditOpen(false)} state={state} onState={onState} mode="edit" />}
    </Poster>
  )
}
