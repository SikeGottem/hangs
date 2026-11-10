// Event page orchestrator: wires useEvent into the planning layout (share, header, rows, hero, results) or the locked
// invitation. DOM order matches the mobile visual order; a persistent live region announces what changes.
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LockedInvitation } from '@/components/locked'
import { cx, Disclosure, scrollToId, Skeleton, useClientValue, useOrigin, useToast } from '@/components/ui'
import {
  hasEditedHere, hasShared, hasTappedDone, isIdentityPersisted, markShared, readIdentity, setTappedDone, useEvent,
} from '@/lib/client'
import { plural } from '@/lib/format'
import { nextAction } from '@/lib/next-action'
import { bestDaySentence } from '@/lib/rank'
import { copyText, organiserLink, personalLink } from '@/lib/share'
import { LOCAL_PERSON_ID } from '@/lib/state'
import type { AnswerValue, EventState } from '@/lib/types'
import { AnswerBar } from './AnswerBar'
import { AnswerList } from './AnswerList'
import { BestDayHero } from './BestDayHero'
import { ConnectionBanner } from './ConnectionBanner'
import { EventFooter } from './EventFooter'
import { InviteHeader } from './InviteHeader'
import { Respondents } from './Respondents'
import { ResultsSection } from './ResultsSection'
import { ShareCard, type ShareHow } from './ShareCard'
import { TopBar } from './TopBar'

const NAME_NEEDED = 'Add your name at the bottom of the page to save your answers.'
const SKELETON_GRACE_MS = 1500

