// ResponsesManager: organiser's list of other people with an inline-confirmed "remove their answers" action.
'use client'

import { CircleAlert, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Avatar, Button, IconButton, useToast } from '@/components/ui'
import { removePerson } from '@/lib/client'
import { plural } from '@/lib/format'
import { LOCAL_PERSON_ID } from '@/lib/state'
import type { OrganiserBaseProps } from './LockCta'

export function ResponsesManager({ state, onState }: OrganiserBaseProps) {
  const { toast } = useToast()
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef<HTMLButtonElement | HTMLAnchorElement>(null)
  const returnTo = useRef<string | null>(null)

  // Move focus into the confirm row when it opens, and back to its trash button when it closes.
  useEffect(() => {
    if (confirming) {
      cancelRef.current?.focus()
    } else if (returnTo.current) {
      document.getElementById(returnTo.current)?.focus()
      returnTo.current = null
    }
  }, [confirming])

  const others = state.people.filter(p => !p.isOrganiser && p.id !== LOCAL_PERSON_ID)

  if (others.length === 0) {
    return <p className="text-md text-ink-2">No one else has answered yet.</p>
  }

  async function remove(id: string, name: string) {
    setBusy(id)
    setError(null)
    const r = await removePerson(state.event.id, id)
    setBusy(null)
    if (!r.ok) {
      setError(r.error.message)
      return
    }
    setConfirming(null)
    onState(r.data)
    toast({ message: `Removed ${name}.` })
  }

  return (
    <ul className="flex flex-col divide-y divide-line">
      {others.map(p => {
        const asking = confirming === p.id
        return (
          <li key={p.id} className="py-2">
            <div className="flex min-h-11 items-center gap-3">
              <Avatar name={p.name} size="md" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-md font-semibold text-ink">{p.name}</span>
                <span className="mono-label tabular text-ink-3">
                  {p.answeredCount === 0 ? 'NO ANSWERS' : `${p.answeredCount} ${plural(p.answeredCount, 'ANSWER', 'ANSWERS')}`}
                </span>
              </span>
              {!asking && (
                <IconButton id={`remove-${p.id}`} icon={Trash2} label={`Remove ${p.name}'s answers`} onClick={() => { setError(null); setConfirming(p.id) }} />
              )}
            </div>
            {asking && (
              <div className="mt-2 flex flex-col gap-2 rounded-lg bg-danger-bg p-3" role="group" aria-label={`Remove ${p.name}`}>
                <p className="text-sm text-ink">Remove {p.name}&apos;s answers? They can answer again.</p>
                {error && (
                  <p role="alert" className="flex items-start gap-1.5 text-sm text-danger">
                    <CircleAlert aria-hidden size={16} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button variant="danger" iconLeft={Trash2} loading={busy === p.id} onClick={() => void remove(p.id, p.name)}>
                    Remove
                  </Button>
                  <Button
                    ref={cancelRef}
                    variant="ghost"
                    disabled={busy === p.id}
                    onClick={() => {
                      returnTo.current = `remove-${p.id}`
                      setError(null)
                      setConfirming(null)
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
