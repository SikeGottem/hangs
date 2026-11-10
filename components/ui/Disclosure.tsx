// Disclosure: native <details>/<summary> with a rotating chevron.
import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from './cx'

export interface DisclosureProps {
  summary: ReactNode
  defaultOpen?: boolean
  className?: string
  children: ReactNode
}

export function Disclosure({ summary, defaultOpen, className, children }: DisclosureProps) {
  return (
    <details open={defaultOpen} className={cx('group', className)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">{summary}</span>
        <ChevronDown aria-hidden size={18} className="shrink-0 text-ink-2 transition-transform duration-(--dur) group-open:rotate-180" />
      </summary>
      <div className="pt-2">{children}</div>
    </details>
  )
}
