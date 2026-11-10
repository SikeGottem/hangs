// The home page create form: title, note, candidate days (calendar + presets), answer mode, organiser name, submit.
'use client'

import { ArrowRight, CircleAlert, Clock, Sun } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { flushSync } from 'react-dom'
import {
  Button, CalendarPicker, Card, Field, MonoLabel, prefersReducedMotion, Segmented, Skeleton, StickyBar, TextInput, useMounted, useToast, Wordmark,
} from '@/components/ui'
import { createEvent, getRememberedName } from '@/lib/client'
import { isValidTimeZone, todayIn } from '@/lib/dates'
import { formatDate, plural } from '@/lib/format'
import type { EventMode } from '@/lib/types'
import { DatePresets } from './DatePresets'
import { RecentHangs } from './RecentHangs'

type FieldKey = 'title' | 'dates' | 'name'

const MAX_DAYS = 62
const MAX_PART_DAYS = 20
const FALLBACK_TZ = 'Australia/Sydney'
const HAS_LETTER = /[\p{L}\p{N}]/u
const HELP: Record<FieldKey, string> = { title: 'Add a title', dates: 'Pick at least one day', name: 'Add your name' }
const MODE_OPTIONS: { value: EventMode; label: string; icon: typeof Sun }[] = [
  { value: 'days', label: 'Whole days', icon: Sun },
  { value: 'parts', label: 'Parts of the day', icon: Clock },
]

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
  const name = nameDraft ?? (mounted ? getRememberedName() : '')
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
  const complete = missing === null

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

  const counter = n === 0
    ? 'No days yet'
    : mode === 'parts'
      ? `${n} ${plural(n, 'day', 'days')} × 3 = ${n * 3} options`
      : `${n} ${plural(n, 'day', 'days')}`

  const range = n === 0 || !today
    ? null
    : n === 1
      ? formatDate(liveDates[0], { today })
      : `${formatDate(liveDates[0], { today })} – ${formatDate(liveDates[n - 1], { today })}`

  return (
    <div className="mx-auto w-full max-w-(--col-max) px-(--gutter) min-[960px]:max-w-260">
      <header className="flex h-14 items-center">
        <Wordmark />
      </header>

      <main>
        <form
          noValidate
          aria-label="Make a plan"
          onSubmit={submit}
          className="flex flex-col gap-6 pt-3 min-[960px]:grid min-[960px]:grid-cols-[minmax(0,1fr)_var(--create-side)] min-[960px]:items-start min-[960px]:gap-x-(--create-gap) min-[960px]:gap-y-8 min-[960px]:pt-12"
        >
          {/* Intro + title + note */}
          <div className="flex flex-col gap-6 min-[960px]:col-start-1 min-[960px]:row-start-1">
            <div className="flex flex-col gap-3">
              <MonoLabel as="p" tone="ink-3">Find the day · No sign-up</MonoLabel>
              <h1 className="font-display text-display leading-display font-extrabold tracking-display text-balance text-ink min-[960px]:text-4xl">
                Find the day everyone&rsquo;s free.
              </h1>
              <p className="max-w-[34ch] text-base text-ink-2">
                Pick some days, send one link, see who&rsquo;s free. Works on any phone.
              </p>
            </div>

            <Field label="What's the plan?" htmlFor="create-title" error={titleError}>
              <TextInput
                ref={titleRef}
                id="create-title"
                name="title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                onKeyDown={e => onEnter(e, () => noteRef.current?.focus())}
                placeholder="Picnic at mine"
                maxLength={60}
                counter={{ max: 60 }}
                autoComplete="off"
                autoCapitalize="sentences"
                enterKeyHint="next"
              />
            </Field>

            <Field label="Where, or a note" htmlFor="create-note" optional>
              <TextInput
                ref={noteRef}
                id="create-note"
                name="note"
                value={note}
                onChange={e => setNote(e.target.value)}
                onKeyDown={e => onEnter(e, () => noteRef.current?.blur())}
                placeholder="My place, bring a rug"
                maxLength={140}
                counter={{ max: 140 }}
                autoComplete="off"
                autoCapitalize="sentences"
                enterKeyHint="done"
              />
            </Field>
          </div>

          {/* Calendar card */}
          <Card
            className="min-[960px]:sticky min-[960px]:top-6 min-[960px]:col-start-2 min-[960px]:row-span-3 min-[960px]:row-start-1"
          >
            <section
              ref={daysRef}
              tabIndex={-1}
              aria-labelledby="days-label"
              aria-describedby={datesError ? 'days-error' : undefined}
              className="flex scroll-mt-6 flex-col gap-3 rounded-lg"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <MonoLabel as="h2" id="days-label" tone="ink">Pick some days</MonoLabel>
                <span aria-live="polite" className="mono-label tabular text-ink-2">{counter}</span>
              </div>

              {today ? (
                <>
                  <DatePresets
                    today={today}
                    value={liveDates}
                    onChange={onPresetChange}
                    maxSelected={maxSelected}
                    onLimit={onLimit}
                  />
                  <CalendarPicker
                    value={liveDates}
                    onChange={setDates}
                    today={today}
                    maxSelected={maxSelected}
                    onLimit={onLimit}
                    labelledBy="days-label"
                    viewDate={viewDate}
                  />
                </>
              ) : (
                <div aria-hidden className="flex flex-col gap-3">
                  <div className="flex gap-2">
                    <Skeleton className="h-10 w-40" />
                    <Skeleton className="h-10 w-32" />
                  </div>
                  <Skeleton className="h-11 w-44" />
                  <Skeleton className="aspect-[7/6] w-full" />
                </div>
              )}

              {range && <p className="mono-label tabular text-ink-2">{range}</p>}
              {datesError && (
                <p id="days-error" role="alert" className="flex items-start gap-1.5 text-sm text-danger">
                  <CircleAlert aria-hidden size={16} className="mt-0.5 shrink-0" />
                  <span>Pick at least one day. Tap them on the calendar or use a quick pick.</span>
                </p>
              )}
            </section>
          </Card>

          {/* Mode + name */}
          <div className="flex flex-col gap-6 min-[960px]:col-start-1 min-[960px]:row-start-2">
            <div className="flex flex-col gap-1.5">
              <p id="create-mode-label" className="text-sm font-semibold text-ink">Whole days or parts of the day?</p>
              <Segmented label="Whole days or parts of the day?" value={mode} onChange={changeMode} options={MODE_OPTIONS} />
              <p className="text-sm text-ink-3">Parts of the day: friends answer morning, afternoon and evening for each day.</p>
            </div>

            <Field label="Your name" htmlFor="create-name" error={nameError}>
              <TextInput
                ref={nameRef}
                id="create-name"
                name="name"
                value={name}
                onChange={e => setNameDraft(e.target.value)}
                placeholder="So friends know who's asking"
                counter={{ max: 40, chars: true }}
                autoComplete="given-name"
                autoCapitalize="words"
                enterKeyHint="go"
              />
            </Field>
          </div>

          {/* Submit: sticky on mobile, a static block at the end of the left column on desktop */}
          <StickyBar
            className="-mx-(--gutter) min-[960px]:static min-[960px]:col-start-1 min-[960px]:row-start-3 min-[960px]:mx-0 min-[960px]:bg-transparent min-[960px]:px-0 min-[960px]:shadow-none"
          >
            {/* The bar bleeds to the screen edges on mobile; this re-insets its content to the gutter. */}
            <div className="flex flex-col gap-2 px-[calc(var(--gutter)-0.75rem)] min-[960px]:px-0">
              {apiError && (
                <p role="alert" className="flex items-start gap-1.5 text-sm text-danger">
                  <CircleAlert aria-hidden size={16} className="mt-0.5 shrink-0" />
                  <span>{apiError}</span>
                </p>
              )}
              <p id="create-helper" aria-live="polite" className={complete ? 'sr-only' : 'text-sm text-ink-3'}>
                {missing ? HELP[missing] : ''}
              </p>
              <Button
                type="submit"
                size="lg"
                fullWidth
                variant={complete ? 'accent' : 'secondary'}
                iconRight={ArrowRight}
                loading={submitting}
                aria-disabled={complete ? undefined : true}
                aria-describedby={complete ? undefined : 'create-helper'}
              >
                {submitting ? 'Making the link…' : 'Make the link'}
              </Button>
            </div>
          </StickyBar>
        </form>

        <RecentHangs className="mt-10 min-[960px]:mt-16 min-[960px]:max-w-[calc(100%-var(--create-side)-var(--create-gap))]" />
      </main>

      <footer className="flex pt-8 pb-10">
        <Link
          href="/privacy"
          className="inline-flex min-h-11 items-center rounded-sm text-sm text-ink-3 underline-offset-4 hover:text-ink hover:underline"
        >
          Privacy
        </Link>
      </footer>
    </div>
  )
}
