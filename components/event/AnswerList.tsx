// "Which days work for you?": identity line, fill-the-blanks shortcuts with Undo, and chronological DayRows (month / date headers, past days tucked away).
'use client'

import { CheckCheck, Undo2, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Chip, Disclosure, MonoLabel, useToast } from '@/components/ui'
import { formatDate, formatOption, MONTHS_LONG, plural } from '@/lib/format'
import type { AnswerValue, EventOption, EventState } from '@/lib/types'
import { DayRow } from './DayRow'
import { othersCount } from './hooks'
import { IdentityLine } from './IdentityLine'

export interface AnswerListProps {
  state: EventState
  myAnswers: Record<string, AnswerValue>
  myAnswerCount: number
  viewerIds: ReadonlySet<string>        // the viewer's person id and/or the 'local' overlay id
  setAnswer: (optionId: string, value: AnswerValue | null) => void
  setAnswers: (updates: Record<string, AnswerValue | null>) => void
  loading: boolean                      // returning visitor, first fetch not back yet
  personName: string | null             // set once a person exists (drives the identity line)
  rememberedName: string | null         // before a person exists: the name a first tap will answer as
  onNotMe: () => void                   // "Not you?": don't auto-join under the remembered name
  renaming: boolean
  onRenamingChange: (v: boolean) => void
  onState: (next: EventState) => void
  className?: string
}

function monthHeader(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number)
  return `${MONTHS_LONG[m - 1]} ${y}`.toUpperCase()
}

