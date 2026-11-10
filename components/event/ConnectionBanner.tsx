// Connection problems strip: offline, or repeated refresh failures. Renders an empty live region otherwise.
'use client'

import { RefreshCw, WifiOff } from 'lucide-react'
import { cx } from '@/components/ui'

export interface ConnectionBannerProps {
  connection: 'online' | 'offline'
  pollFailures: number
  className?: string
}

export function ConnectionBanner({ connection, pollFailures, className }: ConnectionBannerProps) {
  const offline = connection === 'offline'
  const stale = !offline && pollFailures >= 2
  return (
    <div role="status" aria-live="polite" className={cx('empty:hidden', className)}>
      {offline && (
        <p className="mono-label flex items-center gap-2 rounded-md bg-sunken px-3 py-2.5 text-ink-2">
          <WifiOff aria-hidden size={14} className="shrink-0" />
          OFFLINE · ANSWERS WILL SAVE WHEN YOU&apos;RE BACK
        </p>
      )}
      {stale && (
        <p className="mono-label flex items-center gap-2 rounded-md bg-sunken px-3 py-2.5 text-ink-2">
          <RefreshCw aria-hidden size={14} className="shrink-0" />
          COULDN&apos;T REFRESH · RETRYING
        </p>
      )}
    </div>
  )
}