export function EventPage({ initialState }: { initialState: EventState }) {
  const eventId = initialState.event.id
  const ev = useEvent(eventId, initialState)
  const {
    state, identity, hydrated, primed, myAnswers, myAnswerCount, needsName, autoJoined, rememberedName, notMe, join, joinError,
    saveStatus, retrySave, applyState, connection, pollFailures, setAnswer: saveOne, setAnswers: saveMany,
  } = ev
  const { toast } = useToast()
  const origin = useOrigin()

  const isOrganiser = state.viewer.isOrganiser
  const lock = state.event.lock
  const hero = state.ranking.hero
  const hasPerson = !!(state.viewer.personId || identity.personToken || identity.organiserKey)

  // Local, per-device UI state.
  // The big "drop it in the group chat" card is for right after creating. Once it was shared, hidden, the plan was
  // locked, the organiser link was opened on this device, or someone else has answered, it stays compact.
  const storedShared = useClientValue(() => hasShared(eventId), false)
  const [sharedNow, setSharedNow] = useState(false)
  const othersAnswered = state.people.some(p => !p.isOrganiser && p.id !== LOCAL_PERSON_ID && p.answeredCount > 0)
  const shared = storedShared || sharedNow || othersAnswered
  useEffect(() => {
    if (lock && isOrganiser) markShared(eventId)
  }, [eventId, isOrganiser, lock])
  const storedDone = useClientValue(() => hasTappedDone(eventId), false)
  const editedHere = useClientValue(() => hasEditedHere(eventId), false)
  const [doneOverride, setDoneOverride] = useState<boolean | null>(null)
  const doneTapped = doneOverride ?? storedDone
  // Answers that came from the server with nothing changed on this device need no Done / confirmation bar.
  const untouchedHere = doneOverride === null && !storedDone && !editedHere
  const [renaming, setRenaming] = useState(false)
  const hadIdentity = useClientValue(() => {
    const id = readIdentity(eventId)
    return !!(id.personToken || id.organiserKey)
  }, false)
  const hadOrganiserKey = useClientValue(() => !!readIdentity(eventId).organiserKey, false)
  const keyAtRisk = useClientValue(() => !isIdentityPersisted(eventId), false)

  // Returning visitors' rows wait for their answers, but never longer than the grace period (taps queue meanwhile).
  const [graceOver, setGraceOver] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setGraceOver(true), SKELETON_GRACE_MS)
    return () => clearTimeout(t)
  }, [])

  // Answer-first ordering on mobile: fixed once and never changed under the thumb. Returning visitors (who already
  // have an identity here) get it decided from their cached self as soon as that is painted, or (no cache yet)
  // results-first as soon as the identity is known, so the layout doesn't jump when the fetch lands.
  const [answerFirstFixed, setAnswerFirstFixed] = useState<boolean | null>(null)
  if (answerFirstFixed === null) {
    if (hydrated || primed) setAnswerFirstFixed(!state.viewer.isOrganiser && myAnswerCount === 0)
    else if (hadIdentity) setAnswerFirstFixed(false)
  }
  const answerFirst = answerFirstFixed ?? true

  // Any answer change re-opens Done (and forgets a Done from an earlier visit).
  const markChanged = useCallback(() => {
    setDoneOverride(false)
    setTappedDone(eventId, false)
  }, [eventId, setDoneOverride])
  const setAnswer = useCallback((optionId: string, value: AnswerValue | null) => {
    markChanged()
    saveOne(optionId, value)
  }, [markChanged, saveOne])
  const setAnswers = useCallback((updates: Record<string, AnswerValue | null>) => {
    markChanged()
    saveMany(updates)
  }, [markChanged, saveMany])

  // "Answering as {name}" after an auto-join under the remembered name.
  const autoToastShown = useRef(false)
  useEffect(() => {
    if (!autoJoined || autoToastShown.current) return
    autoToastShown.current = true
    toast({
      message: `Answering as ${state.viewer.name ?? 'you'}`,
      action: {
        label: 'Not me',
        onClick: () => {
          setDoneOverride(false)
          setRenaming(true)
          scrollToId('answer')
        },
      },
    })
  }, [autoJoined, state.viewer.name, toast])

  // One persistent, visually hidden live region: name needed, first save, and best-day changes (debounced).
  const [live, setLive] = useState('')
  const announce = useCallback((msg: string, delay = 0) => {
    const t = setTimeout(() => setLive(msg), delay)
    return () => clearTimeout(t)
  }, [])
  useEffect(() => (needsName ? announce(NAME_NEEDED) : undefined), [announce, needsName])
  const savedAnnounced = useRef(false)
  useEffect(() => {
    if (saveStatus !== 'saved' || savedAnnounced.current) return
    savedAnnounced.current = true
    return announce('Your answers are saved.')
  }, [announce, saveStatus])
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
    return announce(heroSentence.current, 1500)
  }, [announce, heroKey, hydrated])

  // Locking or unlocking swaps the whole layout; if that dropped focus (the sheet or control that did it is gone),
  // move it to the new page heading.
  const wasLocked = useRef(!!lock)
  useEffect(() => {
    const now = !!lock
    if (now === wasLocked.current) return
    wasLocked.current = now
    const active = document.activeElement
    if (active && active !== document.body) return
    document.getElementById(now ? 'locked-title' : 'invite-title')?.focus()
  }, [lock])

  // The viewer's own ids, excluded from "others" counts and marked "(you)".
  const viewerIds = useMemo(() => {
    const s = new Set<string>([LOCAL_PERSON_ID])
    if (state.viewer.personId) s.add(state.viewer.personId)
    return s
  }, [state.viewer.personId])

  const myLockedAnswer = lock ? myAnswers[lock.optionId] ?? null : null
  const next = nextAction({ state, needsName, shared, doneTapped, myAnswerCount, myLockedAnswer })

  // After a share, a copy of the invite or Hide. One toast only: the first collapse folds "Copied" into the
  // organiser-link reminder instead of stacking two.
  const reminded = useRef(false)
  const onShared = useCallback((how: ShareHow) => {
    setSharedNow(true)
    const first = !reminded.current && !hasShared(eventId)
    reminded.current = true
    markShared(eventId)
    const key = identity.organiserKey
    const copied = how === 'copied'
    if (!first || !key) {
      if (copied) toast({ message: 'Copied. Paste it in the chat.' })
      return
    }
    toast({
      message: copied
        ? 'Copied. Also save your organiser link to manage this from another phone.'
        : 'Save your organiser link to manage this from another phone.',
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
  }, [eventId, identity.organiserKey, toast])

  const future = state.options.filter(o => !o.isPast)
  const blanks = future.filter(o => !myAnswers[o.id])
  const unit = (n: number) => (state.event.mode === 'parts' ? plural(n, 'slot', 'slots') : plural(n, 'day', 'days'))

  const onDone = () => {
    setDoneOverride(true)
    setTappedDone(eventId, true)
    requestAnimationFrame(() => scrollToId('results'))
  }
  const onFillBlanksCant = () => {
    saveMany(Object.fromEntries(blanks.map(o => [o.id, 'cant' as const])))
  }
  const onEdit = () => {
    setDoneOverride(false)
    setTappedDone(eventId, false)
    scrollToId('answer')
  }

  const loadingRows = hadIdentity && !hydrated && !primed && !graceOver
  const editLink = origin && identity.personToken && !isOrganiser ? personalLink(origin, eventId, identity.personToken) : null
  const personName = state.viewer.personId ? state.viewer.name : null

  const liveRegion = <div role="status" aria-live="polite" className="sr-only">{live}</div>

  const answerBar = (
    <AnswerBar
      organiserName={state.event.organiserName}
      isOrganiser={isOrganiser}
      locked={!!lock}
      hasPerson={hasPerson}
      myAnswerCount={myAnswerCount}
      answerableCount={future.length}
      blankCount={blanks.length}
      unit={unit}
      needsName={needsName}
      defaultName={rememberedName ?? ''}
      join={join}
      joinError={joinError}
      saveStatus={saveStatus}
      onRetry={retrySave}
      doneTapped={doneTapped}
      quiet={untouchedHere}
      doneAccent={next === 'done'}
      onDone={onDone}
      onFillBlanksCant={onFillBlanksCant}
      onEdit={onEdit}
      editLink={editLink}
      className="-mx-(--gutter) lg:col-span-7 lg:col-start-1 lg:row-start-2 lg:mx-0"
    />
  )

  if (lock) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-(--col-max) flex-col px-(--gutter)">
        {liveRegion}
        <TopBar state={state} origin={origin} onState={applyState} />
        <main className="flex flex-1 flex-col gap-6 pt-2 pb-6">
          <ConnectionBanner connection={connection} pollFailures={pollFailures} />
          <LockedInvitation
            state={state}
            onState={applyState}
            viewerAnswer={myLockedAnswer}
            onAnswer={v => setAnswer(lock.optionId, v)}
            saveStatus={saveStatus}
            accent={next === 'calendar'}
          />
          <Disclosure summary="See all days" className="border-t border-line pt-2">
            <ResultsSection state={state} viewerIds={viewerIds} showHeading={false} />
          </Disclosure>
          <Respondents state={state} viewerIds={viewerIds} origin={origin} />
          {answerBar}
        </main>
        <EventFooter />
      </div>
    )
  }

  const heroEmphasis = next === 'lock' || next === 'add_days' ? 'accent' : 'secondary'
  // The organiser's own "no answers yet" hero would only repeat the share card; the results empty state covers it.
  const showHero = !(isOrganiser && hero.kind === 'empty')
  // Rendered in both columns (only one is ever displayed) so the DOM order matches the visual order on mobile.
  const heroFor = (where: 'mobile' | 'desktop') => showHero && (
    <div className={where === 'mobile' ? 'lg:hidden' : 'hidden lg:block'}>
      <BestDayHero state={state} onState={applyState} emphasis={heroEmphasis} />
    </div>
  )

  const answerList = (
    <AnswerList
      state={state}
      myAnswers={myAnswers}
      myAnswerCount={myAnswerCount}
      viewerIds={viewerIds}
      setAnswer={setAnswer}
      setAnswers={setAnswers}
      loading={loadingRows}
      personName={personName}
      rememberedName={rememberedName}
      onNotMe={notMe}
      renaming={renaming}
      onRenamingChange={setRenaming}
      onState={applyState}
      className="scroll-mt-4"
    />
  )

  // Organisers coming back see their share card's space reserved until their identity is confirmed.
  const shareSlot = isOrganiser ? (
    <ShareCard
      state={state}
      origin={origin}
      organiserKey={identity.organiserKey}
      shared={shared}
      accent={next === 'share'}
      keyAtRisk={keyAtRisk}
      onShared={onShared}
    />
  ) : hadOrganiserKey && !hydrated ? (
    <Skeleton className={cx('w-full rounded-xl', storedShared ? 'h-13' : 'h-80')} />
  ) : null

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-(--col-max) flex-col px-(--gutter) lg:max-w-(--page-max)">
      {liveRegion}
      <TopBar state={state} origin={origin} onState={applyState} onShared={isOrganiser ? onShared : undefined} />
      <main className="flex flex-1 flex-col gap-6 pt-2 pb-6 lg:grid lg:grid-cols-12 lg:items-start lg:gap-x-10 lg:gap-y-6">
        {/* Left column on desktop; on mobile its children join the single column (display: contents) in DOM order. */}
        <div className="contents lg:col-span-7 lg:col-start-1 lg:row-start-1 lg:flex lg:flex-col lg:gap-6">
          <ConnectionBanner connection={connection} pollFailures={pollFailures} />
          {shareSlot}
          <InviteHeader state={state} />
          {answerFirst ? <>{answerList}{heroFor('mobile')}</> : <>{heroFor('mobile')}{answerList}</>}
        </div>

        {/* Right column on desktop: hero, results and respondents. It flows with the page (no capped inner scroller),
            so long result lists, who has answered and the nudge are all reachable by page scroll and keyboard. */}
        <div className="contents lg:col-span-5 lg:col-start-8 lg:row-start-1 lg:flex lg:flex-col lg:gap-6">
          {heroFor('desktop')}
          <ResultsSection state={state} viewerIds={viewerIds} className="scroll-mt-4" />
          <Respondents state={state} viewerIds={viewerIds} origin={origin} />
        </div>

        {answerBar}
      </main>
      <EventFooter />
    </div>
  )
}
