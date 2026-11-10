// EditDaysSheet: organiser adds or removes candidate days on a calendar, warned about answers that removal drops.
'use client'

import { CircleAlert, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { Button, CalendarPicker, MonoLabel, Sheet, useToast } from '@/components/ui'
import { setEventDates } from '@/lib/client'
import { buildNewDaysMessage, copyText, eventUrl } from '@/lib/share'
import { formatDate, plural } from '@/lib/format'
import type { ApiError, EventState } from '@/lib/types'

export interface EditDaysSheetProps {
  open: boolean
  onClose: () => void
  state: EventState
  onState: (next: EventState) => void
}

const distinctDates = (state: EventState) => [...new Set(state.options.map(o => o.date))].sort()

function errorCopy(e: ApiError, parts: boolean): string {
  if (e.code === 'last_option') return 'Keep at least one day.'
  if (e.code === 'locked_option') return 'Unlock before removing the locked day.'
  if (e.code === 'too_many_options') return parts ? "That's the max with parts of the day: 20 days." : "That's the max: 62 days."
  return e.message
}

export function EditDaysSheet({ open, onClose, state, onState }: EditDaysSheetProps) {
  const { toast } = useToast()
  const labelId = useId()
  const parts = state.event.mode === 'parts'
  const maxSelected = parts ? 20 : 62
  const pinned = state.event.lock ? [state.event.lock.date] : []

  const [draft, setDraft] = useState<string[]>(() => distinctDates(state))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setDraft(distinctDates(state))
      setError(null)
      setBusy(false)
    }
  }

  const current = distinctDates(state)
  const draftSet = new Set(draft)
  const removed = current.filter(d => !draftSet.has(d))
  const added = draft.filter(d => !current.includes(d))
  const changed = removed.length > 0 || added.length > 0

  // Answers held on each removed date (all parts of that date).
  const answersOn = (date: string) => {
    const ids = new Set(state.options.filter(o => o.date === date).map(o => o.id))
    return state.people.reduce((n, p) => n + Object.keys(p.answers).filter(id => ids.has(id)).length, 0)
  }
  const lossy = removed.map(d => ({ d, n: answersOn(d) })).filter(x => x.n > 0)
  const lostCount = lossy.reduce((n, x) => n + x.n, 0)
  const lossWarning = lossy.length === 0 ? null : (() => {
    const named = lossy.slice(0, 2).map(x => formatDate(x.d, { style: 'tiny' })).join(', ')
    const more = lossy.length > 2 ? ` +${lossy.length - 2} more` : ''
    return `Removing ${named}${more} drops ${lostCount} ${plural(lostCount, 'answer', 'answers')}.`
  })()

  const pinnedSet = new Set(pinned)
  const pastInDraft = draft.filter(d => d < state.today && !pinnedSet.has(d))
  const onlyPastLeft = draft.length > 0 && draft.every(d => d < state.today)

  async function save() {
    if (busy || !changed) return
    if (draft.length === 0) {
      setError('Keep at least one day.')
      return
    }
    setBusy(true)
    setError(null)
    const r = await setEventDates(state.event.id, draft)
    setBusy(false)
    if (!r.ok) {
      setError(errorCopy(r.error, parts))
      return
    }
    onState(r.data)
    onClose()
    if (added.length === 0) {
      toast({ message: 'Days saved.' })
      return
    }
    // New days are blank for everyone who already answered: offer the message that asks them to check.
    const text = buildNewDaysMessage(r.data).textWithUrl(eventUrl(window.location.origin, r.data.event.id))
    toast({
      message: 'Days saved. Let the group know there are new ones.',
      action: {
        label: 'Copy message',
        onClick: () => {
          void copyText(text).then(ok => {
            toast(ok ? { message: 'Copied. Paste it in the chat.' } : { message: "Couldn't copy. Long-press the link instead.", tone: 'error' })
          })
        },
      },
    })
  }

  const days = draft.length
  const counter = parts ? `${days} ${plural(days, 'DAY', 'DAYS')} × 3 = ${days * 3} OPTIONS` : `${days} ${plural(days, 'DAY', 'DAYS')}`

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add or remove days"
      description="Tap a day to add it or take it off. Answers on days you keep stay put."
      footer={open && (
        <div className="flex flex-col gap-3">
          {lossWarning && (
            <p className="flex items-start gap-2 text-sm text-ink-2">
              <CircleAlert aria-hidden size={16} className="mt-0.5 shrink-0" />
              <span>{lossWarning}</span>
            </p>
          )}
          {error && (
            <p role="alert" className="flex items-start gap-2 text-sm text-danger">
              <CircleAlert aria-hidden size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </p>
          )}
          <Button
            variant="accent"
            size="lg"
            fullWidth
            loading={busy}
            disabled={!changed || draft.length === 0}
            onClick={() => void save()}
          >
            {busy ? 'Saving…' : 'Save days'}
          </Button>
        </div>
      )}
    >
      {open && (
        <div className="flex flex-col gap-3 pt-1">
          <div className="flex items-center justify-between gap-3">
            <MonoLabel id={labelId} tone="ink-3">PICK SOME DAYS</MonoLabel>
            <span aria-live="polite" className="mono-label tabular text-ink-2">{counter}</span>
          </div>
          <CalendarPicker
            value={draft}
            onChange={next => {
              setDraft(next)
              setError(null)
            }}
            today={state.today}
            maxSelected={maxSelected}
            pinned={pinned}
            labelledBy={labelId}
            onLimit={() =>
              toast({ message: parts ? "That's the max with parts of the day: 20 days." : "That's the max: 62 days." })
            }
          />
          {pastInDraft.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sunken px-3 py-2">
              <p className="text-sm text-ink-2">
                {onlyPastLeft ? 'Every day here has passed. Pick new ones above.' : `${pastInDraft.length} ${plural(pastInDraft.length, 'day has', 'days have')} passed.`}
              </p>
              <Button
                variant="ghost"
                iconLeft={Trash2}
                onClick={() => setDraft(d => d.filter(x => x >= state.today || pinnedSet.has(x)))}
              >
                Remove past {plural(pastInDraft.length, 'day', 'days')}
              </Button>
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}
