// EditDetailsForm: organiser edits the hang's title and note; saves only changed fields.
'use client'

import { useId, useState } from 'react'
import { Button, Field, TextArea, TextInput, useToast } from '@/components/ui'
import { updateEventDetails } from '@/lib/client'
import type { OrganiserBaseProps } from './hooks'

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim()

export function EditDetailsForm({ state, onState }: OrganiserBaseProps) {
  const { toast } = useToast()
  const id = useId()
  const [title, setTitle] = useState(state.event.title)
  const [note, setNote] = useState(state.event.note)
  const [busy, setBusy] = useState(false)
  const [titleError, setTitleError] = useState<string | null>(null)

  const titleChanged = tidy(title) !== state.event.title
  const noteChanged = tidy(note) !== state.event.note
  const dirty = titleChanged || noteChanged

  async function save() {
    if (!dirty || busy) return
    if (!tidy(title)) {
      setTitleError('Add a title.')
      return
    }
    setBusy(true)
    const patch: { title?: string; note?: string } = {}
    if (titleChanged) patch.title = tidy(title)
    if (noteChanged) patch.note = tidy(note)
    const r = await updateEventDetails(state.event.id, patch)
    setBusy(false)
    if (!r.ok) {
      toast({ message: r.error.message, tone: 'error' })
      return
    }
    onState(r.data)
    setTitle(r.data.event.title)
    setNote(r.data.event.note)
    toast({ message: 'Saved.' })
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={e => {
        e.preventDefault()
        void save()
      }}
    >
      <Field label="What's the plan?" htmlFor={`${id}-title`} error={titleError ?? undefined}>
        <TextInput
          id={`${id}-title`}
          value={title}
          onChange={e => {
            setTitle(e.target.value)
            setTitleError(null)
          }}
          maxLength={60}
          counter={{ max: 60 }}
          autoComplete="off"
          enterKeyHint="done"
        />
      </Field>
      <Field label="Where, or a note" htmlFor={`${id}-note`} optional>
        <TextArea
          id={`${id}-note`}
          value={note}
          onChange={e => setNote(e.target.value)}
          maxLength={140}
          counter={{ max: 140 }}
          placeholder="My place, bring a rug"
        />
      </Field>
      <Button type="submit" variant="secondary" loading={busy} disabled={!dirty} className="self-start">
        {busy ? 'Saving…' : 'Save details'}
      </Button>
    </form>
  )
}
