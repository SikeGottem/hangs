// Event page: picks the poster to show (share, answer, result or the locked invitation) and wires them to useEvent.
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LockedInvitation } from '@/components/locked'
import { scrollToId, useClientValue, useOrigin, useToast } from '@/components/ui'
import { hasShared, isIdentityPersisted, markShared, readIdentity, useEvent } from '@/lib/client'
import { dayColour } from '@/lib/poster'
import { bestDaySentence } from '@/lib/rank'
import { copyText, organiserLink } from '@/lib/share'
import { LOCAL_PERSON_ID } from '@/lib/state'
import type { EventState } from '@/lib/types'
import { AnswerFlow } from './AnswerFlow'
import { ConnectionBanner } from './ConnectionBanner'
import { IdentityLine } from './IdentityLine'
import { Poster } from './Poster'
import { ResultPoster } from './ResultPoster'
import { SharePoster, type ShareHow } from './SharePoster'

type View = 'share' | 'answer' | 'result'

export function EventPage({ initialState }: { initialState: EventState }) {
  const eventId = initialState.event.id
  const ev = useEvent(eventId, initialState)
  const {
    state, identity, hydrated, primed, myAnswers, myAnswerCount, needsName, autoJoined, rememberedName, notMe, join, joinError,
    saveStatus, retrySave, applyState, connection, pollFailures, setAnswer, setAnswers,
  } = ev
  const { toast } = useToast()
  const origin = useOrigin()

  const isOrganiser = state.viewer.isOrganiser
  const lock = state.event.lock
  const hero = state.ranking.hero
  const hasPerson = !!(state.viewer.personId || identity.personToken || identity.organiserKey)

  const storedShared = useClientValue(() => hasShared(eventId), false)
  const othersAnswered = state.people.some(p => !p.isOrganiser && p.id !== LOCAL_PERSON_ID && p.answeredCount > 0)
  const keyAtRisk = useClientValue(() => !isIdentityPersisted(eventId), false)
  const hadIdentity = useClientValue(() => {
    const id = readIdentity(eventId)
    return !!(id.personToken || id.organiserKey)
  }, false)

  const future = state.options.filter(o => !o.isPast)
  const blanks = future.filter(o => !myAnswers[o.id])
  const decided = hydrated || primed

  const [view, setView] = useState<View | null>(null)

  // After an unlock the results are what's worth seeing.
  const [prevLocked, setPrevLocked] = useState(!!lock)
  if (!!lock !== prevLocked) {
    setPrevLocked(!!lock)
    if (!lock) setView('result')
  }

  // Which poster opens is decided once, as soon as we know who's looking, and never changes under the thumb.
  const [startOptionId, setStartOptionId] = useState<string | null>(null)
  if (view === null && decided) {
    if (future.length === 0) setView('result')
    else if (isOrganiser) setView(!(storedShared || othersAnswered) ? 'share' : othersAnswered || blanks.length === 0 ? 'result' : 'answer')
    else setView(blanks.length > 0 ? 'answer' : 'result')
  }

  // Name line on the result poster, and the "Not me" path after being auto-joined under a remembered name.
  const [renaming, setRenaming] = useState(false)
  const autoToastShown = useRef(false)
  useEffect(() => {
    if (!autoJoined || autoToastShown.current) return
    autoToastShown.current = true
    toast({
      message: `Answering as ${state.viewer.name ?? 'you'}`,
      action: {
        label: 'Not me',
        onClick: () => {
          notMe()
          setRenaming(true)
          setView('result')
          requestAnimationFrame(() => scrollToId('identity'))
        },
      },
    })
  }, [autoJoined, notMe, state.viewer.name, toast])

  // One persistent, visually hidden live region for best-day changes.
  const [live, setLive] = useState('')
  const heroKey = lock ? '' : `${hero.kind}:${hero.optionIds[0] ?? ''}`
  const heroSentence = useRef(bestDaySentence(hero))
  useEffect(() => { heroSentence.current = bestDaySentence(hero) }, [hero])
  const lastHeroKey = useRef<string | null>(null)
  useEffect(() => {
    if (!hydrated || !heroKey) return
    if (lastHeroKey.current === null || lastHeroKey.current === heroKey) {
      lastHeroKey.current = heroKey
      return
    }
    lastHeroKey.current = heroKey
    const t = setTimeout(() => setLive(heroSentence.current), 1500)
    return () => clearTimeout(t)
  }, [heroKey, hydrated])

  // Locking or unlocking swaps the whole page; move focus to the new heading, and land back on results after unlocking.
  const wasLocked = useRef(!!lock)
  useEffect(() => {
    const now = !!lock
    if (now === wasLocked.current) return
    wasLocked.current = now
    const active = document.activeElement
    if (active && active !== document.body) return
    document.getElementById(now ? 'locked-title' : 'invite-title')?.focus()
  }, [lock])

  useEffect(() => {
    if (lock && isOrganiser) markShared(eventId)
  }, [eventId, isOrganiser, lock])

  const viewerIds = useMemo(() => {
    const s = new Set<string>([LOCAL_PERSON_ID])
    if (state.viewer.personId) s.add(state.viewer.personId)
    return s
  }, [state.viewer.personId])

  const reminded = useRef(false)
  const onShared = useCallback((how: ShareHow) => {
    const first = !reminded.current && !hasShared(eventId)
    reminded.current = true
    markShared(eventId)
    setView(v => (v === 'share' ? (myAnswerCount > 0 ? 'result' : 'answer') : v))
    const key = identity.organiserKey
    const copied = how === 'copied'
    if (how === 'hidden') return
    if (!first || !key) {
      if (copied) toast({ message: 'Copied. Paste it in the chat.' })
      return
    }
    toast({
      message: copied ? 'Copied. Save your organiser link too, for other devices.' : 'Save your organiser link for other devices.',
      action: {
        label: 'Copy',
        onClick: () => {
          void copyText(organiserLink(window.location.origin, eventId, key)).then(ok => {
            toast(ok ? { message: 'Organiser link copied. Keep it private.' } : { message: "Couldn't copy. Long-press the link instead.", tone: 'error' })
          })
        },
      },
      durationMs: 8000,
    })
  }, [eventId, identity.organiserKey, myAnswerCount, toast])

  const onFinished = useCallback(() => setView('result'), [])
  const onChangeAnswers = useCallback((optionId: string | null) => {
    setStartOptionId(optionId)
    setView('answer')
  }, [])

  const banner = <ConnectionBanner connection={connection} pollFailures={pollFailures} className="fixed inset-x-4 top-3 z-20 text-ink" />
  const liveRegion = <div role="status" aria-live="polite" className="sr-only">{live}</div>

  const myLockedAnswer = lock ? myAnswers[lock.optionId] ?? null : null
  if (lock) {
    return (
      <>
        {liveRegion}
        {banner}
        <LockedInvitation
          state={state}
          origin={origin}
          onState={applyState}
          viewerAnswer={myLockedAnswer}
          onAnswer={v => setAnswer(lock.optionId, v)}
          saveStatus={saveStatus}
          needsName={needsName && !hasPerson}
          defaultName={rememberedName ?? ''}
          join={join}
          joinError={joinError}
        />
      </>
    )
  }

  // A returning visitor waits a beat for their own answers rather than seeing the first-visit screen flash by.
  const current: View | 'loading' = view ?? (hadIdentity ? 'loading' : 'answer')
  if (current === 'loading') {
    return <Poster colour={dayColour(state.options[0]?.date ?? state.today)}><span className="sr-only">Loading your answers</span></Poster>
  }

  const personName = state.viewer.personId ? state.viewer.name : null

  return (
    <>
      {liveRegion}
      {banner}
      {current === 'share' && (
        <SharePoster state={state} origin={origin} organiserKey={identity.organiserKey} keyAtRisk={keyAtRisk} onShared={onShared} />
      )}
      {current === 'answer' && (
        <AnswerFlow
          key={startOptionId ?? 'start'}
          state={state}
          origin={origin}
          onState={applyState}
          myAnswers={myAnswers}
          viewerIds={viewerIds}
          setAnswer={setAnswer}
          setAnswers={setAnswers}
          hasPerson={hasPerson}
          needsName={needsName}
          defaultName={rememberedName ?? ''}
          join={join}
          joinError={joinError}
          saveStatus={saveStatus}
          onRetry={retrySave}
          startOptionId={startOptionId}
          onFinished={onFinished}
          onShared={isOrganiser ? onShared : undefined}
        />
      )}
      {current === 'result' && (
        <ResultPoster
          state={state}
          origin={origin}
          onState={applyState}
          viewerAnswered={myAnswerCount > 0}
          onChangeAnswers={onChangeAnswers}
          onShared={isOrganiser ? onShared : undefined}
          identity={personName && !isOrganiser ? (
            <div id="identity">
              <IdentityLine eventId={eventId} name={personName} editing={renaming} onEditingChange={setRenaming} onState={applyState} />
            </div>
          ) : undefined}
        />
      )}
    </>
  )
}

