// Button: accent / primary / secondary / ghost / danger, md or lg, optional icons, loading state, or a link when href is set.
'use client'

import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { forwardRef, type ButtonHTMLAttributes, type MouseEventHandler, type Ref } from 'react'
import { cx } from './cx'
import { Spinner } from './Spinner'

export type ButtonVariant = 'accent' | 'primary' | 'secondary' | 'ghost' | 'danger'

export type ButtonProps = {
  variant?: ButtonVariant
  size?: 'md' | 'lg'
  loading?: boolean
  iconLeft?: LucideIcon
  iconRight?: LucideIcon
  fullWidth?: boolean
  href?: string
  external?: boolean
} & ButtonHTMLAttributes<HTMLButtonElement>

const VARIANTS: Record<ButtonVariant, string> = {
  accent: 'bg-accent text-on-accent hover:bg-accent-press active:bg-accent-press',
  primary: 'bg-ink text-white hover:bg-ink-2',
  secondary: 'bg-surface border border-line-strong text-ink hover:bg-hover',
  ghost: 'bg-transparent text-ink hover:bg-hover',
  danger: 'bg-surface border border-danger text-danger hover:bg-danger-bg',
}

export function buttonClasses({ variant = 'primary', size = 'md', fullWidth, className }: Pick<ButtonProps, 'variant' | 'size' | 'fullWidth' | 'className'>) {
  return cx(
    'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-semibold',
    'transition duration-(--dur-fast) ease-(--ease-out) active:scale-[0.97]',
    'disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed',
    size === 'lg' ? 'h-13 px-6 text-base' : 'h-11 px-4 text-md',
    fullWidth ? 'w-full rounded-lg' : 'rounded-full',
    VARIANTS[variant],
    className,
  )
}

export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, iconLeft: IconLeft, iconRight: IconRight, fullWidth, href, external, className, children, disabled, type, ...rest },
  ref,
) {
  const classes = buttonClasses({ variant, size, fullWidth, className })
  const iconSize = size === 'lg' ? 20 : 18
  const content = (
    <>
      {loading ? <Spinner size={size === 'lg' ? 20 : 16} /> : IconLeft ? <IconLeft aria-hidden size={iconSize} /> : null}
      <span className="truncate">{children}</span>
      {!loading && IconRight ? <IconRight aria-hidden size={iconSize} /> : null}
    </>
  )

  if (href) {
    const anchorProps = {
      className: classes,
      onClick: rest.onClick as unknown as MouseEventHandler<HTMLAnchorElement> | undefined,
      'aria-label': rest['aria-label'],
      'aria-describedby': rest['aria-describedby'],
      id: rest.id,
      title: rest.title,
    }
    const plain = external || /^(https?:|mailto:|\/api\/)/.test(href)
    if (plain) {
      return (
        <a
          ref={ref as Ref<HTMLAnchorElement>}
          href={href}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          {...anchorProps}
        >
          {content}
        </a>
      )
    }
    return (
      <Link ref={ref as Ref<HTMLAnchorElement>} href={href} {...anchorProps}>
        {content}
      </Link>
    )
  }

  return (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      type={type ?? 'button'}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {content}
    </button>
  )
})