export function AnswerList({
  state, myAnswers, myAnswerCount, viewerIds, setAnswer, setAnswers, loading, personName, rememberedName, onNotMe, renaming,
  onRenamingChange, onState, className,
}: AnswerListProps) {
  const { toast } = useToast()
  // Latest answers for Undo closures that run after later taps.
  const answersRef = useRef(myAnswers)
  useEffect(() => { answersRef.current = myAnswers }, [myAnswers])
  const { options, tallies, ranking, event, today } = state
  const hero = ranking.hero
  const parts = event.mode === 'parts'
  const unit = (n: number) => (parts ? plural(n, 'slot', 'slots') : plural(n, 'day', 'days'))

  const future = options.filter(o => !o.isPast)
  const past = options.filter(o => o.isPast)
  const blanks = future.filter(o => !myAnswers[o.id])
  const expired = hero.kind === 'expired'
  const bestId = hero.kind === 'winner' || hero.kind === 'everyone' ? hero.optionIds[0] : null

  // The fill shortcuts confirm inline, where the chips were (a toast would cover the day rows and the name bar).
  const [lastFill, setLastFill] = useState<{ ids: string[]; value: AnswerValue } | null>(null)
  useEffect(() => {
    if (!lastFill) return
    const t = setTimeout(() => setLastFill(null), 10_000)
    return () => clearTimeout(t)
  }, [lastFill])
  const fill = (value: AnswerValue) => {
    if (blanks.length === 0) return
    const ids = blanks.map(o => o.id)
    setAnswers(Object.fromEntries(ids.map(id => [id, value])))
    setLastFill({ ids, value })
  }
  // Only rows that still hold what the shortcut set; anything changed since is left alone.
  const undoFill = () => {
    if (!lastFill) return
    const { ids, value } = lastFill
    setLastFill(null)
    setAnswers(Object.fromEntries(ids.filter(id => answersRef.current[id] === value).map(id => [id, null])))
  }

  // Tapping the selected answer clears it; say so, with an Undo, so a mis-tap isn't silent.
  const change = (o: EventOption, next: AnswerValue | null) => {
    const prev = myAnswers[o.id] ?? null
    setAnswer(o.id, next)
    if (next === null && prev) {
      toast({
        message: `Cleared ${formatOption(o, { today })}. No answer for that one now.`,
        action: { label: 'Undo', onClick: () => { if (!answersRef.current[o.id]) setAnswer(o.id, prev) } },
      })
    }
  }

  const row = (o: EventOption, readOnly = false) => {
    const t = tallies[o.id]
    const othersFree = t ? othersCount(t.free, viewerIds) : 0
    const othersAnswered = t ? othersFree + othersCount(t.maybe, viewerIds) + othersCount(t.cant, viewerIds) : 0
    return (
      <DayRow
        key={o.id}
        option={o}
        myValue={myAnswers[o.id] ?? null}
        othersFree={othersFree}
        othersAnswered={othersAnswered}
        isBest={o.id === bestId}
        onChange={v => change(o, v)}
        today={today}
        disabled={readOnly}
        loading={!readOnly && loading}
      />
    )
  }

  // Group future options by month, and by date within a month in parts mode.
  const multiMonth = new Set(future.map(o => o.date.slice(0, 7))).size > 1
  const months: Array<{ key: string; options: EventOption[] }> = []
  for (const o of future) {
    const key = o.date.slice(0, 7)
    const last = months[months.length - 1]
    if (last && last.key === key) last.options.push(o)
    else months.push({ key, options: [o] })
  }

  const renderGroup = (list: EventOption[], readOnly = false): ReactNode => {
    if (!parts) return <ul className="flex flex-col gap-2">{list.map(o => row(o, readOnly))}</ul>
    const byDate: Array<{ date: string; options: EventOption[] }> = []
    for (const o of list) {
      const last = byDate[byDate.length - 1]
      if (last && last.date === o.date) last.options.push(o)
      else byDate.push({ date: o.date, options: [o] })
    }
    return (
      <div className="flex flex-col gap-5">
        {byDate.map(g => (
          <section key={g.date} aria-label={formatDate(g.date, { today, style: 'long' })} className="flex flex-col gap-2">
            <h3 className="font-display text-h3 font-bold tracking-display text-ink">{formatDate(g.date, { today })}</h3>
            <ul className="flex flex-col gap-2">{g.options.map(o => row(o, readOnly))}</ul>
          </section>
        ))}
      </div>
    )
  }

  const heading = state.viewer.isOrganiser && myAnswerCount === 0 ? 'Now you: which days work?' : 'Which days work for you?'
  const pastDates = new Set(past.map(o => o.date)).size

  return (
    <section id="answer" aria-labelledby="answer-heading" className={className}>
      <div className="flex flex-col gap-1">
        <h2 id="answer-heading" className="font-display text-h2 leading-display font-bold tracking-display text-balance text-ink">
          {heading}
        </h2>
        {!expired && (
          <p className="text-sm text-pretty text-ink-3">Tap Free, If need be or Can&apos;t for each day. No sign-up, it saves as you go.</p>
        )}
      </div>

      {personName && (
        <div className="mt-1">
          <IdentityLine eventId={event.id} name={personName} editing={renaming} onEditingChange={onRenamingChange} onState={onState} />
        </div>
      )}
      {!personName && rememberedName && !expired && (
        <p className="mt-1 flex min-h-11 flex-wrap items-center gap-x-1 text-sm text-ink-2">
          <span className="min-w-0 truncate">
            Answering as <span className="font-semibold text-ink">{rememberedName}</span>
          </span>
          <span aria-hidden>·</span>
          <button
            type="button"
            onClick={onNotMe}
            className="-mx-1 inline-flex min-h-11 items-center rounded-sm px-1 font-semibold text-ink underline underline-offset-4"
          >
            Not you?
          </button>
        </p>
      )}

      {expired ? (
        <p className="mt-4 rounded-lg bg-sunken p-4 text-md text-pretty text-ink-2">{hero.detail}</p>
      ) : (
        <>
          {blanks.length > 0 && !loading && (
            // Short labels so both chips sit on one line at 320 px and the first day row stays above the fold.
            <div role="group" aria-label="Answer every blank day at once" className="mt-3 flex flex-wrap gap-2">
              <Chip icon={CheckCheck} onClick={() => fill('free')}>Free for all</Chip>
              <Chip icon={X} onClick={() => fill('cant')}>None work</Chip>
            </div>
          )}
          {blanks.length === 0 && lastFill && (
            <p role="status" className="mt-3 flex min-h-11 flex-wrap items-center gap-x-2 text-sm text-ink-2">
              <span>
                {lastFill.value === 'free'
                  ? `Marked ${lastFill.ids.length} ${unit(lastFill.ids.length)} free.`
                  : `Marked ${lastFill.ids.length} ${unit(lastFill.ids.length)} can't.`}
              </span>
              <button
                type="button"
                onClick={undoFill}
                className="-mx-1 inline-flex min-h-11 items-center gap-1 rounded-sm px-1 font-semibold text-ink underline underline-offset-4"
              >
                <Undo2 aria-hidden size={14} />
                Undo
              </button>
            </p>
          )}
          <div className="mt-4 flex flex-col gap-5">
            {months.map(m => (
              <div key={m.key} className="flex flex-col gap-2">
                {multiMonth && <MonoLabel as="h3" tone="ink-3" className="pt-1">{monthHeader(m.key)}</MonoLabel>}
                {renderGroup(m.options)}
              </div>
            ))}
          </div>
        </>
      )}

      {past.length > 0 && (
        <Disclosure
          className="mt-5"
          defaultOpen={expired}
          summary={<span className="text-ink-2">{pastDates} past {plural(pastDates, 'day', 'days')}</span>}
        >
          <div className="opacity-80">{renderGroup(past, true)}</div>
        </Disclosure>
      )}
    </section>
  )
}
