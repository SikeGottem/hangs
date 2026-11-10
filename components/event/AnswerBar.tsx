// Sticky answer bar: name capture (never auto-focused), save status + progress + Done (with a blanks check), the
// "Saved" state with an edit link, and save-error retry. Errors are announced (role=alert).
'use client'

import { Check, CircleAlert, CloudOff, Link as LinkIcon, Pencil, RotateCw, X } from 'lucide-react'
import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Button, CopyButton, cx, SaveStatus, StickyBar, TextInput } from '@/components/ui'
import { isRetryable } from '@/lib/client'
import { plural } from '@/lib/format'
import type { ApiError, ApiResult, JoinResponse, SaveStatus as SaveStatusValue } from '@/lib/types'

export interface AnswerBarProps {
  organiserName: string
  isOrganiser: boolean
  locked: boolean                 // locked mode: only name capture and save errors
  hasPerson: boolean
  myAnswerCount: number
  answerableCount: number         // non-past options
  blankCount: number              // non-past options the viewer hasn't answered
  unit: (n: number) => string     // "day"/"days" or "slot"/"slots"
  needsName: boolean
  defaultName: string             // prefill for the name field (remembered name unless "Not you?")
  join: (name: string) => Promise<ApiResult<JoinResponse>>
  joinError: ApiError | null
  saveStatus: SaveStatusValue
  onRetry: () => void
  doneTapped: boolean
  quiet: boolean                  // answers loaded from the server, nothing changed on this device: no Done bar
  doneAccent: boolean             // nextAction === 'done'
  onDone: () => void
  onFillBlanksCant: () => void    // "Mark them can't" from the Done check
  onEdit: () => void
  editLink: string | null         // personal #p= link (guests only)
  className?: string
}

function Bar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <StickyBar className={cx('lg:px-0', className)}>
      {/* The bar bleeds to the screen edges on mobile; this re-insets its content to the page gutter. */}
      <div className="mx-auto flex w-full flex-col gap-2 px-[calc(var(--gutter)-0.75rem)] lg:px-0">{children}</div>
    </StickyBar>
  )
}

function SaveError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <p role="alert" className="flex min-w-0 flex-1 items-start gap-1.5 text-sm text-danger">
        <CircleAlert aria-hidden size={16} className="mt-0.5 shrink-0" />
        <span>Couldn&apos;t save your answers.</span>
      </p>
      <Button variant="secondary" iconLeft={RotateCw} onClick={onRetry}>Retry</Button>
    </div>
  )
}

function NameForm({ organiserName, defaultName, join, joinError }: Pick<AnswerBarProps, 'organiserName' | 'defaultName' | 'join' | 'joinError'>) {
  const [name, setName] = useState(defaultName)
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [tried, setTried] = useState('')        // the name last sent, for the short "already taken" line
  const [moreHelp, setMoreHelp] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()
  const errorId = `${id}-error`

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) {
      setLocalError('Add your name first.')
      // preventScroll: the bar is sticky, and a plain focus() scrolls to its in-flow spot at the end of the page.
      inputRef.current?.focus({ preventScroll: true })
      return
    }
    setLocalError(null)
    setTried(n)
    setMoreHelp(false)
    setBusy(true)
    const r = await join(n)
    setBusy(false)
    // A problem with the name itself (taken, invalid): put the person back in the field with the error.
    if (!r.ok && !isRetryable(r.error)) inputRef.current?.focus({ preventScroll: true })
  }

  // Connection problems read as a retry line, not as something wrong with the name.
  const retryable = !localError && joinError && isRetryable(joinError)
  // A taken name gets one short line in the bar (it sits over the page, often with the keyboard up); the longer
  // "is that you on another app?" help is one tap away.
  const taken = !localError && joinError?.code === 'name_taken' && tried
  const apiError = joinError
    ? joinError.code === 'event_full'
      ? `This one's full (150 people). Tell ${organiserName}.`
      : taken
        ? `Someone's already called ${tried} here. Try ${tried} B.`
        : retryable ? "Couldn't reach Hangs. Check your connection, then tap Save again." : joinError.message
    : null
  const error = localError ?? apiError

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold text-pretty text-ink">
        {`Add your name so ${organiserName} knows who's free`}
      </label>
      <div className="flex gap-2">
        <TextInput
          ref={inputRef}
          id={id}
          value={name}
          onChange={e => { setName(e.target.value); setLocalError(null) }}
          autoComplete="given-name"
          enterKeyHint="done"
          counter={{ max: 40, chars: true }}
          placeholder="Your name"
          invalid={!!error && !retryable}
          aria-describedby={error ? errorId : undefined}
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="accent" loading={busy} className="h-12">
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
      {error ? (
        <p id={errorId} role="alert" className={cx('flex items-start gap-1.5 text-sm', retryable ? 'text-ink-2' : 'text-danger')}>
          {retryable
            ? <CloudOff aria-hidden size={16} className="mt-0.5 shrink-0" />
            : <CircleAlert aria-hidden size={16} className="mt-0.5 shrink-0" />}
          <span>
            {error}
            {taken && !moreHelp && (
              <>
                {' '}
                <button type="button" onClick={() => setMoreHelp(true)} className="relative font-semibold text-ink underline underline-offset-2 after:absolute after:-inset-x-2 after:-inset-y-3">
                  It&apos;s me
                </button>
              </>
            )}
            {taken && moreHelp && (
              <>
                {` On the phone or app you used before, tap Done, then "Copy my edit link" and open that link here. Or ask ${organiserName} to remove the old one. `}
                <button
                  type="button"
                  onClick={() => {
                    setMoreHelp(false)
                    inputRef.current?.focus({ preventScroll: true })
                    inputRef.current?.select()
                  }}
                  className="relative font-semibold text-ink underline underline-offset-2 after:absolute after:-inset-x-2 after:-inset-y-3"
                >
                  Use another name
                </button>
              </>
            )}
          </span>
        </p>
      ) : (
        <SaveStatus status="unsaved" />
      )}
    </form>
  )
}

