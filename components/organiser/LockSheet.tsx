// LockSheet: organiser picks the day (date-ordered radio list, best day badged and preselected), optional time and place, then locks it in or saves changes.
'use client'

import { CircleAlert, X } from 'lucide-react'
import { useId, useState } from 'react'
import { Button, Field, MonoLabel, Sheet, TextInput, cx, useToast } from '@/components/ui'
import { lockEvent } from '@/lib/client'
import { PART_ORDER, plural } from '@/lib/format'
import type { EventState, RankedOption } from '@/lib/types'
import { tallyParts, tallySentence, whoPhrase } from '@/lib/people'
import { optionLabel, optionTiny } from './hooks'

export interface LockSheetProps {
  open: boolean
  onClose: () => void
  state: EventState
  onState: (next: EventState) => void
  mode: 'lock' | 'edit'
  preselect?: string   // option to start on when locking (the day being looked at)
}

const VISIBLE = 10

interface Draft { optionId: string; time: string; place: string; showAll: boolean }

// Upcoming days (plus the locked one when editing) in date order, so the list scans like a calendar.
function candidatesFor(state: EventState, editing: boolean): RankedOption[] {
  const lockedId = state.event.lock?.optionId
  return state.ranking.ranked
    .filter(o => !o.isPast || (editing && o.optionId === lockedId))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || PART_ORDER[a.part] - PART_ORDER[b.part])
}

function initialDraft(state: EventState, editing: boolean, preselect?: string): Draft {
  const lock = state.event.lock
  const candidates = candidatesFor(state, editing)
  const optionId = editing && lock
    ? lock.optionId
    : candidates.find(o => o.optionId === preselect)?.optionId ?? candidates.find(o => o.optionId === state.ranking.topOptionIds[0])?.optionId ?? candidates[0]?.optionId ?? ''
  return {
    optionId,
    time: editing && lock ? lock.time ?? '' : '',
    place: editing && lock ? lock.place : '',
    showAll: candidates.findIndex(o => o.optionId === optionId) >= VISIBLE,
  }
}

const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

