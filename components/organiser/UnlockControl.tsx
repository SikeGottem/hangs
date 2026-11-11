// UnlockControl: ghost "Unlock" with an inline confirm; shared by the locked invitation and the organiser tools sheet.
'use client'

import { CircleAlert, LockOpen } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button, cx, useToast } from '@/components/ui'
import { unlockEvent } from '@/lib/client'
import type { OrganiserBaseProps } from './hooks'

export function UnlockControl({ state, onState, onDone, className }: OrganiserBaseProps & { onDone?: () => void; className?: string }) {
  const { toast, clear: clearToast } = useToast()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirmRef = useRef<HTMLButtonElement | HTMLAnchorElement>(null)
  const openerRef = useRef<HTMLButtonElement | HTMLAnchorElement>(null)
  const restoreFocus = useRef(false)

  useEffect(() => {
    if (asking) confirmRef.current?.focus()
    else if (restoreFocus.current) {
      restoreFocus.current = false
      openerRef.current?.focus()
    }
  }, [asking])

  async function unlock() {
    setBusy(true)
    setError(null)
    const r = await unlockEvent(state.event.id)
    setBusy(false)
    if (!r.ok) {
      setError(r.error.message)
      return
    }
    setAsking(false)
    onState(r.data)
    onDone?.()
    toast({ message: 'Unlocked. Back to picking days.' })
  }

  if (!asking) {
    return (
      <Button
        ref={openerRef}
        variant="ghost"
        iconLeft={LockOpen}
        onClick={() => {
          // A toast at the bottom of the screen would sit over the confirmation and the rows under it.
          clearToast()
          setAsking(true)
        }}
        className={className}
      >
        Unlock
      </Button>
    )
  }

  return (
    <div role="group" aria-label="Unlock this plan" className={cx('flex w-full flex-col gap-2 rounded-lg bg-sunken p-3', className)}>
      <p className="text-sm text-ink">Unlock? Answers stay, and everyone can pick days again.</p>
      {error && (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-danger">
          <CircleAlert aria-hidden size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button ref={confirmRef} variant="danger" iconLeft={LockOpen} loading={busy} onClick={() => void unlock()}>
          Unlock
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            restoreFocus.current = true
            setError(null)
            setAsking(false)
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
