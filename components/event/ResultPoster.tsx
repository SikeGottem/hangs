// ResultPoster: the same calendar, each date showing how many can come; the big day is the best one (or the one tapped), with who's in and the organiser's lock button.
'use client'

import { CalendarPlus, KeyRound, Lock } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { CopyButton } from '@/components/ui'
import { EditDaysSheet } from '@/components/organiser/EditDaysSheet'
import { LockSheet } from '@/components/organiser/LockSheet'
import { useOrganiserKey } from '@/components/organiser/hooks'
import { parseDate } from '@/lib/dates'
import { formatDate, formatOption, listJoin, PART_LABELS, weekdayLong } from '@/lib/format'
import { namesFor } from '@/lib/people'
import { COBALT, dayColour } from '@/lib/poster'
import { organiserLink } from '@/lib/share'
import type { EventState, HeroKind, RankedOption } from '@/lib/types'
import { DayGrid, type DayCell } from './DayGrid'
import { EventFooter } from './EventFooter'
import { Poster, PosterButton, PosterLink } from './Poster'
import { TopBar } from './TopBar'

export interface ResultPosterProps {
  state: EventState
  origin: string
  onState: (next: EventState) => void
  viewerAnswered: boolean
  onChangeAnswers: (optionId: string | null) => void
  onShared?: (how: 'shared' | 'copied') => void
  identity?: ReactNode
}

const NO_ANSWER_YET: HeroKind[] = ['expired', 'empty', 'solo', 'none_free', 'wide_tie']
const sentence = (label: string) => label.charAt(0) + label.slice(1).toLowerCase()
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function ResultPoster({ state, origin, onState, viewerAnswered, onChangeAnswers, onShared, identity }: ResultPosterProps) {
  const { ranking, event, viewer, today } = state
  const { hero, respondentCount: R } = ranking
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [locking, setLocking] = useState(false)
  const [addingDays, setAddingDays] = useState(false)
  const organiserKey = useOrganiserKey(event.id)

  const dates = [...new Set(state.options.map(o => o.date))]
  const rankedLive = ranking.ranked.filter(o => !o.isPast)
  const top = ranking.ranked.find(o => o.optionId === hero.optionIds[0]) ?? rankedLive[0] ?? ranking.ranked[0]
  const picked = pickedId ? ranking.ranked.find(o => o.optionId === pickedId) : undefined
  const selected: RankedOption | undefined = picked ?? top
  if (!selected) return null

  const isTop = selected.optionId === top?.optionId
  const tally = state.tallies[selected.optionId]
  const free = namesFor(state, tally?.free ?? [])
  const maybe = namesFor(state, tally?.maybe ?? [])
  const cant = namesFor(state, tally?.cant ?? [])
  const none = tally?.none.length ?? 0
  const expired = hero.kind === 'expired'

  // One best option per date for the calendar.
  const bestFor = (date: string) => ranking.ranked.filter(o => o.date === date).sort((a, b) => a.rank - b.rank)[0]

  const cell = (date: string): DayCell => {
    const best = bestFor(date)
    const n = best?.free ?? 0
    return {
      mark: selected.date === date ? 'free' : null,
      active: selected.date === date,
      disabled: !best || best.isPast,
      ...(R > 6 ? { count: String(n) } : { dots: n, dotsOf: R }),
      label: `${formatDate(date, { today, style: 'long' })}, ${n} of ${R} can come`,
    }
  }

  const kicker = isTop
    ? sentence(hero.label)
    : 'Tap a day to compare'

  const showHeadline = isTop && NO_ANSWER_YET.includes(hero.kind)
  const countLine = showHeadline ? hero.headline : `${selected.free} of ${R} can come`
  const lines: string[] = showHeadline ? [hero.detail] : [
    free.length > 0 ? capitalise(listJoin(free)) : 'No one yet',
    [
      cant.length > 0 ? `${capitalise(listJoin(cant))} can't.` : '',
      maybe.length > 0 ? `${capitalise(listJoin(maybe))} only if needed.` : '',
      none > 0 ? `${none} not answered.` : '',
    ].filter(Boolean).join(' '),
  ].filter(Boolean)
  const tie = isTop && hero.kind === 'tie'

  const colour = expired ? COBALT : dayColour(selected.date)
  const lockLabel = `Lock in ${formatOption(selected, { today, style: 'tiny' })}`
  const canLock = viewer.isOrganiser && !expired && R >= 2 && !selected.isPast

  return (
    <Poster colour={colour}>
      <TopBar state={state} origin={origin} onState={onState} onShared={onShared} kicker={kicker} />
      <div className="mt-3 flex flex-1 flex-col lg:mt-10 lg:grid lg:grid-cols-2 lg:gap-16">
        <div className="flex flex-col gap-3">
          <DayGrid
            dates={dates}
            cell={cell}
            onPick={d => {
              const best = bestFor(d)
              if (best) setPickedId(best.optionId)
            }}
            label="All days. Tap a date to see who can come."
            aside={`${R} answered`}
          />
          {state.event.mode === 'parts' && (
            <div className="flex gap-4">
              {ranking.ranked.filter(o => o.date === selected.date).sort((a, b) => a.part.localeCompare(b.part)).map(o => (
                <PosterLink key={o.optionId} onClick={() => setPickedId(o.optionId)} className={o.optionId === selected.optionId ? 'font-extrabold' : 'no-underline'}>
                  {`${PART_LABELS[o.part]} ${o.free}`}
                </PosterLink>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col">
          <div className="flex flex-1 flex-col justify-center py-3">
            {!expired && (
              <h2 className="font-display font-extrabold">
                <span className="block text-weekday leading-none tracking-poster">{weekdayLong(selected.date)}</span>
                <span className="block text-day-sm leading-poster tracking-day tabular">{parseDate(selected.date).day}</span>
              </h2>
            )}
            <p className="mt-2 text-display leading-tight font-extrabold tracking-display text-balance">{tie ? hero.headline : countLine}</p>
            {lines.map(l => <p key={l} className="mt-1 text-h2 leading-snug font-medium text-pretty break-words">{l}</p>)}
          </div>

          <div className="flex flex-col gap-1">
            {expired && viewer.isOrganiser && (
              <PosterButton icon={CalendarPlus} onClick={() => setAddingDays(true)}>Add new days</PosterButton>
            )}
            {canLock && <PosterButton icon={Lock} onClick={() => setLocking(true)}>{lockLabel}</PosterButton>}
            <div className="flex flex-wrap items-center justify-between gap-x-4">
              {!expired && (
                <PosterLink onClick={() => onChangeAnswers(selected.isPast ? null : selected.optionId)}>
                  {viewerAnswered ? 'Change my answers' : 'Add my answers'}
                </PosterLink>
              )}
              {viewer.isOrganiser && organiserKey && origin && (
                <CopyButton variant="ghost" icon={KeyRound} text={organiserLink(origin, event.id, organiserKey)} label="Organiser link" className="-mr-4" />
              )}
            </div>
            {identity}
          </div>
        </div>
      </div>
      <EventFooter className="mt-3" />

      <LockSheet open={locking} onClose={() => setLocking(false)} state={state} onState={onState} mode="lock" preselect={selected.optionId} />
      {viewer.isOrganiser && <EditDaysSheet open={addingDays} onClose={() => setAddingDays(false)} state={state} onState={onState} />}
    </Poster>
  )
}
