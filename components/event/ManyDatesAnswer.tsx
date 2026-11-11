// ManyDatesAnswer: for plans with more than 7 dates, every day starts free; the guest taps only the days they can't do, then sends once.
'use client'

import { CircleAlert } from 'lucide-react'
import { useState } from 'react'
import { cx } from '@/components/ui'
import { formatDate } from '@/lib/format'
import { dayColour } from '@/lib/poster'
import type { AnswerValue, EventOption, EventState, SaveStatus as SaveStatusValue } from '@/lib/types'
import { DayGrid, type DayCell } from './DayGrid'
import { Poster, PosterButton, PosterFoot, PosterLink } from './Poster'
import { TopBar } from './TopBar'

// Above this many dates, one at a time gets tedious and the calendar is quicker.
export const MANY_DATES = 7

const NEXT: Record<AnswerValue, AnswerValue> = { free: 'cant', cant: 'maybe', maybe: 'free' }
const WORD: Record<AnswerValue, string> = { free: 'free', cant: "can't", maybe: 'only if I have to' }

export interface ManyDatesAnswerProps {
  state: EventState
  origin: string
  onState: (next: EventState) => void
  onShared?: (how: 'shared' | 'copied') => void
  options: EventOption[]                         // the future options, one per date
  myAnswers: Record<string, AnswerValue>
  saveStatus: SaveStatusValue
  onRetry: () => void
  onSend: (answers: Record<string, AnswerValue>) => void
}

function Swatch({ mark, children }: { mark: AnswerValue; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        aria-hidden
        className={cx(
          'inline-flex size-6 flex-col items-center justify-center rounded-sm border-2 border-current text-xs leading-none font-extrabold',
          mark === 'free' && 'bg-(--poster-fg) text-(--poster-bg)',
          mark === 'cant' && 'border-dashed line-through',
        )}
      >
        {mark === 'maybe' ? '?' : '5'}
      </span>
      {children}
    </span>
  )
}

export function ManyDatesAnswer({ state, origin, onState, onShared, options, myAnswers, saveStatus, onRetry, onSend }: ManyDatesAnswerProps) {
  // Nothing is saved until Send, so a day left alone never becomes a silent "free".
  const [draft, setDraft] = useState<Record<string, AnswerValue>>(() =>
    Object.fromEntries(options.map(o => [o.id, myAnswers[o.id] ?? 'free'])))

  const byDate = new Map(options.map(o => [o.date, o]))
  const dates = [...new Set(state.options.map(o => o.date))]
  const valueOf = (o: EventOption) => draft[o.id] ?? 'free'

  const n = options.length
  const free = options.filter(o => valueOf(o) === 'free').length
  const cant = options.filter(o => valueOf(o) === 'cant').length
  const maybe = options.filter(o => valueOf(o) === 'maybe').length
  const sendLabel = free === n ? `Free on all ${n}, send` : free === 0 && maybe === 0 ? "Can't do any, send" : `Free on ${free} of ${n}, send`
  const tally = [cant ? `${cant} can't` : '', maybe ? `${maybe} only if I have to` : ''].filter(Boolean).join(' · ')

  const cell = (date: string): DayCell => {
    const o = byDate.get(date)
    if (!o) return { label: `${formatDate(date, { today: state.today, style: 'long' })}, already gone`, disabled: true }
    const v = valueOf(o)
    return { mark: v, label: `${formatDate(date, { today: state.today, style: 'long' })}, ${WORD[v]}` }
  }

  const cycle = (date: string) => {
    const o = byDate.get(date)
    if (o) setDraft(d => ({ ...d, [o.id]: NEXT[d[o.id] ?? 'free'] }))
  }

  return (
    <Poster colour={dayColour(options[0].date)}>
      <TopBar state={state} origin={origin} onState={onState} onShared={onShared} />
      <div className="mt-4 flex flex-1 flex-col lg:mt-10 lg:grid lg:grid-cols-2 lg:items-start lg:gap-16">
        <div className="flex flex-col">
          <h2 className="text-display leading-none font-extrabold tracking-poster text-balance lg:text-4xl">Tap the days you can&apos;t do.</h2>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-md">
            <Swatch mark="free">Free</Swatch>
            <Swatch mark="cant">Can&apos;t</Swatch>
            <Swatch mark="maybe">Only if I have to</Swatch>
          </div>
          <p className="mt-2 text-md">Tap a day again to change it.</p>
        </div>

        <DayGrid
          className="mt-4 lg:mt-0"
          dates={dates}
          cell={cell}
          onPick={cycle}
          scroll={false}
          label="Your days. Tap a day you can't do."
          aside={`${n} dates`}
        />
      </div>

      <PosterFoot className="mt-5">
        {saveStatus === 'error' ? (
          <div role="alert" className="flex items-center justify-between gap-3 text-lg">
            <span className="inline-flex items-center gap-2"><CircleAlert aria-hidden size={20} />Couldn&apos;t save that.</span>
            <PosterLink onClick={onRetry} className="font-bold">Try again</PosterLink>
          </div>
        ) : (
          <p aria-live="polite" className="min-h-6 text-center text-lg font-extrabold">{tally}</p>
        )}
        <PosterButton className="w-full" onClick={() => onSend(Object.fromEntries(options.map(o => [o.id, valueOf(o)])))}>
          {sendLabel}
        </PosterButton>
      </PosterFoot>
    </Poster>
  )
}
