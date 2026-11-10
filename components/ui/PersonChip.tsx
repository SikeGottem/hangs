// PersonChip: avatar + name, with optional answer icon, "(you)" and an ORGANISER tag.
import type { ReactNode } from 'react'
import type { AnswerValue } from '@/lib/types'
import { Avatar } from './Avatar'
import { cx } from './cx'
import { StateIcon } from './StateIcon'

export interface PersonChipProps {
  name: string
  value?: AnswerValue
  isYou?: boolean
  isOrganiser?: boolean
  trailing?: ReactNode
  className?: string
}

const ICON_TONE: Record<AnswerValue, string> = { free: 'text-free', maybe: 'text-maybe', cant: 'text-cant' }

export function PersonChip({ name, value, isYou, isOrganiser, trailing, className }: PersonChipProps) {
  return (
    <span className={cx('inline-flex max-w-full items-center gap-2 rounded-full bg-surface py-1 pr-3 pl-1 text-sm text-ink ring-1 ring-line', className)}>
      {value && <StateIcon value={value} size={14} className={cx('ml-1 shrink-0', ICON_TONE[value])} />}
      <Avatar name={name} size="sm" tone={value ?? 'neutral'} />
      <span className="min-w-0 truncate">
        {name}
        {isYou && <span className="text-ink-3"> (you)</span>}
      </span>
      {isOrganiser && <span className="mono-label shrink-0 text-ink-3">ORGANISER</span>}
      {trailing}
    </span>
  )
}
