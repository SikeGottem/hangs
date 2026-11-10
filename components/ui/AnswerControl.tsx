// AnswerControl: the three-way Free / If need be / Can't (or Going / Maybe / Out) segmented answer for one option.
// One Tab stop per control (roving tabindex, toolbar pattern): Tab moves to the next day, Left/Right/Home/End move
// between the three segments, Space/Enter picks (or clears) the focused one.
'use client'

import { useRef, useState, type KeyboardEvent } from 'react'
import { ANSWER_LABELS } from '@/lib/format'
import type { AnswerValue, Vocabulary } from '@/lib/types'
import { cx } from './cx'
import { StateIcon } from './StateIcon'

export interface AnswerControlProps {
  value: AnswerValue | null
  onChange: (next: AnswerValue | null) => void   // tapping the selected segment -> null
  label: string                                  // group aria-label, e.g. "Sat 21 Nov"
  vocabulary?: Vocabulary                        // 'plan' (default): Free / If need be / Can't; 'rsvp': Going / Maybe / Out
  size?: 'row' | 'large'
  disabled?: boolean
  className?: string
}

const VALUES: AnswerValue[] = ['free', 'maybe', 'cant']

const SELECTED: Record<AnswerValue, string> = {
  free: 'bg-free text-on-free border-free',
  maybe: 'bg-maybe-bg text-maybe-ink border-maybe ring-1 ring-inset ring-maybe',
  cant: 'bg-cant text-on-cant border-cant',
}

export function AnswerControl({ value, onChange, label, vocabulary = 'plan', size = 'row', disabled, className }: AnswerControlProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const words = ANSWER_LABELS[vocabulary]
  // The Tab stop: the segment last focused, else the selected one, else the first.
  const [focused, setFocused] = useState<number | null>(null)
  const selectedIndex = value ? VALUES.indexOf(value) : -1
  const tabStop = focused ?? (selectedIndex >= 0 ? selectedIndex : 0)

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const last = VALUES.length - 1
    const next = e.key === 'ArrowRight' ? (i === last ? 0 : i + 1)
      : e.key === 'ArrowLeft' ? (i === 0 ? last : i - 1)
        : e.key === 'Home' ? 0
          : e.key === 'End' ? last
            : null
    if (next === null) return
    e.preventDefault()
    refs.current[next]?.focus()
  }

  return (
    <div role="group" aria-label={label} className={cx('grid grid-cols-3 gap-1.5', className)}>
      {VALUES.map((v, i) => {
        const selected = value === v
        return (
          <button
            key={v}
            ref={el => { refs.current[i] = el }}
            type="button"
            aria-pressed={selected}
            aria-label={`${label}: ${words[v]}`}
            disabled={disabled}
            tabIndex={i === tabStop ? 0 : -1}
            onFocus={() => setFocused(i)}
            onBlur={() => setFocused(null)}
            onKeyDown={e => onKeyDown(e, i)}
            onClick={() => onChange(selected ? null : v)}
            className={cx(
              'flex items-center justify-center rounded-md border font-semibold',
              'transition-colors duration-(--dur-fast) ease-(--ease-out) active:scale-[0.97]',
              'disabled:cursor-not-allowed disabled:opacity-60',
              size === 'row'
                ? 'min-h-12 flex-col gap-0.5 px-1 text-xs min-[480px]:min-h-13 min-[480px]:min-w-18'
                : 'min-h-14 flex-row gap-2 px-2 text-md',
              selected ? SELECTED[v] : 'border-control-border bg-surface text-ink-2 hover:bg-hover',
            )}
          >
            <StateIcon value={v} size={18} />
            <span className="leading-tight">{words[v]}</span>
          </button>
        )
      })}
    </div>
  )
}
