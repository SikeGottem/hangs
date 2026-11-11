// "Your plans" list for returning organisers and guests, read from localStorage after mount (no hydration mismatch).
'use client'

import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { cx, MonoLabel, useMounted } from '@/components/ui'
import { listMyEvents } from '@/lib/client'

export function RecentHangs({ className }: { className?: string }) {
  const mounted = useMounted()
  const events = mounted ? listMyEvents().slice(0, 5) : []
  if (events.length === 0) return null

  return (
    <section aria-labelledby="recent-hangs" className={cx('flex flex-col gap-2', className)}>
      <MonoLabel as="h2" id="recent-hangs" tone="ink-3">Your plans</MonoLabel>
      <ul className="overflow-hidden rounded-xl border border-line bg-surface">
        {events.map((e, i) => (
          <li key={e.id} className={cx(i > 0 && 'border-t border-line')}>
            <Link
              href={`/h/${e.id}`}
              className="flex min-h-14 items-center gap-3 px-4 py-2 transition-colors duration-(--dur-fast) hover:bg-hover focus-visible:-outline-offset-2"
            >
              <span className="min-w-0 flex-1 truncate font-display text-base font-bold tracking-display text-ink">
                {e.title}
              </span>
              <span className="mono-label shrink-0 text-ink-3">
                {e.role === 'organiser' ? 'Organiser' : 'Answered'}
              </span>
              <ChevronRight aria-hidden size={18} className="shrink-0 text-ink-3" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
