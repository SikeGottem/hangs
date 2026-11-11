// useEvent: the event page's state machine: optimistic answers over server state, single-flight (auto-)join with
// retry, debounced save queue, hash-link identity validation, and single-flight polling (always If-None-Match,
// paused while hidden, slower while nothing changes, exponential backoff on failures) with a version gate. A returning
// visitor's cached self is painted over the anonymous server render until the identified fetch reconciles.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useToast } from '@/components/ui/Toast'
import { deriveState, LOCAL_PERSON_ID } from '../state'
import type { AnswerUpdate, AnswerValue, ApiError, ApiResult, EventState, Identity, JoinResponse, SaveStatus } from '../types'
import { fetchEvent, isRetryable, joinEvent, saveAnswers } from './api'
import { classifyPollError, pollDelay } from './poll'
import { primeState } from './prime'
import {
  clearPerson, consumeHashIdentity, getRememberedName, markShared, parseViewerCache, readIdentity, readPending,
  readViewerCacheRaw, rememberEvent, seededEventState, settleHashIdentity, writeIdentity, writePending, writeViewerCache,
} from './storage'

type PendingMap = Record<string, AnswerValue | null>

// Re-derives state with the viewer's pending answers applied (temporary 'local' person when no person exists yet).
export function overlayState(server: EventState, pending: PendingMap, localName: string): EventState {
  const entries = Object.entries(pending)
  if (entries.length === 0) return server
  const people = server.people.map(p => ({ id: p.id, name: p.name, isOrganiser: p.isOrganiser, answers: { ...p.answers } }))
  let personId = server.viewer.personId
  let target = personId ? people.find(p => p.id === personId) : undefined
  if (!target) {
    target = { id: LOCAL_PERSON_ID, name: localName || 'You', isOrganiser: false, answers: {} }
    people.push(target)
    personId = LOCAL_PERSON_ID
  }
  for (const [id, v] of entries) {
    if (v === null) delete target.answers[id]
    else target.answers[id] = v
  }
  return deriveState(
    { event: server.event, options: server.options.map(o => ({ id: o.id, kind: o.kind, date: o.date, part: o.part })), people },
    {
      personId,
      isOrganiser: server.viewer.isOrganiser,
      personTokenRejected: server.viewer.personTokenRejected,
      organiserKeyRejected: server.viewer.organiserKeyRejected,
    },
    server.today,
  )
}

export interface UseEvent {
  state: EventState                 // server state + optimistic overlay (only once the viewer is a saved person)
  identity: Identity
  hydrated: boolean                 // first client fetch (with headers) settled, or state seeded from create
  primed: boolean                   // state shows the viewer's cached self while the identified fetch is pending
  myAnswers: Record<string, AnswerValue>
  myAnswerCount: number
  setAnswer(optionId: string, value: AnswerValue | null): void
  setAnswers(updates: Record<string, AnswerValue | null>): void
  needsName: boolean                // pending answers held locally, no person, no auto-join possible
  autoJoined: boolean               // true once after an auto-join under the remembered name (drives the "Answering as" toast)
  rememberedName: string | null     // the name a first tap will auto-join as (null once "Not you?" or a person exists)
  notMe(): void                     // opt out of auto-joining under the remembered name on this page
  join(name: string): Promise<ApiResult<JoinResponse>>
  joinError: ApiError | null
  saveStatus: SaveStatus
  retrySave(): void
  refresh(): Promise<void>
  applyState(next: EventState): void // for organiser/lock actions (C); ignored if next.event.version < current; keeps pending overlay
  connection: 'online' | 'offline'
  pollFailures: number
}

const EMPTY_IDENTITY: Identity = { personToken: null, personId: null, organiserKey: null }
const REMOVED_MESSAGE = 'Your answers were removed by the organiser. You can answer again.'
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000]
const SAVE_DEBOUNCE_MS = 400
const BOOT_TIMEOUT_MS = 8000
const POLL_TIMEOUT_MS = 10_000

