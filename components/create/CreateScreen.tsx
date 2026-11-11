// The home page create form: title, note, candidate days (calendar + presets), answer mode, organiser name, submit.
'use client'

import { CircleAlert } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { CalendarPicker, cx, prefersReducedMotion, useMounted, useToast, Wordmark } from '@/components/ui'
import { Poster, PosterButton, PosterFoot, PosterLink } from '@/components/event/Poster'
import { createEvent, getRememberedName } from '@/lib/client'
import { addDays, isValidTimeZone, nextDays, nextWeekends, todayIn } from '@/lib/dates'
import { plural } from '@/lib/format'
import { COBALT } from '@/lib/poster'
import type { EventMode } from '@/lib/types'
import { RecentHangs } from './RecentHangs'

type FieldKey = 'title' | 'dates' | 'name'

const MAX_DAYS = 62
const MAX_PART_DAYS = 20
const FALLBACK_TZ = 'Australia/Sydney'
const HAS_LETTER = /[\p{L}\p{N}]/u

function deviceTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return tz && isValidTimeZone(tz) ? tz : FALLBACK_TZ
  } catch {
    return FALLBACK_TZ
  }
}

// Enter in a single-line field moves on instead of submitting the form half-filled.
function onEnter(e: KeyboardEvent<HTMLInputElement>, next: () => void) {
  if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
  e.preventDefault()
  next()
}

