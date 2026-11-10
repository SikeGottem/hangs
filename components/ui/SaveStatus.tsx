// SaveStatus: mono, aria-live save indicator (unsaved / saving / saved / error with retry / offline).
'use client'

import { Check, CircleDashed, CloudOff, Loader2, WifiOff } from 'lucide-react'
import type { SaveStatus as SaveStatusValue } from '@/lib/types'
import { cx } from './cx'

export function SaveStatus({ status, onRetry, className }: { status: SaveStatusValue; onRetry?(): void; className?: string }) {
  return (
    <span aria-live="polite" className={cx('mono-label inline-flex min-h-5 items-center gap-1.5', className)}>
      {status === 'unsaved' && (
        <span className="inline-flex items-center gap-1.5 text-ink-2"><CircleDashed aria-hidden size={14} />NOT SAVED YET · ADD YOUR NAME</span>
      )}
      {status === 'saving' && (
        <span className="inline-flex items-center gap-1.5 text-ink-2"><Loader2 aria-hidden size={14} className="animate-spin motion-reduce:animate-none" />SAVING…</span>
      )}
      {status === 'saved' && (
        <span className="inline-flex items-center gap-1.5 text-free-ink"><Check aria-hidden size={14} />SAVED</span>
      )}
      {status === 'error' && (
        <button type="button" onClick={onRetry} className="-my-3 inline-flex min-h-11 items-center gap-1.5 text-danger underline-offset-2 hover:underline">
          <CloudOff aria-hidden size={14} />NOT SAVED · RETRY
        </button>
      )}
      {status === 'offline' && (
        <span className="inline-flex items-center gap-1.5 text-ink-2"><WifiOff aria-hidden size={14} />OFFLINE · WILL SAVE WHEN BACK</span>
      )}
    </span>
  )
}