export function LockSheet({ open, onClose, state, onState, mode, preselect }: LockSheetProps) {
  const { toast } = useToast()
  const formId = useId()
  const editing = mode === 'edit' && !!state.event.lock

  const [draft, setDraft] = useState<Draft>(() => initialDraft(state, editing, preselect))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset the draft each time the sheet opens (render-time state adjustment, no effect).
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setDraft(initialDraft(state, editing, preselect))
      setError(null)
      setBusy(false)
    }
  }

  const candidates = candidatesFor(state, editing)
  const selected = candidates.find(o => o.optionId === draft.optionId) ?? null
  const R = state.ranking.respondentCount
  const cantIds = selected ? state.tallies[selected.optionId]?.cant ?? [] : []
  const lockedId = state.event.lock?.optionId
  const hero = state.ranking.hero
  // The hero's pick(s): BEST for a clear leader, TIED for a tie the organiser is breaking.
  const badge = hero.kind === 'winner' || hero.kind === 'everyone' ? 'BEST' : hero.kind === 'tie' || hero.kind === 'wide_tie' ? 'TIED' : null
  const badged = new Set(badge ? (badge === 'BEST' ? hero.optionIds.slice(0, 1) : hero.optionIds) : [])

  const warning = !editing && R < 2
    ? R === 0
      ? "No one's answered yet. Lock anyway?"
      : `Only ${R} ${plural(R, 'person', 'people')} answered so far. Lock anyway?`
    : selected && cantIds.length > 0
      ? `${capitalise(whoPhrase(state, cantIds))} can't make ${optionTiny(selected)}.`
      : null

  const shown = draft.showAll ? candidates : candidates.slice(0, VISIBLE)
  const set = (patch: Partial<Draft>) => setDraft(d => ({ ...d, ...patch }))

  async function submit() {
    if (!selected || busy) return
    setBusy(true)
    setError(null)
    const r = await lockEvent(state.event.id, { optionId: selected.optionId, time: draft.time || null, place: draft.place.trim() })
    setBusy(false)
    if (!r.ok) {
      setError(r.error.message)
      return
    }
    onState(r.data)
    onClose()
    toast({ message: editing ? 'Saved. Share the plan again so everyone has the latest.' : 'Locked in. Share the plan with the group.' })
  }

  const footer = candidates.length === 0 ? undefined : (
    <div className="flex flex-col gap-3">
      {warning && (
        <p className="flex items-start gap-2 text-sm text-ink-2">
          <CircleAlert aria-hidden size={16} className="mt-0.5 shrink-0" />
          <span>{warning}</span>
        </p>
      )}
      {error && (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <CircleAlert aria-hidden size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
      <Button type="submit" form={formId} variant="accent" size="lg" fullWidth loading={busy} disabled={!selected}>
        {busy ? (editing ? 'Saving…' : 'Locking…') : editing ? 'Save changes' : `Lock in ${selected ? optionLabel(selected, state.today) : 'this day'}`}
      </Button>
    </div>
  )

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'Change time or place' : 'Lock it in'}
      description={editing ? undefined : "Everyone sees the day you pick, and each person's answer becomes their RSVP."}
      footer={open ? footer : undefined}
    >
      {open && candidates.length === 0 && (
        <p className="text-md text-ink-2">There are no upcoming days to lock. Add new days first.</p>
      )}
      {open && candidates.length > 0 && (
        <form
          id={formId}
          onSubmit={e => {
            e.preventDefault()
            void submit()
          }}
          className="flex flex-col gap-5 pt-1"
        >
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-2">
              <MonoLabel tone="ink-3">Which day</MonoLabel>
            </legend>
            {shown.map(o => {
              const checked = o.optionId === draft.optionId
              const tag = o.optionId === lockedId ? 'locked' : badged.has(o.optionId) ? badge?.toLowerCase() : null
              // The radio's accessible name is what the row shows ("Sat 21 Nov, best, 6 free, 1 can't"), not its id.
              const name = [optionLabel(o, state.today), tag, tallySentence(o)].filter(Boolean).join(', ')
              return (
                <label
                  key={o.optionId}
                  className={cx(
                    'flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border bg-surface px-4 py-2',
                    'transition-colors duration-(--dur-fast) hover:bg-hover',
                    'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink',
                    checked ? 'border-ink ring-1 ring-ink ring-inset' : 'border-line',
                  )}
                >
                  <input
                    type="radio"
                    name={`${formId}-day`}
                    value={o.optionId}
                    aria-label={name}
                    checked={checked}
                    data-autofocus={checked ? '' : undefined}
                    onChange={() => set({ optionId: o.optionId })}
                    className="h-5 w-5 shrink-0 accent-ink focus-visible:outline-none"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="truncate font-display text-base font-bold tracking-display text-ink">{optionLabel(o, state.today)}</span>
                      {o.optionId === lockedId && <span className="mono-label shrink-0 text-ink-3">Locked</span>}
                      {o.optionId !== lockedId && badged.has(o.optionId) && (
                        <span className={cx('mono-label shrink-0 rounded-sm px-1', badge === 'BEST' ? 'bg-ink text-white' : 'bg-sunken text-ink-2')}>{badge === 'BEST' ? 'Best' : 'Tied'}</span>
                      )}
                    </span>
                    {/* Each count stays whole; a wrap never strands a word or a separator. */}
                    <span className="mono-label tabular flex flex-wrap gap-x-3 text-ink-3">
                      {(tallyParts(o).length ? tallyParts(o).map(t => t.toLowerCase()) : ['no answers yet']).map(t => (
                        <span key={t} className="whitespace-nowrap">{t}</span>
                      ))}
                    </span>
                  </span>
                </label>
              )
            })}
            {!draft.showAll && candidates.length > VISIBLE && (
              <Button variant="ghost" onClick={() => set({ showAll: true })} className="self-start">
                Show all {candidates.length} days
              </Button>
            )}
          </fieldset>

          <Field label="Time" htmlFor={`${formId}-time`} optional>
            <div className="flex items-center gap-2">
              <TextInput
                id={`${formId}-time`}
                type="time"
                value={draft.time}
                onChange={e => set({ time: e.target.value })}
                className="min-w-0 flex-1"
              />
              {draft.time && (
                <Button variant="ghost" iconLeft={X} onClick={() => set({ time: '' })}>
                  Clear time
                </Button>
              )}
            </div>
          </Field>

          <Field label="Place" htmlFor={`${formId}-place`} optional>
            <TextInput
              id={`${formId}-place`}
              value={draft.place}
              onChange={e => set({ place: e.target.value })}
              placeholder="My place"
              maxLength={80}
              counter={{ max: 80 }}
              autoComplete="off"
            />
          </Field>
        </form>
      )}
    </Sheet>
  )
}
