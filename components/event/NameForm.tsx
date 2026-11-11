// NameForm: asks who you are once your days are in; explains a name clash and connection problems in place.
'use client'

import { CircleAlert, CloudOff } from 'lucide-react'
import { useId, useRef, useState, type FormEvent } from 'react'
import { cx } from '@/components/ui'
import { isRetryable } from '@/lib/client'
import type { ApiError, ApiResult, JoinResponse } from '@/lib/types'
import { PosterButton, PosterLink } from './Poster'

export interface NameFormProps {
  organiserName: string
  defaultName: string
  join: (name: string) => Promise<ApiResult<JoinResponse>>
  joinError: ApiError | null
  heading?: string
  submitLabel?: string
}

export function NameForm({ organiserName, defaultName, join, joinError, heading = 'Last thing. Who are you?', submitLabel = 'Send' }: NameFormProps) {
  const [name, setName] = useState(defaultName)
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [tried, setTried] = useState('')
  const [moreHelp, setMoreHelp] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()
  const errorId = `${id}-error`

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) {
      setLocalError('Add your name first.')
      inputRef.current?.focus()
      return
    }
    setLocalError(null)
    setTried(n)
    setMoreHelp(false)
    setBusy(true)
    const r = await join(n)
    setBusy(false)
    if (!r.ok && !isRetryable(r.error)) inputRef.current?.focus()
  }

  const retryable = !localError && joinError && isRetryable(joinError)
  const taken = !localError && joinError?.code === 'name_taken' && tried
  const apiError = joinError
    ? joinError.code === 'event_full'
      ? `This one's full (150 people). Tell ${organiserName}.`
      : taken
        ? `Someone's already called ${tried} here. Try ${tried} B.`
        : retryable ? "Couldn't reach Hangs. Check your connection and tap again." : joinError.message
    : null
  const error = localError ?? apiError

  return (
    <form onSubmit={submit} noValidate className="flex flex-1 flex-col">
      <label htmlFor={id} className="text-display leading-none font-extrabold tracking-poster text-balance lg:text-4xl">{heading}</label>
      <input
        ref={inputRef}
        id={id}
        value={name}
        onChange={e => { setName(e.target.value); setLocalError(null) }}
        placeholder="Your name"
        maxLength={40}
        autoComplete="given-name"
        autoCapitalize="words"
        enterKeyHint="send"
        aria-invalid={error && !retryable ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="mt-5 h-16 w-full rounded-none border-b-3 border-current bg-transparent text-3xl font-extrabold outline-none placeholder:text-current placeholder:opacity-60 focus-visible:outline-none"
      />
      {error && (
        <div id={errorId} role="alert" className={cx('mt-3 flex items-start gap-2 text-lg leading-snug')}>
          {retryable ? <CloudOff aria-hidden size={20} className="mt-0.5 shrink-0" /> : <CircleAlert aria-hidden size={20} className="mt-0.5 shrink-0" />}
          <span>
            {error}
            {taken && !moreHelp && <>{' '}<PosterLink className="min-h-0 font-bold" onClick={() => setMoreHelp(true)}>It&apos;s me</PosterLink></>}
            {taken && moreHelp && ` On the phone or app you used before, open this plan and copy your edit link, then open that link here. Or ask ${organiserName} to remove the old one.`}
          </span>
        </div>
      )}
      <PosterButton type="submit" loading={busy} className="mt-auto w-full">{busy ? 'Sending' : submitLabel}</PosterButton>
    </form>
  )
}
