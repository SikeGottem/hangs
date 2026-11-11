// AnswerFlow: the calendar plus one big day. "I'm free" / "Can't" moves to the next blank day; tap any date to jump; the name comes last.
'use client'

import { Check, CircleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { cx, SaveStatus } from '@/components/ui'
import { formatOption, listJoin, PART_LABELS, weekdayLong } from '@/lib/format'
import { namesFor } from '@/lib/people'
import { dayColour, NIGHT } from '@/lib/poster'
import { parseDate } from '@/lib/dates'
import type { AnswerValue, ApiError, ApiResult, EventOption, EventState, JoinResponse, SaveStatus as SaveStatusValue } from '@/lib/types'
import { DayGrid, type DayCell } from './DayGrid'
import { NameForm } from './NameForm'
import { Poster, PosterButton, PosterLink } from './Poster'
import { TopBar } from './TopBar'

export interface AnswerFlowProps {
  state: EventState
  origin: string
  onState: (next: EventState) => void
  myAnswers: Record<string, AnswerValue>
  viewerIds: Set<string>
  setAnswer: (optionId: string, value: AnswerValue | null) => void
  setAnswers: (updates: Record<string, AnswerValue | null>) => void
  hasPerson: boolean
  needsName: boolean
  defaultName: string
  join: (name: string) => Promise<ApiResult<JoinResponse>>
  joinError: ApiError | null
  saveStatus: SaveStatusValue
  onRetry: () => void
  startOptionId?: string | null
  onFinished: () => void
  onShared?: (how: 'shared' | 'copied') => void
}

// How a whole date reads on the calendar when it has several parts.
function dateMark(values: Array<AnswerValue | undefined>): DayCell['mark'] {
  const given = values.filter((v): v is AnswerValue => !!v)
  if (given.length === 0) return null
  if (given.includes('free')) return 'free'
  if (given.includes('maybe')) return 'maybe'
  return 'cant'
}

function othersPhrase(names: string[], respondents: number): string {
  if (names.length === 0) return respondents === 0 ? "You're the first to answer" : 'No one else can yet'
  if (names.length === 1) return `Only ${names[0]} so far`
  if (names.length <= 5) return `${listJoin(names)} can`
  return `${listJoin(names.slice(0, 4))} and ${names.length - 4} others can`
}

export function AnswerFlow({
  state, origin, onState, myAnswers, viewerIds, setAnswer, setAnswers, hasPerson, needsName, defaultName, join, joinError,
  saveStatus, onRetry, startOptionId, onFinished, onShared,
}: AnswerFlowProps) {
  const future = useMemo(() => state.options.filter(o => !o.isPast), [state.options])
  const dates = useMemo(() => [...new Set(state.options.map(o => o.date))], [state.options])
  const firstBlank = future.find(o => !myAnswers[o.id])

  const [focusId, setFocusId] = useState<string | null>(startOptionId ?? firstBlank?.id ?? future[0]?.id ?? null)
  const [finishing, setFinishing] = useState(false)

  // A day removed by the organiser while it was on screen falls back to the next blank one.
  const current: EventOption | undefined = future.find(o => o.id === focusId) ?? firstBlank ?? future[0]

  // Finished once a saved person exists; a name is only asked for when one is really needed.
  useEffect(() => {
    if (finishing && hasPerson && saveStatus !== 'error') onFinished()
  }, [finishing, hasPerson, onFinished, saveStatus])

  if (!current) return null

  const go = (optionId: string) => {
    setFinishing(false)
    setFocusId(optionId)
  }

  const answer = (value: AnswerValue) => {
    const next = { ...myAnswers, [current.id]: value }
    setAnswer(current.id, value)
    const i = future.indexOf(current)
    const after = [...future.slice(i + 1), ...future.slice(0, i)].find(o => !next[o.id])
    if (after) go(after.id)
    else setFinishing(true)
  }

  const blanks = future.filter(o => !myAnswers[o.id])
  const freeForRest = () => {
    setAnswers(Object.fromEntries(blanks.map(o => [o.id, 'free' as const])))
    setFinishing(true)
  }

  const pickDate = (date: string) => {
    const options = future.filter(o => o.date === date)
    const target = options.find(o => !myAnswers[o.id]) ?? options[0]
    if (target) go(target.id)
  }

  const cell = (date: string): DayCell => {
    const options = state.options.filter(o => o.date === date)
    const live = options.filter(o => !o.isPast)
    const mark = dateMark(live.map(o => myAnswers[o.id]))
    const dots = Math.max(0, ...options.map(o => (state.tallies[o.id]?.free ?? []).filter(id => !viewerIds.has(id)).length))
    const answerWord = mark === 'free' ? 'you can' : mark === 'maybe' ? 'only if you have to' : mark === 'cant' ? "you can't" : 'not answered'
    return {
      mark,
      dots,
      active: !naming && date === current.date,
      disabled: live.length === 0,
      label: `${formatOption({ date, part: 'day' }, { today: state.today, style: 'long' })}, ${dots} others can, ${answerWord}`,
    }
  }

  const naming = finishing && needsName && !hasPerson
  const colour = naming ? NIGHT : dayColour(current.date)
  const value = myAnswers[current.id]
  const answered = future.length - blanks.length
  const tally = state.tallies[current.id]
  const others = namesFor(state, (tally?.free ?? []).filter(id => !viewerIds.has(id)))
  const partOptions = future.filter(o => o.date === current.date)
  const parts = state.event.mode === 'parts'
  const saveError = saveStatus === 'error'

  return (
    <Poster colour={colour}>
      <TopBar state={state} origin={origin} onState={onState} onShared={onShared} />
      <div className="mt-3 flex flex-1 flex-col lg:mt-10 lg:grid lg:grid-cols-2 lg:gap-16">
        <DayGrid
          dates={dates}
          cell={cell}
          onPick={pickDate}
          label="Your days. Tap a date to answer it."
          aside={`${answered} of ${future.length}`}
        />

        {naming ? (
          <div className="mt-7 flex flex-1 flex-col lg:mt-0">
            <NameForm organiserName={state.event.organiserName} defaultName={defaultName} join={join} joinError={joinError} />
          </div>
        ) : (
          <div className="flex flex-1 flex-col">
            <div className="flex flex-1 flex-col justify-center py-3">
              <h2 aria-live="polite" aria-atomic className="font-display font-extrabold">
                <span className="block text-weekday leading-none tracking-poster">{weekdayLong(current.date)}</span>
                <span className="block text-day leading-poster tracking-day tabular">{parseDate(current.date).day}</span>
                {parts && <span className="mt-2 block text-weekday leading-none tracking-poster">{PART_LABELS[current.part]}</span>}
              </h2>
              {parts && partOptions.length > 1 && (
                <div className="mt-1 flex gap-4">
                  {partOptions.map(o => (
                    <PosterLink key={o.id} onClick={() => go(o.id)} aria-current={o.id === current.id ? 'true' : undefined} className={cx('no-underline', o.id === current.id && 'font-extrabold underline')}>
                      {PART_LABELS[o.part]}
                    </PosterLink>
                  ))}
                </div>
              )}
              <p className="mt-2 text-h2 leading-snug font-medium text-pretty">{othersPhrase(others, state.ranking.respondentCount)}</p>
            </div>

            {saveError && (
              <div role="alert" className="mb-2 flex items-center justify-between gap-3 text-lg">
                <span className="inline-flex items-center gap-2"><CircleAlert aria-hidden size={20} />Couldn&apos;t save that.</span>
                <PosterLink onClick={onRetry} className="font-bold">Try again</PosterLink>
              </div>
            )}

            <div className="flex gap-2.5">
              <PosterButton
                kind={value === 'cant' ? 'solid' : 'outline'}
                icon={value === 'cant' ? Check : undefined}
                onClick={() => answer('cant')}
                aria-pressed={value === 'cant'}
                className="min-h-22 flex-1 whitespace-nowrap max-[359px]:px-2 max-[359px]:text-h2"
              >
                Can&apos;t
              </PosterButton>
              <PosterButton
                kind={value && value !== 'free' ? 'outline' : 'solid'}
                icon={value === 'free' ? Check : undefined}
                onClick={() => answer('free')}
                aria-pressed={value === 'free'}
                className="min-h-22 flex-1 whitespace-nowrap max-[359px]:px-2 max-[359px]:text-h2"
              >
                I&apos;m free
              </PosterButton>
            </div>
            <div className="mt-1 flex items-center justify-between gap-4">
              <PosterLink onClick={() => answer('maybe')} aria-pressed={value === 'maybe'} className={cx('whitespace-nowrap max-[359px]:text-md', value === 'maybe' && 'font-extrabold')}>
                {value === 'maybe' && <Check aria-hidden size={18} strokeWidth={3} className="mr-1" />}
                Only if I have to
              </PosterLink>
              {blanks.length >= 2 ? (
                <PosterLink onClick={freeForRest} className="whitespace-nowrap max-[359px]:text-md">Free for the rest</PosterLink>
              ) : (
                <SaveStatus status={saveStatus === 'error' || saveStatus === 'unsaved' ? 'idle' : saveStatus} />
              )}
            </div>
          </div>
        )}
      </div>
    </Poster>
  )
}
