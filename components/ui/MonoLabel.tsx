// MonoLabel: uppercase JetBrains Mono metadata label with an optional leading icon.
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from './cx'

export interface MonoLabelProps {
  as?: 'span' | 'p' | 'h2' | 'h3' | 'h4'
  tone?: 'ink' | 'ink-2' | 'ink-3'
  icon?: LucideIcon
  id?: string
  className?: string
  children: ReactNode
}

const TONES = { ink: 'text-ink', 'ink-2': 'text-ink-2', 'ink-3': 'text-ink-3' } as const

export function MonoLabel({ as: Tag = 'span', tone = 'ink-2', icon: Icon, id, className, children }: MonoLabelProps) {
  return (
    <Tag id={id} className={cx('mono-label inline-flex items-center gap-1.5', TONES[tone], className)}>
      {Icon && <Icon aria-hidden size={14} className="shrink-0" />}
      {children}
    </Tag>
  )
}
