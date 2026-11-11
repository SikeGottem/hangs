// Avatar (initials, toned by answer) and AvatarStack (+N overflow).
import { User } from 'lucide-react'
import type { AnswerValue } from '@/lib/types'
import { cx } from './cx'

export type AvatarTone = AnswerValue | 'neutral'

const TONES: Record<AvatarTone, string> = {
  free: 'bg-free-bg text-free-ink',
  maybe: 'bg-maybe-bg text-maybe-ink',
  cant: 'bg-cant-bg text-cant-ink',
  neutral: 'bg-sunken text-ink-2',
}

// Up to two initials, each the first letter or number of a word; emoji and symbols are skipped. '' when there is none.
export function initials(name: string): string {
  const firsts: string[] = []
  for (const word of name.trim().split(/\s+/)) {
    const m = word.match(/[\p{L}\p{N}]/u)
    if (m) firsts.push(m[0])
    if (firsts.length === 2) break
  }
  return firsts.join('').toLocaleUpperCase('en')
}

export function Avatar({ name, size = 'md', tone = 'neutral', className }: { name: string; size?: 'sm' | 'md'; tone?: AvatarTone; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        size === 'sm' ? 'h-7 w-7 text-xs' : 'h-9 w-9 text-sm',
        TONES[tone],
        className,
      )}
    >
      {initials(name) || <User size={size === 'sm' ? 14 : 16} strokeWidth={2.25} />}
    </span>
  )
}

export function AvatarStack({ names, max = 5, className }: { names: string[]; max?: number; className?: string }) {
  const shown = names.slice(0, max)
  const extra = names.length - shown.length
  return (
    <span className={cx('inline-flex items-center', className)} aria-label={names.join(', ')}>
      {shown.map((n, i) => (
        <Avatar key={`${n}-${i}`} name={n} size="sm" className={cx('ring-2 ring-surface', i > 0 && '-ml-2')} />
      ))}
      {extra > 0 && (
        <span aria-hidden className="-ml-2 inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-sunken px-1.5 text-xs font-semibold text-ink-2 ring-2 ring-surface">
          +{extra}
        </span>
      )}
    </span>
  )
}
