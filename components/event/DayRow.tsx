// One answerable day row: weekday + date (or part of day), BEST tag, others-free count and the Free / If need be / Can't control.
'use client'

import { Users } from 'lucide-react'
import { AnswerControl, cx, Skeleton } from '@/components/ui'
import { dateParts, formatOption, PART_LABELS } from '@/lib/format'
import type { AnswerValue, EventOption } from '@/lib/types'

export interface DayRowProps {
  option: EventOption
  myValue: AnswerValue | null
  othersFree: number
  othersAnswered: number
  isBest: boolean
  onChange: (next: AnswerValue | null) => void
  today?: string        // for the year suffix in the control's label
  disabled?: boolean    // read-only (past days)
  loading?: boolean     // returning visitor before the first fetch: disabled with a skeleton overlay
}

export function DayRow({ option, myValue, othersFree, othersAnswered, isBest, onChange, today, disabled, loading }: DayRowProps) {
  const { weekday, day, month } = dateParts(option.date)
  const isPart = option.part !== 'day'
  const struck = myValue === 'cant'
  const label = formatOption(option, { today })

  return (
    <li
      className={cx(
        'grid gap-2.5 rounded-lg border p-3 transition-colors duration-(--dur-fast)',
        'min-[480px]:min-h-19 min-[480px]:grid-cols-[8.5rem_minmax(0,1fr)] min-[480px]:items-center min-[480px]:gap-3',
        // Answered rows are solid white cards; unanswered (never touched or cleared) rows are open dashed slots.
        myValue ? 'border-solid border-line bg-surface' : 'border-dashed border-line-strong bg-transparent',
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 min-[480px]:flex-col min-[480px]:flex-nowrap min-[480px]:items-start min-[480px]:gap-0.5">
        <div className={cx('flex items-baseline gap-2 min-[480px]:flex-col min-[480px]:gap-0', struck && 'text-ink-3')}>
          {!isPart && <span className="mono-label text-ink-3">{weekday}</span>}
          <span
            className={cx(
              'font-display leading-tight font-bold tracking-display whitespace-nowrap',
              isPart ? 'text-h3' : 'text-h2',
              struck ? 'text-ink-3 line-through decoration-2' : 'text-ink',
            )}
          >
            {isPart ? PART_LABELS[option.part] : `${day} ${month}`}
          </span>
        </div>
        {isBest && (
          <span className="mono-label rounded-sm bg-ink px-1 text-white">BEST</span>
        )}
        {/* Positive signal only: a row of "0 OTHERS FREE" on every day is noise, not information. */}
        {othersAnswered > 0 && othersFree > 0 && (
          <span className="mono-label tabular ml-auto inline-flex items-center gap-1 whitespace-nowrap text-ink-3 min-[480px]:ml-0">
            <Users aria-hidden size={12} className="shrink-0" />
            {othersFree === 1 ? '1 OTHER FREE' : `${othersFree} OTHERS FREE`}
          </span>
        )}
      </div>
      <div className="relative min-w-0">
        <AnswerControl
          value={myValue}
          onChange={onChange}
          label={label}
          vocabulary="plan"
          size="row"
          disabled={disabled || loading}
        />
        {loading && <Skeleton className="absolute inset-0 rounded-md" />}
      </div>
    </li>
  )
}