export function CreateScreen() {
  const router = useRouter()
  const { toast } = useToast()
  const mounted = useMounted()
  const tz = useMemo(() => (mounted ? deviceTimeZone() : FALLBACK_TZ), [mounted])
  // Client-only so SSR never renders a date; recomputed each render so a page left open past midnight stays honest.
  const today = mounted ? todayIn(tz) : null

  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const remembered = mounted ? getRememberedName() : ''
  const name = nameDraft ?? remembered
  const [noteOpen, setNoteOpen] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [dates, setDates] = useState<string[]>([])
  const [mode, setMode] = useState<EventMode>('days')
  const [viewDate, setViewDate] = useState<string | undefined>(undefined)
  const [revealed, setRevealed] = useState<ReadonlySet<FieldKey>>(() => new Set())
  const [submitting, setSubmitting] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  const titleRef = useRef<HTMLInputElement>(null)
  const noteRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const daysRef = useRef<HTMLElement>(null)

  useEffect(() => {
    try {
      if (window.matchMedia('(pointer: fine)').matches) titleRef.current?.focus()
    } catch {
      // matchMedia unavailable: leave focus alone.
    }
  }, [])

  const liveDates = today ? dates.filter(d => d >= today) : dates
  const n = liveDates.length
  const maxSelected = mode === 'parts' ? MAX_PART_DAYS : MAX_DAYS

  const titleOk = title.trim().length > 0
  const nameOk = HAS_LETTER.test(name)
  const missing: FieldKey | null = !titleOk ? 'title' : n === 0 ? 'dates' : !nameOk ? 'name' : null

  const showError = (k: FieldKey) =>
    revealed.has(k) && (k === 'title' ? !titleOk : k === 'dates' ? n === 0 : !nameOk)
  const titleError = showError('title') ? 'Add a title, like "Picnic at mine".' : undefined
  const nameError = showError('name')
    ? name.trim() ? 'Use at least one letter or number.' : "Add your name so friends know who's asking."
    : undefined
  const datesError = showError('dates')

  const onLimit = () => {
    toast({
      message: mode === 'parts' ? "That's the max with parts of the day: 20 days." : "That's the max: 62 days.",
    })
  }

  // Preset changes jump the calendar to the first date they added.
  const onPresetChange = (next: string[]) => {
    const before = new Set(liveDates)
    const added = next.filter(d => !before.has(d))
    setViewDate(added.length > 0 ? added[0] : undefined)
    setDates(next)
  }

  const changeMode = (m: EventMode) => {
    if (m === mode) return
    setMode(m)
    if (m === 'parts' && liveDates.length > MAX_PART_DAYS) {
      setDates(liveDates.slice(0, MAX_PART_DAYS))
      toast({ message: 'Parts of the day allows up to 20 days. Kept the first 20.' })
    }
  }

  const focusMissing = (k: FieldKey) => {
    if (k === 'title') titleRef.current?.focus()
    else if (k === 'name') nameRef.current?.focus()
    else {
      const el = daysRef.current
      if (!el) return
      el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' })
      el.focus({ preventScroll: true })
    }
  }

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (submitting) return
    if (missing) {
      // Commit the inline error first, so the focused field is read with its (role=alert) error attached.
      flushSync(() => setRevealed(prev => new Set(prev).add(missing)))
      focusMissing(missing)
      return
    }
    setSubmitting(true)
    setApiError(null)
    const res = await createEvent({ title, note, organiserName: name, mode, dates: liveDates, tz })
    if (res.ok) {
      router.replace(`/h/${res.data.id}`)
      return // keep the loading state until the event page takes over
    }
    const message = res.error.code === 'network'
      ? "Couldn't reach Hangs. Check your connection and try again."
      : res.error.message
    // Shown once, inline above the button (role=alert announces it); no duplicate toast.
    setApiError(message)
    setSubmitting(false)
  }

  const counter = `${n} ${plural(n, 'day', 'days')}`

  const weekends = today ? nextWeekends(today, 3) : []
  const threeWeeks = today ? nextDays(addDays(today, 1), 21) : []
  const addPreset = (preset: string[]) => onPresetChange([...new Set([...liveDates, ...preset])].sort().slice(0, maxSelected))

  // A remembered name is one line with a "change" link; the field appears only to edit it or to fix an error.
  const nameAsLine = !editingName && nameDraft === null && nameOk && !nameError
  const startEditingName = () => {
    flushSync(() => setEditingName(true))
    nameRef.current?.focus()
  }
  const openNote = () => {
    flushSync(() => setNoteOpen(true))
    noteRef.current?.focus()
  }
  const buttonLabel = submitting ? 'Making the link'
    : missing === 'title' ? 'Add what the plan is'
      : missing === 'dates' ? 'Pick some days'
        : missing === 'name' ? 'Add your name'
          : 'Send to the group'
  const inputLine = 'w-full bg-transparent outline-none placeholder:text-current placeholder:opacity-70 focus-visible:outline-none'

  return (
    <Poster colour={COBALT} accent>
      <header className="flex items-center justify-between">
        <Wordmark />
        <p className="text-md font-medium">No sign-up</p>
      </header>
      <h1 className="sr-only">Find the day everyone&rsquo;s free</h1>

      <form noValidate aria-label="Make a plan" onSubmit={submit} className="mt-3 flex flex-1 flex-col lg:mt-8 lg:grid lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:gap-x-16">
        <div className="flex flex-col lg:col-start-1 lg:row-start-1">
          <label htmlFor="create-title" className="text-lg font-medium">What&apos;s the plan?</label>
          <input
            ref={titleRef}
            id="create-title"
            name="title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => onEnter(e, () => noteRef.current?.focus())}
            placeholder="Picnic at mine"
            maxLength={60}
            autoComplete="off"
            autoCapitalize="sentences"
            enterKeyHint="next"
            aria-invalid={titleError ? true : undefined}
            aria-describedby={titleError ? 'title-error' : undefined}
            className={cx(inputLine, 'h-14 text-title font-extrabold tracking-poster')}
          />
          {titleError && <FormError id="title-error">{titleError}</FormError>}

          {noteOpen || note ? (
            <label className="flex min-h-11 items-center gap-3 border-b-2 border-current">
              <span className="sr-only">Where, or a note (optional)</span>
              <input
                ref={noteRef}
                id="create-note"
                name="note"
                value={note}
                onChange={e => setNote(e.target.value)}
                onKeyDown={e => onEnter(e, () => noteRef.current?.blur())}
                placeholder="Where, or a note (optional)"
                maxLength={140}
                autoComplete="off"
                autoCapitalize="sentences"
                enterKeyHint="done"
                className={cx(inputLine, 'text-lg font-medium')}
              />
            </label>
          ) : (
            <div><PosterLink onClick={openNote}>Add a place or note</PosterLink></div>
          )}
        </div>

        <section ref={daysRef} tabIndex={-1} aria-labelledby="days-label" aria-describedby={datesError ? 'days-error' : undefined} className="mt-3 flex scroll-mt-6 flex-col rounded-lg outline-none lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0">
          <h2 id="days-label" className="sr-only">Which days could work?</h2>
          <div role="group" aria-label="Quick picks" className="mb-3 flex flex-wrap gap-2">
            {[{ label: 'Next 3 weekends', preset: weekends }, { label: 'Next 3 weeks', preset: threeWeeks }].map(({ label, preset }) => (
              <button
                key={label}
                type="button"
                onClick={() => addPreset(preset)}
                className="min-h-11 rounded-md border-2 border-current px-3 text-md font-extrabold whitespace-nowrap transition duration-(--dur-fast) active:scale-[0.97]"
              >
                {label}
              </button>
            ))}
            {n > 0 && (
              <button type="button" onClick={() => setDates([])} className="min-h-11 rounded-md px-2 text-md font-medium underline underline-offset-4">
                Clear
              </button>
            )}
          </div>
          {today ? (
            <CalendarPicker value={liveDates} onChange={setDates} today={today} maxSelected={maxSelected} onLimit={onLimit} labelledBy="days-label" viewDate={viewDate} />
          ) : (
            <div aria-hidden className="h-92" />
          )}
          <div className="flex flex-wrap items-center justify-between gap-x-4">
            <PosterLink onClick={() => changeMode(mode === 'days' ? 'parts' : 'days')} aria-pressed={mode === 'parts'}>
              {mode === 'days' ? 'Ask morning, arvo or evening' : 'Just ask whole days'}
            </PosterLink>
          </div>
          {datesError && <FormError id="days-error">Tap at least one day on the calendar.</FormError>}
        </section>

        <PosterFoot className="gap-2 lg:col-start-1 lg:row-start-2 lg:mt-0 lg:self-end">
          <div className="flex min-h-11 items-center justify-between gap-3">
            <span aria-live="polite" className="text-lg font-extrabold whitespace-nowrap tabular">{counter}</span>
            {nameAsLine ? (
              <span className="flex min-w-0 items-center gap-2 text-lg">
                <span className="truncate">as {name.trim()}</span>
                <PosterLink onClick={startEditingName} aria-label={`Change your name from ${name.trim()}`}>change</PosterLink>
              </span>
            ) : (
              <label className="flex min-h-11 min-w-0 flex-1 items-center gap-3 border-b-2 border-current">
                <span className="text-lg font-medium whitespace-nowrap">Your name</span>
                <input
                  ref={nameRef}
                  id="create-name"
                  name="name"
                  value={name}
                  onChange={e => setNameDraft(e.target.value)}
                  maxLength={40}
                  autoComplete="given-name"
                  autoCapitalize="words"
                  enterKeyHint="go"
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={nameError ? 'name-error' : undefined}
                  className={cx(inputLine, 'min-w-0 text-right text-h2 font-extrabold')}
                />
              </label>
            )}
          </div>
          {nameError && <FormError id="name-error">{nameError}</FormError>}
          {apiError && <FormError>{apiError}</FormError>}
          <PosterButton type="submit" loading={submitting} className="w-full">
            {buttonLabel}
          </PosterButton>
        </PosterFoot>
      </form>

      <RecentHangs className="mt-8 lg:max-w-[calc(50%-2rem)]" />
      <footer className="mt-4">
        <Link href="/privacy" className="inline-flex min-h-11 items-center rounded-sm text-md underline underline-offset-4">Privacy</Link>
      </footer>
    </Poster>
  )
}

function FormError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-1 flex items-start gap-1.5 text-lg leading-snug font-medium">
      <CircleAlert aria-hidden size={20} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}