export function AnswerBar(props: AnswerBarProps) {
  const {
    organiserName, isOrganiser, locked, hasPerson, myAnswerCount, answerableCount, blankCount, unit, needsName, defaultName,
    join, joinError, saveStatus, onRetry, doneTapped, quiet, doneAccent, onDone, onFillBlanksCant, onEdit, editLink, className,
  } = props
  const [checkingBlanks, setCheckingBlanks] = useState(false)
  const saveError = saveStatus === 'error'

  // b) name capture: slides in after the first tap; the input is not focused automatically.
  if (needsName) {
    return (
      <Bar className={`animate-slide-up ${className ?? ''}`}>
        <NameForm organiserName={organiserName} defaultName={defaultName} join={join} joinError={joinError} />
        {saveError && <SaveError onRetry={onRetry} />}
      </Bar>
    )
  }

  if (locked) {
    return saveError ? <Bar className={className}><SaveError onRetry={onRetry} /></Bar> : null
  }

  // a) nobody yet and nothing tapped.
  if (!hasPerson && myAnswerCount === 0) {
    return saveError ? <Bar className={className}><SaveError onRetry={onRetry} /></Bar> : null
  }

  // Returning on another device (organiser link, edit link) with saved answers: nothing to confirm yet.
  if (hasPerson && quiet) {
    if (saveError) return <Bar className={className}><SaveError onRetry={onRetry} /></Bar>
    if (saveStatus === 'saving' || saveStatus === 'offline') return <Bar className={className}><SaveStatus status={saveStatus} /></Bar>
    return null
  }

  // d) after Done.
  if (hasPerson && doneTapped) {
    return (
      <Bar className={className}>
        <p className="text-md font-semibold text-pretty text-ink">
          {isOrganiser ? 'Saved. Lock a day once enough people answer.' : `Saved. ${organiserName} can see your days.`}
        </p>
        <div className="-ml-4 flex flex-wrap items-center gap-x-1">
          <Button variant="ghost" iconLeft={Pencil} onClick={onEdit}>Edit</Button>
          {!isOrganiser && editLink && <CopyButton variant="ghost" icon={LinkIcon} text={editLink} label="Copy my edit link" />}
        </div>
        {!isOrganiser && editLink && (
          <p className="text-sm text-pretty text-ink-3">Open this in another app to change your answers there.</p>
        )}
        {saveError ? <SaveError onRetry={onRetry} /> : saveStatus !== 'idle' && <SaveStatus status={saveStatus} />}
      </Bar>
    )
  }

  // c) answering: status and progress on the left, Done on the right once something is answered.
  const showDone = hasPerson && myAnswerCount >= 1
  if (!showDone && saveStatus === 'idle') return null

  const done = () => {
    if (blankCount > 0) {
      setCheckingBlanks(true)
      return
    }
    onDone()
  }
  const finish = (fill: boolean) => {
    setCheckingBlanks(false)
    if (fill) onFillBlanksCant()
    onDone()
  }

  return (
    <Bar className={className}>
      {saveError ? (
        <SaveError onRetry={onRetry} />
      ) : checkingBlanks && showDone && blankCount > 0 ? (
        <div role="group" aria-label="Unanswered days" className="flex flex-col gap-2">
          <p className="text-sm text-pretty text-ink">
            {`${blankCount} ${unit(blankCount)} still blank. ${isOrganiser ? 'They count as no answer.' : `${organiserName} will see ${plural(blankCount, 'it', 'them')} as not answered.`}`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" iconLeft={X} onClick={() => finish(true)}>
              {`Mark ${plural(blankCount, 'it', 'them')} can't`}
            </Button>
            <Button variant="ghost" onClick={() => finish(false)}>Leave blank</Button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-11 items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            {showDone && (
              <span className="mono-label tabular text-ink-2">{`ANSWERED ${answerableCount - blankCount} OF ${answerableCount}`}</span>
            )}
            <SaveStatus status={saveStatus} className="min-w-0" />
          </div>
          {showDone && (
            <Button variant={doneAccent ? 'accent' : 'primary'} iconLeft={Check} onClick={done}>Done</Button>
          )}
        </div>
      )}
    </Bar>
  )
}
