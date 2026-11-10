// Skeleton: sunken pulsing placeholder block (no pulse under reduced motion).
import { cx } from './cx'

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx('animate-pulse rounded-md bg-sunken motion-reduce:animate-none', className)} />
}
