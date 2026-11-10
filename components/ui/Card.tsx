// Card: rounded surface (or sunken) container with token padding.
import type { ReactNode } from 'react'
import { cx } from './cx'

export interface CardProps {
  as?: 'div' | 'section' | 'article' | 'aside' | 'li'
  tone?: 'surface' | 'sunken'
  padding?: 'sm' | 'md' | 'lg'
  id?: string
  className?: string
  children: ReactNode
}

const PADDING = { sm: 'p-3', md: 'p-4', lg: 'p-5' } as const

export function Card({ as: Tag = 'div', tone = 'surface', padding = 'md', id, className, children }: CardProps) {
  return (
    <Tag
      id={id}
      className={cx(
        'rounded-xl border border-line',
        tone === 'surface' ? 'bg-surface shadow-1' : 'bg-sunken',
        PADDING[padding],
        className,
      )}
    >
      {children}
    </Tag>
  )
}
