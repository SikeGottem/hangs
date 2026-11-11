// "Answering as {name} · Change" line with an inline rename editor (renameMe); shows API errors such as name_taken inline.
'use client'

import { CircleAlert } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Button, TextInput } from '@/components/ui'
import { renameMe } from '@/lib/client'
import type { EventState } from '@/lib/types'

export interface IdentityLineProps {
  eventId: string
  name: string
  editing: boolean
  onEditingChange: (editing: boolean) => void
  onState: (next: EventState) => void
}

export function IdentityLine({ eventId, name, editing, onEditingChange, onState }: IdentityLineProps) {
  const changeRef = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(false)

  // Return focus to "Change" when the editor closes.
  useEffect(() => {
    if (!editing && wasEditing.current) changeRef.current?.focus()
    wasEditing.current = editing
  }, [editing])

  if (editing) {
    return <RenameForm eventId={eventId} name={name} onClose={() => onEditingChange(false)} onState={onState} />
  }

  return (
    <p className="flex min-h-11 flex-wrap items-center gap-x-1 text-sm text-ink-2">
      <span className="min-w-0 truncate">
        Answering as <span className="font-semibold text-ink">{name}</span>
      </span>
      <span aria-hidden>·</span>
      <button
        ref={changeRef}
        type="button"
        onClick={() => onEditingChange(true)}
        className="-mx-1 inline-flex min-h-11 items-center rounded-sm px-1 font-semibold text-ink underline underline-offset-4"
      >
        Change<span className="sr-only"> your name</span>
      </button>
    </p>
  )
}

function RenameForm({ eventId, name, onClose, onState }: { eventId: string; name: string; onClose: () => void; onState: (next: EventState) => void }) {
  const [draft, setDraft] = useState(name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const errorId = `${inputId}-error`

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next = draft.trim()
    if (!next) {
      setError('Add your name first.')
      inputRef.current?.focus()
      return
    }
    if (next === name) {
      onClose()
      return
    }
    setBusy(true)
    const r = await renameMe(eventId, next)
    setBusy(false)
    if (r.ok) {
      onState(r.data)
      onClose()
    } else {
      setError(r.error.message)
      inputRef.current?.focus()
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2 py-1">
      <label htmlFor={inputId} className="text-sm font-semibold text-ink">Your name</label>
      <div className="flex gap-2">
        <TextInput
          ref={inputRef}
          id={inputId}
          value={draft}
          onChange={e => { setDraft(e.target.value); setError(null) }}
          onKeyDown={e => { if (e.key === 'Escape') onClose() }}
          counter={{ max: 40, chars: true }}
          autoComplete="given-name"
          enterKeyHint="done"
          invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="secondary" loading={busy} className="h-12">Save</Button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="flex items-start gap-1.5 text-sm text-danger">
          <CircleAlert aria-hidden size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
      <Button variant="ghost" onClick={onClose} className="-ml-4 self-start">Cancel</Button>
    </form>
  )
}
