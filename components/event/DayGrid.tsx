// DayGrid: the compact calendar of an event's days (only the weeks that matter); shows answers, who else can, and jumps between days.
'use client'

import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react'
import { cx } from '@/components/ui'
import { addDays, parseDate } from '@/lib/dates'
import { MONTHS_LONG, MONTHS_SHORT_LABEL } from '@/lib/format'

export interface DayCell {
  label: string                      // full screen-reader label
  mark?: 'free' | 'maybe' | 'cant' | null
  active?: boolean                   // the day on the big poster
  disabled?: boolean
  dots?: number                      // filled dots
  dotsOf?: number                    // total dots (unfilled ones fade); defaults to dots
  count?: string                     // text instead of dots, for big groups
}

export interface DayGridProps {
  dates: string[]                    // distinct option dates, ascending
  cell: (date: string) => DayCell
  onPick: (date: string) => void
  label: string
  aside?: string                     // short text at the right of the month line
  className?: string
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const MAX_ROWS_VISIBLE = 4

function weekStart(date: string): string {
  const { year, month0, day } = parseDate(date)
  const mondayIndex = (new Date(Date.UTC(year, month0, day)).getUTCDay() + 6) % 7
  return addDays(date, -mondayIndex)
}

export function DayGrid({ dates, cell, onPick, label, aside, className }: DayGridProps) {
  const refs = useRef(new Map<string, HTMLButtonElement>())
  const scroller = useRef<HTMLDivElement>(null)

  const optionSet = useMemo(() => new Set(dates), [dates])
  const weeks = useMemo(() => {
    const starts = [...new Set(dates.map(weekStart))].sort()
    return starts.map(s => Array.from({ length: 7 }, (_, i) => addDays(s, i)))
  }, [dates])

  const enabled = dates.filter(d => !cell(d).disabled)
  const active = dates.find(d => cell(d).active)
  const tabStop = active && !cell(active).disabled ? active : enabled[0]

  // Long ranges scroll inside the grid; keep the current day in view.
  useEffect(() => {
    const box = scroller.current
    const el = active ? refs.current.get(active) : undefined
    if (!box || !el || box.scrollHeight <= box.clientHeight) return
    const top = el.offsetTop - box.offsetTop
    if (top < box.scrollTop || top + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = top - 8
  }, [active])

  const months = dates.length > 0 ? [parseDate(dates[0]).month0, parseDate(dates[dates.length - 1]).month0] : []
  const monthLine = months.length === 0 ? '' : months[0] === months[1] ? MONTHS_LONG[months[0]] : `${MONTHS_LONG[months[0]]} to ${MONTHS_LONG[months[1]]}`

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, date: string) => {
    const i = enabled.indexOf(date)
    let target: string | undefined
    if (e.key === 'ArrowRight') target = enabled[i + 1]
    else if (e.key === 'ArrowLeft') target = enabled[i - 1]
    else if (e.key === 'ArrowDown') target = enabled.find(d => d >= addDays(date, 7)) ?? enabled[enabled.length - 1]
    else if (e.key === 'ArrowUp') target = [...enabled].reverse().find(d => d <= addDays(date, -7)) ?? enabled[0]
    else return
    e.preventDefault()
    if (target) refs.current.get(target)?.focus()
  }

  return (
    <div role="group" aria-label={label} className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-lg font-extrabold">{monthLine}</p>
        {aside && <p className="text-lg font-extrabold tabular">{aside}</p>}
      </div>
      <div aria-hidden className="mt-1 grid grid-cols-7 gap-1.25">
        {WEEKDAYS.map((w, i) => <span key={i} className="flex h-5 items-center justify-center text-sm font-medium">{w}</span>)}
      </div>
      <div
        ref={scroller}
        className={cx('relative p-1 -m-1 no-scrollbar', weeks.length > MAX_ROWS_VISIBLE && 'max-h-53 overflow-y-auto')}
      >
        <div className="grid grid-cols-7 gap-1.25">
          {weeks.flat().map(date => {
            const isOption = optionSet.has(date)
            const { day, month0 } = parseDate(date)
            if (!isOption) {
              return (
                <span key={date} aria-hidden className="flex h-11.5 flex-col items-center justify-center text-h2 leading-tight font-medium opacity-70 lg:h-14">
                  {day}
                  {day === 1 && <span className="text-xs leading-none">{MONTHS_SHORT_LABEL[month0]}</span>}
                </span>
              )
            }
            const c = cell(date)
            const filled = c.mark === 'free'
            const dots = c.dots ?? 0
            const total = Math.max(c.dotsOf ?? dots, dots)
            return (
              <button
                key={date}
                ref={el => { if (el) refs.current.set(date, el); else refs.current.delete(date) }}
                type="button"
                tabIndex={date === tabStop ? 0 : -1}
                disabled={c.disabled}
                aria-label={c.label}
                aria-current={c.active ? 'date' : undefined}
                onClick={() => onPick(date)}
                onKeyDown={e => onKeyDown(e, date)}
                className={cx(
                  'flex h-11.5 flex-col items-center justify-center gap-0.5 rounded-md border-2 border-current text-h2 leading-tight font-extrabold tabular transition-colors duration-(--dur-fast) lg:h-14',
                  c.mark === 'cant' && 'border-dashed',
                  filled ? 'bg-(--poster-fg) text-(--poster-bg)' : 'text-(--poster-fg)',
                  c.active && 'outline-3 outline-offset-2 outline-(--poster-fg)',
                  c.disabled && 'cursor-not-allowed opacity-60',
                )}
              >
                <span className={cx(c.mark === 'cant' && 'line-through')}>{day}</span>
                <span aria-hidden className="flex h-1.25 items-center gap-0.5 text-xs leading-none font-extrabold">
                  {c.mark === 'maybe'
                    ? '?'
                    : c.count ?? Array.from({ length: Math.min(total, 6) }, (_, i) => (
                      <span key={i} className={cx('size-1 rounded-full bg-current', i >= dots && 'opacity-35')} />
                    ))}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
