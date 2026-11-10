// Segmented: a radiogroup of equal segments with arrow-key navigation (roving tabindex).
'use client'

import type { LucideIcon } from 'lucide-react'
import { useRef, type KeyboardEvent } from 'react'
import { cx } from './cx'

export interface SegmentedProps<T extends string> {
  value: T
  onChange(v: T): void
  options: { value: T; label: string; icon?: LucideIcon }[]
  label: string
  className?: string
}

export function Segmented<T extends string>({ value, onChange, options, label, className }: SegmentedProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = (i + delta + options.length) % options.length
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div role="radiogroup" aria-label={label} className={cx('flex rounded-lg bg-sunken p-1', className)}>
      {options.map((o, i) => {
        const selected = o.value === value
        const Icon = o.icon
        return (
          <button
            key={o.value}
            ref={el => { refs.current[i] = el }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onKeyDown={e => onKeyDown(e, i)}
            onClick={() => onChange(o.value)}
            className={cx(
              // Each segment is itself a full 44 px target; the track pads around it.
              'flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-semibold transition-colors duration-(--dur-fast)',
              selected ? 'bg-surface text-ink shadow-1' : 'text-ink-2 hover:text-ink',
            )}
          >
            {/* Below 360 px the icon steps aside so labels like "Parts of the day" fit; they wrap rather than clip. */}
            {Icon && <Icon aria-hidden size={16} className="shrink-0 max-[359px]:hidden" />}
            <span className="min-w-0 text-center leading-tight">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
