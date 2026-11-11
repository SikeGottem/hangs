// Poster: the full-screen colour page every event and create view sits on, plus its big action button.
'use client'

import type { LucideIcon } from 'lucide-react'
import { useEffect, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react'
import { cx, Spinner } from '@/components/ui'
import type { PosterColour } from '@/lib/poster'

export interface PosterProps {
  colour: PosterColour
  accent?: boolean      // main buttons use yellow instead of the poster's own text colour
  children: ReactNode
  className?: string
}

export function Poster({ colour, accent, children, className }: PosterProps) {
  // The browser chrome and any overscroll follow the poster.
  useEffect(() => {
    const root = document.documentElement
    root.style.backgroundColor = colour.hex
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colour.hex)
    return () => { root.style.backgroundColor = '' }
  }, [colour.hex])

  const style = {
    '--poster-bg': colour.bg,
    '--poster-fg': colour.fg,
    ...(accent ? { '--poster-accent': 'var(--color-day-2)', '--poster-on-accent': 'var(--color-on-day-2)' } : {}),
  } as CSSProperties

  return (
    <div
      style={style}
      className={cx('poster flex min-h-dvh flex-col bg-(--poster-bg) text-(--poster-fg) transition-colors duration-(--dur-sheet) ease-(--ease-out)', className)}
    >
      <div
        className="mx-auto flex w-full max-w-(--col-max) flex-1 flex-col px-5 pt-[calc(env(safe-area-inset-top,0px)+1rem)] pb-[calc(var(--safe-bottom)+1rem)] lg:max-w-(--page-max) lg:px-8 lg:pt-10"
      >
        {children}
      </div>
    </div>
  )
}

export interface PosterButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  kind?: 'solid' | 'outline'
  size?: 'lg' | 'md'
  icon?: LucideIcon
  loading?: boolean
}

// Solid: the poster's text colour (or yellow on an accent poster). Outline: thick border. Both are real buttons.
export function PosterButton({ kind = 'solid', size = 'lg', icon: Icon, loading, className, children, type, disabled, ...rest }: PosterButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex select-none items-center justify-center gap-2 rounded-lg font-extrabold transition duration-(--dur-fast) ease-(--ease-out) active:scale-[0.98]',
        'disabled:cursor-not-allowed disabled:opacity-60',
        size === 'lg' ? 'min-h-18 px-5 text-hero' : 'min-h-13 px-4 text-lg',
        kind === 'solid' ? 'bg-accent text-on-accent' : 'border-3 border-current',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={20} /> : Icon ? <Icon aria-hidden size={size === 'lg' ? 24 : 20} strokeWidth={2.5} /> : null}
      <span>{children}</span>
    </button>
  )
}

// The screen's main actions, pinned under the thumb on phones when the page is taller than the screen; plain on desktop.
export function PosterFoot({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cx(
        'sticky bottom-0 z-10 -mx-5 mt-auto -mb-[calc(var(--safe-bottom)+1rem)] flex flex-col gap-1 bg-(--poster-bg) px-5 pt-3 pb-[calc(var(--safe-bottom)+1rem)] transition-colors duration-(--dur-sheet) ease-(--ease-out)',
        'lg:static lg:mx-0 lg:mb-0 lg:bg-transparent lg:px-0 lg:pb-0',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function PosterLink({ className, children, type, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type ?? 'button'}
      className={cx('inline-flex min-h-11 items-center rounded-sm text-lg font-medium underline underline-offset-4', className)}
      {...rest}
    >
      {children}
    </button>
  )
}
