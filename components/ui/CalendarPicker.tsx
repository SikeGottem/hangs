// CalendarPicker: inline month grid for picking candidate days (tap toggles, mouse drag-paints, arrows/Home/End/PageUp/PageDown move focus).
'use client'

import { Check, ChevronLeft, ChevronRight, Lock } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { addDays, monthGrid, parseDate } from '@/lib/dates'
import { monthYearLabel, MONTHS_LONG, weekdayLong } from '@/lib/format'
import { cx } from './cx'
import { IconButton } from './IconButton'

export interface CalendarPickerProps {
  value: string[]                      // YYYY-MM-DD, any order
  onChange: (next: string[]) => void   // emits sorted ascending, unique
  today: string                        // days before are disabled
  maxSelected: number
  pinned?: string[]                    // shown selected + Lock icon, cannot be deselected
  onLimit?: () => void
  monthsAhead?: number                 // default 12
  labelledBy?: string
  viewDate?: string                    // when this changes, the calendar jumps to that date's month
  className?: string
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const monthIndex = (d: string) => {
  const { year, month0 } = parseDate(d)
  return year * 12 + month0
}

export function CalendarPicker({
  value, onChange, today, maxSelected, pinned = [], onLimit, monthsAhead = 12, labelledBy, viewDate, className,
}: CalendarPickerProps) {
  const minMonth = monthIndex(today)
  const maxMonth = minMonth + monthsAhead
  const clampMonth = (m: number) => Math.min(maxMonth, Math.max(minMonth, m))

  const [month, setMonth] = useState(() => clampMonth(monthIndex(viewDate ?? value.filter(d => d >= today).sort()[0] ?? today)))
  const [lastViewDate, setLastViewDate] = useState(viewDate)
  if (viewDate !== lastViewDate) {
    setLastViewDate(viewDate)
    if (viewDate) setMonth(clampMonth(monthIndex(viewDate)))
  }

  const [focusDate, setFocusDate] = useState<string | null>(null)
  const cellRefs = useRef(new Map<string, HTMLButtonElement>())
  const paint = useRef<{ mode: 'add' | 'remove' } | null>(null)
  const suppressClick = useRef(false)
  const pendingFocus = useRef<string | null>(null)

  const selected = useMemo(() => new Set(value), [value])
  const pinnedSet = useMemo(() => new Set(pinned), [pinned])
  const year = Math.floor(month / 12)
  const month0 = month % 12
  const grid = useMemo(() => monthGrid(year, month0), [year, month0])
  const maxDate = addDays(today, 366)

  const isDisabled = (d: string) => d < today || d > maxDate

  // Roving tab stop, always an enabled cell: the focused date if visible, else the first selected or today in view,
  // else the first enabled day of the month.
  const inView = (d: string) => monthIndex(d) === month
  const tabStop = (() => {
    if (focusDate && inView(focusDate) && !isDisabled(focusDate)) return focusDate
    const firstSel = [...selected].filter(d => inView(d) && !isDisabled(d)).sort()[0]
    if (firstSel) return firstSel
    if (inView(today)) return today
    return grid.flat().find(c => c.inMonth && !isDisabled(c.date))?.date ?? today
  })()

  useEffect(() => {
    const d = pendingFocus.current
    if (!d) return
    pendingFocus.current = null
    cellRefs.current.get(d)?.focus()
  }, [month, focusDate])

  useEffect(() => {
    // A drag-paint that ends on another cell (or outside the grid) dispatches no click to a cell, so the click
    // guard is cleared here too; the timeout still lets it swallow the click that follows a same-cell press.
    const end = () => {
      paint.current = null
      setTimeout(() => { suppressClick.current = false }, 0)
    }
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [])

  const emit = (set: Set<string>) => onChange([...set].sort())

  // Applies add/remove for one date; returns false when the cap blocks it.
  const apply = (d: string, mode: 'add' | 'remove', base: Set<string>): boolean => {
    if (isDisabled(d)) return true
    if (mode === 'remove') {
      if (pinnedSet.has(d) || !base.has(d)) return true
      base.delete(d)
      return true
    }
    if (base.has(d)) return true
    if (base.size >= maxSelected) {
      onLimit?.()
      return false
    }
    base.add(d)
    return true
  }

  const toggle = (d: string) => {
    const base = new Set(selected)
    const mode = base.has(d) ? 'remove' : 'add'
    if (mode === 'remove' && pinnedSet.has(d)) return
    apply(d, mode, base)
    if (base.size !== selected.size || mode === 'remove') emit(base)
  }

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>, d: string) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || isDisabled(d)) return
    const mode = selected.has(d) ? 'remove' : 'add'
    if (mode === 'remove' && pinnedSet.has(d)) return
    suppressClick.current = true
    const base = new Set(selected)
    if (apply(d, mode, base)) paint.current = { mode }
    emit(base)
  }

  const onPointerEnter = (e: PointerEvent<HTMLButtonElement>, d: string) => {
    if (!paint.current || e.pointerType !== 'mouse' || (e.buttons & 1) !== 1) return
    const base = new Set(selected)
    if (!apply(d, paint.current.mode, base)) paint.current = null
    if (base.size !== selected.size) emit(base)
  }

  const focusOn = (target: string) => {
    pendingFocus.current = target
    setFocusDate(target)
    const m = monthIndex(target)
    if (m !== month) setMonth(m)
  }

  const moveFocus = (from: string, delta: number) => {
    const target = addDays(from, delta)
    const m = monthIndex(target)
    // Past days and days beyond the range can't take focus (they are disabled), so the arrow does nothing.
    if (m < minMonth || m > maxMonth || isDisabled(target)) return
    focusOn(target)
  }

  // Home / End: the first / last available day of this week's row within the month shown.
  const edgeOfRow = (d: string, end: boolean) => {
    const row = grid.find(r => r.some(c => c.date === d))
    const days = (row ?? []).filter(c => c.inMonth && !isDisabled(c.date)).map(c => c.date)
    const target = end ? days[days.length - 1] : days[0]
    if (target && target !== d) focusOn(target)
  }

  // PageUp / PageDown: the same day of the previous / next month (clamped to its length), else the nearest available day.
  const pageMonth = (d: string, delta: number) => {
    const m = month + delta
    if (m < minMonth || m > maxMonth) return
    const y = Math.floor(m / 12)
    const m0 = m % 12
    const len = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate()
    const day = Math.min(parseDate(d).day, len)
    const same = `${y}-${String(m0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const days = monthGrid(y, m0).flat().filter(c => c.inMonth && !isDisabled(c.date)).map(c => c.date)
    const target = !isDisabled(same) ? same : same < today ? days[0] : days[days.length - 1]
    if (target) focusOn(target)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, d: string) => {
    const deltas: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    if (e.key in deltas) {
      e.preventDefault()
      moveFocus(d, deltas[e.key])
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      edgeOfRow(d, e.key === 'End')
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault()
      pageMonth(d, e.key === 'PageDown' ? 1 : -1)
    }
  }

  const label = (d: string) => {
    const { year: y, month0: m, day } = parseDate(d)
    let s = `${weekdayLong(d)} ${day} ${MONTHS_LONG[m]} ${y}`
    if (selected.has(d)) s += pinnedSet.has(d) ? ', selected, locked' : ', selected'
    if (isDisabled(d)) s += ', not available'
    return s
  }

  return (
    <div className={cx('select-none', className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 aria-live="polite" className="pl-1 font-display text-h3 font-bold tracking-display text-ink">
          {monthYearLabel(year, month0)}
        </h3>
        <div className="flex items-center">
          <IconButton icon={ChevronLeft} label="Previous month" disabled={month <= minMonth} onClick={() => setMonth(clampMonth(month - 1))} />
          <IconButton icon={ChevronRight} label="Next month" disabled={month >= maxMonth} onClick={() => setMonth(clampMonth(month + 1))} />
        </div>
      </div>
      <div role="grid" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : 'Pick days'} className="w-full">
        <div role="row" className="grid grid-cols-7">
          {WEEKDAYS.map((w, i) => (
            <span key={i} role="columnheader" aria-label={WEEKDAY_NAMES[i]} className="mono-label py-1.5 text-center text-ink-3">{w}</span>
          ))}
        </div>
        {grid.map((row, ri) => (
          <div key={ri} role="row" className="grid grid-cols-7 gap-y-1">
            {row.map(cell => {
              if (!cell.inMonth) return <span key={cell.date} role="gridcell" aria-hidden className="aspect-square min-h-11" />
              const d = cell.date
              const isSel = selected.has(d)
              const isPin = pinnedSet.has(d)
              const disabled = isDisabled(d)
              const isToday = d === today
              return (
                <span key={d} role="gridcell" className="flex aspect-square min-h-11 items-center justify-center">
                  <button
                    ref={el => { if (el) cellRefs.current.set(d, el); else cellRefs.current.delete(d) }}
                    type="button"
                    tabIndex={d === tabStop ? 0 : -1}
                    aria-pressed={isSel}
                    aria-label={label(d)}
                    aria-disabled={isPin && isSel ? true : undefined}
                    disabled={disabled}
                    onPointerDown={e => onPointerDown(e, d)}
                    onPointerEnter={e => onPointerEnter(e, d)}
                    onClick={() => {
                      if (suppressClick.current) { suppressClick.current = false; return }
                      toggle(d)
                    }}
                    onFocus={() => setFocusDate(d)}
                    onKeyDown={e => onKeyDown(e, d)}
                    className={cx(
                      'group flex h-full w-full items-center justify-center rounded-full p-1 text-md font-semibold tabular',
                      disabled ? 'cursor-not-allowed text-ink-3' : isSel ? 'text-white' : 'text-ink',
                    )}
                  >
                    {/* The whole cell is the tap target; the visible circle is inset so neighbouring picks stay apart. */}
                    <span
                      className={cx(
                        'relative flex h-full w-full items-center justify-center rounded-full transition-colors duration-(--dur-fast)',
                        disabled ? 'line-through' : isSel ? 'bg-ink pb-2' : 'group-hover:bg-hover',  // pb: room for the check under the number
                        isToday && !isSel && 'ring-1 ring-ink ring-inset',
                      )}
                    >
                      {parseDate(d).day}
                      {isSel && (
                        <span aria-hidden className="absolute bottom-0.5 left-1/2 inline-flex -translate-x-1/2">
                          {isPin ? <Lock size={10} strokeWidth={3} /> : <Check size={10} strokeWidth={3} />}
                        </span>
                      )}
                    </span>
                  </button>
                </span>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
