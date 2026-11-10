// Wordmark: three ink bars (friends / a little bar chart) plus lowercase "hangs", linking home by default.
import Link from 'next/link'
import { cx } from './cx'

export function LogoBars({ size = 'md', className }: { size?: 'sm' | 'md'; className?: string }) {
  const scale = size === 'sm' ? 0.85 : 1
  return (
    <span aria-hidden className={cx('inline-flex rotate-10 items-end gap-0.75', className)}>
      {[9, 17, 12].map(h => (
        <span key={h} className="block w-1 rounded-full bg-ink" style={{ height: `${h * scale}px` }} />
      ))}
    </span>
  )
}

// prefetch={false} on pages where the home link is rarely used, so opening them costs no extra function invocation.
export function Wordmark({ size = 'md', href = '/', prefetch, className }: { size?: 'sm' | 'md'; href?: string | null; prefetch?: boolean; className?: string }) {
  const inner = (
    <>
      <LogoBars size={size} />
      <span className={cx('font-display font-extrabold tracking-[-0.04em] text-ink', size === 'sm' ? 'text-lg' : 'text-xl')}>hangs</span>
    </>
  )
  const classes = cx('inline-flex min-h-11 items-center gap-2 rounded-md', className)
  if (href === null) return <span className={classes}>{inner}</span>
  return (
    <Link href={href} prefetch={prefetch} aria-label="Hangs home" className={classes}>
      {inner}
    </Link>
  )
}
