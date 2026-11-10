// Chip: a 44 px pill (the touch-target size). With `selected` it is a toggle (aria-pressed, ink with a check when on);
// without it, a one-shot action button with no pressed state.
'use client'

import { Check, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from './cx'

export interface ChipProps {
  selected?: boolean
  icon?: LucideIcon
  onClick: () => void
  disabled?: boolean
  className?: string
  children: ReactNode
}

export function Chip({ selected, icon: Icon, onClick, disabled, className, children }: ChipProps) {
  const Lead = selected ? Check : Icon
  return (
    <button
      type="button"
      aria-pressed={selected === undefined ? undefined : selected}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold whitespace-nowrap',
        'transition duration-(--dur-fast) active:scale-[0.97]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        selected ? 'border-ink bg-ink text-white' : 'border-line-strong bg-surface text-ink hover:bg-hover',
        className,
      )}
    >
      {Lead && <Lead aria-hidden size={16} />}
      {children}
    </button>
  )
}
