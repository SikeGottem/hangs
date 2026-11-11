// IconButton: icon-only button with a required aria-label and a hit area of at least 44 px.
'use client'

import type { LucideIcon } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cx } from './cx'

export type IconButtonProps = {
  icon: LucideIcon
  label: string
  variant?: 'ghost' | 'secondary'
  size?: 44 | 36
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, variant = 'ghost', size = 44, className, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-label={label}
      title={label}
      className={cx(
        'group inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink',
        'transition duration-(--dur-fast) active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...rest}
    >
      <span
        className={cx(
          'inline-flex items-center justify-center rounded-full transition-colors duration-(--dur-fast)',
          size === 36 ? 'h-9 w-9' : 'h-11 w-11',
          variant === 'secondary' ? 'border border-line-strong bg-surface group-hover:bg-hover' : 'group-hover:bg-hover',
        )}
      >
        <Icon aria-hidden size={20} />
      </span>
    </button>
  )
})