type Phase = 'idle' | 'saved' | 'error'

const noSubscribe = () => () => {}

// A ref that always holds the latest value, for effects and timers that must not re-subscribe on every render.
function useLatest<T>(value: T) {
  const ref = useRef(value)
  useEffect(() => { ref.current = value })
  return ref
}

export function useEvent(eventId: string, initialState: EventState): UseEvent {
  const { toast } = useToast()

  // After "Make the link" (client navigation) the create response seeds the organiser view; null on a full load.
  const [seed] = useState(() => seededEventState(eventId, initialState))
  const [server, setServer] = useState<EventState>(seed ?? initialState)
  const serverRef = useRef<EventState>(seed ?? initialState)
  const [pending, setPendingState] = useState<PendingMap>({})
  const pendingRef = useRef<PendingMap>({})
  const [identity, setIdentityState] = useState<Identity>(() => (seed ? readIdentity(eventId) : EMPTY_IDENTITY))
  const identityRef = useRef<Identity>(identity)
  const identityGen = useRef(0)
  const [hydrated, setHydrated] = useState(() => !!seed)
  // True once a response with this page's identity headers has been accepted (or nothing needed one): from then on
  // the server's view of the viewer is the truth and the cached self is no longer painted.
  const [reconciled, setReconciled] = useState(() => !!seed)
  const [needsName, setNeedsNameState] = useState(false)
  const needsNameRef = useRef(false)
  const [autoJoined, setAutoJoined] = useState(false)
  const [joinError, setJoinError] = useState<ApiError | null>(null)
  const [joining, setJoining] = useState(false)
  const [inflight, setInflight] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [online, setOnline] = useState(true)
  const [pollFailures, setPollFailures] = useState(0)
  const [localName, setLocalName] = useState('')
  const [optedOut, setOptedOut] = useState(false)
  const optedOutRef = useRef(false)

  const mutationSeq = useRef(0)
  const joinPromise = useRef<Promise<ApiResult<JoinResponse>> | null>(null)
  const inflightRef = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const joinTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryCount = useRef(0)
  const joinRetries = useRef(0)
  const failuresRef = useRef(0)
  const unchangedRef = useRef(0)          // consecutive 304 polls (slows polling while nothing changes)
  const goneRef = useRef(false)           // the event 404'd: stop the timer
  const retryUntil = useRef(0)            // honour a server Retry-After
  const pollInFlight = useRef<Promise<void> | null>(null)
  const lastFetchAt = useRef(0)
  const validated = useRef(!!seed)
  const removedToastShown = useRef(false)

  const hasPending = useCallback(() => Object.keys(pendingRef.current).length > 0, [])

  const updatePending = useCallback((fn: (p: PendingMap) => PendingMap) => {
    const next = fn(pendingRef.current)
    pendingRef.current = next
    setPendingState(next)
    writePending(eventId, next)
  }, [eventId])

  const setIdentity = useCallback((next: Identity) => {
    identityGen.current++
    identityRef.current = next
    setIdentityState(next)
  }, [])

  const updateIdentity = useCallback((patch: Partial<Identity>) => {
    setIdentity({ ...identityRef.current, ...patch })
  }, [setIdentity])

  const setNeedsName = useCallback((v: boolean) => {
    needsNameRef.current = v
    setNeedsNameState(v)
  }, [])

  const hasPerson = useCallback(() => !!(identityRef.current.personToken || identityRef.current.organiserKey), [])

  const showRemoved = useCallback(() => {
    if (removedToastShown.current) return
    removedToastShown.current = true
    toast({ message: REMOVED_MESSAGE })
  }, [toast])

  // Version gate + identity rejection handling for every incoming state.
  const acceptState = useCallback((next: EventState): boolean => {
    if (next.event.version < serverRef.current.event.version) return false
    serverRef.current = next
    setServer(next)
    const v = next.viewer
    if (v.personTokenRejected && identityRef.current.personToken) {
      clearPerson(eventId)
      updateIdentity({ personToken: null, personId: v.personId })
      if (!v.isOrganiser) showRemoved()
    } else if (v.personId && v.personId !== identityRef.current.personId) {
      updateIdentity({ personId: v.personId })
      if (identityRef.current.personToken) writeIdentity(eventId, { personId: v.personId })
    }
    if (v.organiserKeyRejected && identityRef.current.organiserKey) {
      writeIdentity(eventId, { organiserKey: null })
      updateIdentity({ organiserKey: null })
    }
    return true
  }, [eventId, showRemoved, updateIdentity])

  const flashSaved = useCallback(() => {
    setPhase('saved')
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setPhase(p => (p === 'saved' ? 'idle' : p)), 2000)
  }, [])

  const flushRef = useRef<() => void>(() => {})
  const scheduleSave = useCallback((delay = SAVE_DEBOUNCE_MS) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => flushRef.current(), delay)
  }, [])

  const flush = useCallback(async () => {
    if (inflightRef.current || !hasPerson()) return
    const snapshot = { ...pendingRef.current }
    const keys = Object.keys(snapshot)
    if (keys.length === 0) return
    inflightRef.current = true
    setInflight(true)
    setPhase(p => (p === 'error' ? 'idle' : p))
    const r = await saveAnswers(eventId, keys.map(optionId => ({ optionId, value: snapshot[optionId] })))
    inflightRef.current = false
    setInflight(false)
    if (r.ok) {
      retryCount.current = 0
      mutationSeq.current++
      acceptState(r.data.state)
      updatePending(p => {
        const next = { ...p }
        for (const k of keys) if (next[k] === snapshot[k]) delete next[k]
        return next
      })
      if (hasPending()) scheduleSave()
      else flashSaved()
      return
    }
    if (r.error.status === 401) {
      clearPerson(eventId)
      updateIdentity({ personToken: null, personId: null })
      setNeedsName(true)
      setPhase('idle')
      showRemoved()
      return
    }
    if (isRetryable(r.error) && retryCount.current < RETRY_DELAYS.length) {
      const delay = RETRY_DELAYS[retryCount.current]
      retryCount.current++
      scheduleSave(delay)
      return
    }
    setPhase('error')
  }, [acceptState, eventId, flashSaved, hasPending, hasPerson, scheduleSave, setNeedsName, showRemoved, updateIdentity, updatePending])

  useEffect(() => {
    flushRef.current = () => { void flush() }
  }, [flush])

  const pollRef = useRef<() => Promise<void>>(async () => {})

  const join = useCallback((name: string): Promise<ApiResult<JoinResponse>> => {
    if (joinPromise.current) return joinPromise.current
    const snapshot = { ...pendingRef.current }
    const answers: AnswerUpdate[] = Object.entries(snapshot)
      .filter(([, v]) => v !== null)
      .map(([optionId, value]) => ({ optionId, value }))
    setJoining(true)
    const p = (async () => {
      const r = await joinEvent(eventId, name, answers, serverRef.current.event.title)
      if (r.ok) {
        joinRetries.current = 0
        updateIdentity({ personToken: r.data.personToken, personId: r.data.personId })
        mutationSeq.current++
        if (r.data.state) acceptState(r.data.state)
        else void pollRef.current() // committed but the server couldn't read it back: fetch it now
        updatePending(cur => {
          const next = { ...cur }
          for (const k of Object.keys(snapshot)) if (next[k] === snapshot[k]) delete next[k]
          return next
        })
        setLocalName(getRememberedName())
        setNeedsName(false)
        setJoinError(null)
        setPhase(ph => (ph === 'error' ? 'idle' : ph))
        if (hasPending()) scheduleSave()
        else flashSaved()
      } else {
        setJoinError(r.error)
        // A network or server blip is retried; only a real problem (name taken, full, invalid) asks for a name.
        if (!isRetryable(r.error)) setNeedsName(true)
      }
      return r
    })().finally(() => {
      joinPromise.current = null
      setJoining(false)
    })
    joinPromise.current = p
    return p
  }, [acceptState, eventId, flashSaved, hasPending, scheduleSave, setNeedsName, updateIdentity, updatePending])

  // Joins under the remembered name (or asks for one), retrying network/server failures with backoff.
  const autoJoinRef = useRef<() => void>(() => {})
  const autoJoin = useCallback(() => {
    const name = optedOutRef.current ? '' : getRememberedName()
    if (!name) {
      setNeedsName(true)
      return
    }
    void join(name).then(r => {
      if (r.ok) {
        setAutoJoined(true)
        return
      }
      if (!isRetryable(r.error)) return
      if (joinRetries.current < RETRY_DELAYS.length) {
        const delay = RETRY_DELAYS[joinRetries.current++]
        if (joinTimer.current) clearTimeout(joinTimer.current)
        joinTimer.current = setTimeout(() => {
          joinTimer.current = null
          if (!hasPerson() && hasPending() && !needsNameRef.current) autoJoinRef.current()
        }, delay)
      } else {
        setPhase('error')
      }
    })
  }, [hasPending, hasPerson, join, setNeedsName])

  useEffect(() => {
    autoJoinRef.current = autoJoin
  }, [autoJoin])

  // After any local change: save if a person exists, otherwise auto-join under the remembered name or ask for one.
  const afterChange = useCallback(() => {
    if (hasPerson()) {
      scheduleSave()
      return
    }
    if (joinPromise.current || joinTimer.current) return
    if (needsNameRef.current) {
      setNeedsName(true)
      return
    }
    autoJoin()
  }, [autoJoin, hasPerson, scheduleSave, setNeedsName])

  const setAnswers = useCallback((updates: Record<string, AnswerValue | null>) => {
    if (Object.keys(updates).length === 0) return
    try {
      navigator.vibrate?.(8)
    } catch {
      // unsupported
    }
    updatePending(p => ({ ...p, ...updates }))
    afterChange()
  }, [afterChange, updatePending])

  const setAnswer = useCallback((optionId: string, value: AnswerValue | null) => {
    setAnswers({ [optionId]: value })
  }, [setAnswers])

  // Fetches with the stored identity plus any hash-link candidates, then adopts or discards the candidates.
  // Returns false (candidates kept for a retry) when no response came back.
  const validate = useCallback(async (isCancelled: () => boolean): Promise<boolean> => {
    const cand = consumeHashIdentity(eventId)
    const base = identityRef.current
    const gen = identityGen.current
    let p = base.personToken
    let k = base.organiserKey
    let pFromHash = false
    let kFromHash = false
    if (!p && cand.p) { p = cand.p; pFromHash = true }
    if (!k && cand.k) { k = cand.k; kFromHash = true }

    lastFetchAt.current = Date.now()
    let r = await fetchEvent(eventId, { auth: { personToken: p, organiserKey: k }, timeoutMs: BOOT_TIMEOUT_MS })
    let storedPRejected = false
    let storedKRejected = false
    if (r.ok && r.data !== 'not_modified') {
      const v = r.data.viewer
      let again = false
      if (!pFromHash && p && v.personTokenRejected) {
        storedPRejected = true
        if (cand.p && cand.p !== p) { p = cand.p; pFromHash = true; again = true }
      }
      if (!kFromHash && k && v.organiserKeyRejected) {
        storedKRejected = true
        if (cand.k && cand.k !== k) { k = cand.k; kFromHash = true; again = true }
      }
      if (again) {
        const r2 = await fetchEvent(eventId, { auth: { personToken: p, organiserKey: k }, timeoutMs: BOOT_TIMEOUT_MS })
        if (r2.ok && r2.data !== 'not_modified') r = r2
      }
    }
    if (isCancelled() || !r.ok || r.data === 'not_modified') return false

    const s = r.data
    const v = s.viewer
    settleHashIdentity(eventId)
    if (storedKRejected) writeIdentity(eventId, { organiserKey: null })
    if (k && v.isOrganiser && !v.organiserKeyRejected) {
      if (kFromHash) {
        writeIdentity(eventId, { organiserKey: k })
        rememberEvent({ id: eventId, title: s.event.title, role: 'organiser', at: Date.now() })
        // Opening the organiser link means coming back to manage a plan that's already out: no first-share card.
        markShared(eventId)
      }
    } else {
      k = null
    }
    if (storedPRejected) clearPerson(eventId)
    if (p && !v.personTokenRejected) {
      writeIdentity(eventId, { personToken: p, personId: v.personId })
      if (pFromHash) rememberEvent({ id: eventId, title: s.event.title, role: 'guest', at: Date.now() })
    } else {
      p = null
    }
    if (storedPRejected && !p && !v.isOrganiser) showRemoved()
    if (cand.p && !pFromHash && base.personToken && cand.p !== base.personToken && p) {
      toast({ message: `You're already answering here as ${v.name ?? 'someone else'}.` })
    }
    // A personal link (#p=) adopted on a device with no identity of its own: it may be someone else's link that was
    // forwarded, so say whose answers these are and offer to let go of them before anything is changed.
    if (pFromHash && p && !base.personToken && v.name && !v.isOrganiser) {
      toast({
        message: `You're answering as ${v.name}. Not you?`,
        action: {
          label: 'Not me',
          onClick: () => {
            clearPerson(eventId)
            setIdentity({ personToken: null, personId: null, organiserKey: identityRef.current.organiserKey })
            void fetchEvent(eventId, { timeoutMs: BOOT_TIMEOUT_MS }).then(r => {
              if (r.ok && r.data !== 'not_modified' && r.data.event.version >= serverRef.current.event.version) {
                serverRef.current = r.data
                setServer(r.data)
              }
            })
          },
        },
      })
    }
    // A join (or a removal) that finished while this request was in flight wins over what it validated.
    const cur = identityRef.current
    setIdentity(identityGen.current !== gen
      ? { ...cur, organiserKey: cur.organiserKey ?? k }
      : { personToken: p, personId: v.personId, organiserKey: k })
    if (s.event.version >= serverRef.current.event.version) {
      serverRef.current = s
      setServer(s)
    }
    return true
  }, [eventId, setIdentity, showRemoved, toast])

  // Resume held answers: save them, or join again under the remembered name.
  const resume = useCallback(() => {
    if (!hasPending()) return
    if (hasPerson()) {
      retryCount.current = 0
      setPhase(p => (p === 'error' ? 'idle' : p))
      flushRef.current()
    } else if (!needsNameRef.current && !joinPromise.current) {
      joinRetries.current = 0
      if (joinTimer.current) { clearTimeout(joinTimer.current); joinTimer.current = null }
      setPhase(p => (p === 'error' ? 'idle' : p))
      autoJoin()
    }
  }, [autoJoin, hasPending, hasPerson])

  const pollOnce = useCallback(async () => {
    if (!validated.current) {
      // The first fetch never got an answer (offline, stalled webview): validate identity and hash links now.
      const ok = await validate(() => false)
      failuresRef.current = ok ? 0 : failuresRef.current + 1
      setPollFailures(failuresRef.current)
      if (ok) {
        validated.current = true
        setReconciled(true)
        resume()
      }
      return
    }
    const seq = mutationSeq.current
    lastFetchAt.current = Date.now()
    // Always conditional: an unchanged event is a 304 with no body (one cheap database read on the server).
    const r = await fetchEvent(eventId, { ifNoneMatch: serverRef.current.etag, timeoutMs: POLL_TIMEOUT_MS })
    if (!r.ok) {
      const kind = classifyPollError(r.error)
      if (kind === 'gone') goneRef.current = true
      if (kind !== 'failure') return
      if (r.error.retryAfter) retryUntil.current = Date.now() + r.error.retryAfter * 1000
      failuresRef.current++
      setPollFailures(failuresRef.current)
      return
    }
    goneRef.current = false
    failuresRef.current = 0
    setPollFailures(0)
    if (r.data === 'not_modified') {
      unchangedRef.current++
      return
    }
    unchangedRef.current = 0
    if (seq !== mutationSeq.current) return
    acceptState(r.data)
  }, [acceptState, eventId, resume, validate])

  // Single flight: a timer tick, focus, visibility and online never run two polls at once.
  const poll = useCallback((): Promise<void> => {
    if (pollInFlight.current) return pollInFlight.current
    const p = pollOnce().finally(() => { pollInFlight.current = null })
    pollInFlight.current = p
    return p
  }, [pollOnce])

  useEffect(() => {
    pollRef.current = poll
  }, [poll])

  const refresh = useCallback(async () => { await poll() }, [poll])

  const retrySave = useCallback(() => {
    retryCount.current = 0
    joinRetries.current = 0
    setPhase('idle')
    if (!hasPerson() && hasPending()) {
      if (joinTimer.current) { clearTimeout(joinTimer.current); joinTimer.current = null }
      afterChange()
      return
    }
    void flush()
  }, [afterChange, flush, hasPending, hasPerson])

  const applyState = useCallback((next: EventState) => {
    mutationSeq.current++
    acceptState(next)
  }, [acceptState])

  const notMe = useCallback(() => {
    optedOutRef.current = true
    setOptedOut(true)
  }, [])

  // Mount: hash identity -> stored identity -> first fetch with headers -> adopt or discard candidates.
  const validateRef = useLatest(validate)
  const resumeRef = useLatest(resume)
  useEffect(() => {
    let cancelled = false
    const bootstrap = async () => {
      const cand = consumeHashIdentity(eventId)
      const restored = readPending(eventId)
      pendingRef.current = restored
      setPendingState(restored)
      const stored = readIdentity(eventId)
      setIdentity(stored)
      setLocalName(getRememberedName())
      setOnline(typeof navigator === 'undefined' ? true : navigator.onLine !== false)
      // A fresh visitor (no stored identity, no hash link, nothing held) sees exactly the anonymous state the server
      // just rendered, so there is nothing to validate: skip the first fetch and let the conditional poll take over.
      if (!stored.personToken && !stored.organiserKey && !cand.p && !cand.k && Object.keys(restored).length === 0) {
        lastFetchAt.current = Date.now()
        validated.current = true
        setHydrated(true)
        setReconciled(true)
        return
      }
      const ok = await validateRef.current(() => cancelled)
      if (cancelled) return
      validated.current = ok
      setHydrated(true)
      if (ok) setReconciled(true)
      resumeRef.current()
    }
    void bootstrap()
    return () => { cancelled = true }
  }, [eventId, resumeRef, setIdentity, validateRef])

  // Polling (see lib/client/poll.ts for the pace). No timer at all while the tab is hidden; becoming visible, focus
  // or coming back online refetches at once (unless a fetch just ran or a Retry-After is pending) and restarts the
  // timer from there, so a refocus never double-fires. Focus and online also resume a failed save or join.
  const latestPoll = useLatest(poll)
  useEffect(() => {
    if (!hydrated) return
    let timer: ReturnType<typeof setTimeout> | null = null
    let stopped = false
    const visible = () => document.visibilityState === 'visible'
    const clear = () => {
      if (timer) clearTimeout(timer)
      timer = null
    }
    const schedule = () => {
      clear()
      if (stopped || goneRef.current || !visible()) return
      const focused = typeof document.hasFocus === 'function' && document.hasFocus()
      const delay = pollDelay({
        failures: failuresRef.current,
        unchanged: unchangedRef.current,
        focused,
        retryAfterMs: Math.max(0, retryUntil.current - Date.now()),
      })
      timer = setTimeout(run, delay)
    }
    const run = async () => {
      timer = null
      if (stopped || !visible()) return
      await latestPoll.current()
      schedule()
    }
    const wake = () => {
      if (!visible()) {
        clear()
        return
      }
      unchangedRef.current = 0
      const now = Date.now()
      if (now - lastFetchAt.current < 2000 || now < retryUntil.current) {
        schedule()
        return
      }
      clear()
      void run()
    }
    const onVisibility = () => wake()
    const onFocus = () => {
      wake()
      resumeRef.current()
    }
    const onOnline = () => {
      setOnline(true)
      wake()
      resumeRef.current()
    }
    const onOffline = () => setOnline(false)
    schedule()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      stopped = true
      clear()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [hydrated, latestPoll, resumeRef])

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    if (joinTimer.current) clearTimeout(joinTimer.current)
  }, [])

  // Remember who the server says the viewer is (public id, name, role, own answers) for the next reload's first paint.
  useEffect(() => {
    if (server.viewer.personId && (identity.personToken || identity.organiserKey)) writeViewerCache(eventId, server)
  }, [eventId, identity.organiserKey, identity.personToken, server])

  // Until the identified fetch reconciles, paint the cached self over the anonymous server render. The snapshot is
  // null during SSR and hydration (no mismatch) and the stored string afterwards, so the first post-hydration render
  // already shows the viewer's answers and identity line, in the same render that learns an identity is held here.
  const cachedRaw = useSyncExternalStore(noSubscribe, () => (reconciled ? null : readViewerCacheRaw(eventId)), () => null)
  const primedServer = useMemo(
    () => (reconciled ? null : primeState(server, parseViewerCache(cachedRaw))),
    [cachedRaw, reconciled, server],
  )
  const base = primedServer ?? server

  // The viewer's own answers always include what they just tapped. The shared views (hero, ranking, tallies, who has
  // answered) take the optimistic overlay only once the viewer is a saved person; answers held before a name is
  // saved (the 'local' person) stay on the viewer's own rows, so the page never shows a consensus the server lacks.
  const overlaid = useMemo(() => overlayState(base, pending, localName), [base, pending, localName])
  const state = base.viewer.personId ? overlaid : base

  const me = overlaid.people.find(p => p.id === (overlaid.viewer.personId ?? LOCAL_PERSON_ID))
  const myAnswers = useMemo(() => me?.answers ?? {}, [me])
  const myAnswerCount = me?.answeredCount ?? 0

  const pendingCount = Object.keys(pending).length
  const primed = !!primedServer
  const personExists = !!(identity.personToken || identity.organiserKey) || primed
  let saveStatus: SaveStatus
  if (joining) saveStatus = 'saving'
  else if (pendingCount > 0 && !personExists) {
    if (!online) saveStatus = 'offline'
    else if (phase === 'error') saveStatus = 'error'
    else saveStatus = needsName ? 'unsaved' : 'saving'
  } else if (phase === 'error') saveStatus = 'error'
  else if (pendingCount > 0 && !online) saveStatus = 'offline'
  else if (pendingCount > 0 || inflight) saveStatus = 'saving'
  else if (phase === 'saved') saveStatus = 'saved'
  else saveStatus = 'idle'

  return {
    state,
    identity,
    hydrated,
    primed,
    myAnswers,
    myAnswerCount,
    setAnswer,
    setAnswers,
    needsName,
    autoJoined,
    rememberedName: !personExists && !optedOut && localName ? localName : null,
    notMe,
    join,
    joinError,
    saveStatus,
    retrySave,
    refresh,
    applyState,
    connection: online ? 'online' : 'offline',
    pollFailures,
  }
}
