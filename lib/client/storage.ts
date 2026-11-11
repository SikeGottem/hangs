// Browser storage for Hangs: identity (in-memory first, localStorage second), hash-link candidates, remembered name,
// "my events", share/done flags, pending answers, the viewer's last-known answers and the create-to-event state
// handoff. Works with storage blocked.
import type { AnswerValue, EventState, Identity, MyEvent } from '../types'
import { isInAppBrowser } from '../ua'

export { isInAppBrowser }

const K = {
  name: 'hangs:name',
  person: (id: string) => `hangs:p:${id}`,
  key: (id: string) => `hangs:k:${id}`,
  pending: (id: string) => `hangs:pending:${id}`,
  mine: 'hangs:mine',
  shared: (id: string) => `hangs:shared:${id}`,
  done: (id: string) => `hangs:done:${id}`,
  viewer: (id: string) => `hangs:me:${id}`,
}

function sget(key: string): string | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(key)
  } catch {
    return null
  }
}
function sset(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value)
  } catch {
    // storage full or blocked: the in-memory copies below still work for this page's lifetime
  }
}
function sdel(key: string): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(key)
  } catch {
    // ignore
  }
}
function sjson<T>(key: string): T | null {
  const raw = sget(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

const SECRET_RE = /^[A-Za-z0-9_-]{20,100}$/
const validSecret = (s: string | null | undefined): string | null => (s && SECRET_RE.test(s) ? s : null)

// ---------- identity ----------

// The single source for auth headers: written before localStorage, so identity survives a blocked or failing
// localStorage (Safari private mode, in-app webviews) for the life of the page, including client-side navigation.
const memIdentity = new Map<string, Identity>()

function readStoredIdentity(eventId: string): Identity {
  const p = sjson<{ token?: unknown; personId?: unknown }>(K.person(eventId))
  const token = typeof p?.token === 'string' ? validSecret(p.token) : null
  const personId = token && typeof p?.personId === 'string' ? p.personId : null
  return { personToken: token, personId, organiserKey: validSecret(sget(K.key(eventId))) }
}

export function readIdentity(eventId: string): Identity {
  return memIdentity.get(eventId) ?? readStoredIdentity(eventId)
}

export function writeIdentity(eventId: string, patch: Partial<Identity>): void {
  const cur = readIdentity(eventId)
  const personToken = 'personToken' in patch ? patch.personToken ?? null : cur.personToken
  const next: Identity = {
    personToken,
    personId: personToken ? ('personId' in patch ? patch.personId ?? null : cur.personId) : null,
    organiserKey: 'organiserKey' in patch ? patch.organiserKey ?? null : cur.organiserKey,
  }
  memIdentity.set(eventId, next)
  // The cached view of "me" belongs to the identity that produced it: any change of person or key drops it.
  if (next.personToken !== cur.personToken || next.organiserKey !== cur.organiserKey) sdel(K.viewer(eventId))
  if ('personToken' in patch || 'personId' in patch) {
    if (next.personToken) sset(K.person(eventId), JSON.stringify({ token: next.personToken, personId: next.personId }))
    else sdel(K.person(eventId))
  }
  if ('organiserKey' in patch) {
    if (next.organiserKey) sset(K.key(eventId), next.organiserKey)
    else sdel(K.key(eventId))
  }
}

export function clearPerson(eventId: string): void {
  writeIdentity(eventId, { personToken: null, personId: null })
}

// False when this page holds secrets that localStorage did not keep (they are lost on reload).
export function isIdentityPersisted(eventId: string): boolean {
  const mem = memIdentity.get(eventId)
  if (!mem) return true
  const stored = readStoredIdentity(eventId)
  return stored.personToken === mem.personToken && stored.organiserKey === mem.organiserKey
}

// ---------- hash identity (#k= organiser link, #p= personal edit link) ----------

const hashCandidates = new Map<string, { k: string | null; p: string | null }>()

type HashWindow = Window & { __hangsHash?: { path: string; hash: string } }

// The hash the inline script in app/layout.tsx captured (and already removed from the address bar) for this event,
// else the live hash (client-side navigation, or the script did not run). Each capture is read once.
function takeHash(eventId: string): string {
  const w = window as HashWindow
  const stashed = w.__hangsHash
  if (stashed && stashed.path.replace(/\/+$/, '') === `/h/${eventId}`) {
    w.__hangsHash = undefined
    return stashed.hash
  }
  return window.location.hash
}

// Strips #k= / #p= from the URL at once and keeps them as candidates for this page's lifetime (nothing stored yet),
// so a failed first fetch, a retry or a strict-mode remount can still validate them. Idempotent.
export function consumeHashIdentity(eventId: string): { k: string | null; p: string | null } {
  if (typeof window === 'undefined') return { k: null, p: null }
  const hash = takeHash(eventId)
  if (hash && hash.length > 1) {
    const params = new URLSearchParams(hash.slice(1))
    const k = params.get('k')
    const p = params.get('p')
    if (k !== null || p !== null) {
      if (window.location.hash) {
        try {
          window.history.replaceState(null, '', window.location.pathname + window.location.search)
        } catch {
          // ignore
        }
      }
      const prev = hashCandidates.get(eventId)
      hashCandidates.set(eventId, { k: validSecret(k) ?? prev?.k ?? null, p: validSecret(p) ?? prev?.p ?? null })
    }
  }
  return hashCandidates.get(eventId) ?? { k: null, p: null }
}

// Called once the server has answered for the candidates (adopted or discarded).
export function settleHashIdentity(eventId: string): void {
  hashCandidates.delete(eventId)
}

// ---------- remembered name, my events, flags ----------

export function getRememberedName(): string {
  return (sget(K.name) ?? '').slice(0, 30)
}
export function setRememberedName(name: string): void {
  const n = name.trim().slice(0, 30)
  if (n) sset(K.name, n)
}

export function listMyEvents(): MyEvent[] {
  const list = sjson<unknown>(K.mine)
  if (!Array.isArray(list)) return []
  return list
    .filter((e): e is MyEvent => !!e && typeof e === 'object' && typeof (e as MyEvent).id === 'string' && typeof (e as MyEvent).title === 'string')
    .map((e): MyEvent => ({ id: e.id, title: e.title, role: e.role === 'organiser' ? 'organiser' : 'guest', at: Number(e.at) || 0 }))
    .slice(0, 20)
}
export function rememberEvent(e: MyEvent): void {
  const list = listMyEvents()
  const prev = list.find(x => x.id === e.id)
  const role = prev?.role === 'organiser' ? 'organiser' : e.role
  const next = [{ ...e, role }, ...list.filter(x => x.id !== e.id)].slice(0, 20)
  sset(K.mine, JSON.stringify(next))
}

export function hasShared(eventId: string): boolean {
  return sget(K.shared(eventId)) === '1'
}
export function markShared(eventId: string): void {
  sset(K.shared(eventId), '1')
}

// "Done" tapped on this device since the viewer's last answer change (so returning visitors are not nagged).
// '0' = answers changed here and Done not tapped since; no value = nothing changed on this device yet.
export function hasTappedDone(eventId: string): boolean {
  return sget(K.done(eventId)) === '1'
}
export function hasEditedHere(eventId: string): boolean {
  return sget(K.done(eventId)) === '0'
}
export function setTappedDone(eventId: string, done: boolean): void {
  sset(K.done(eventId), done ? '1' : '0')
}

// ---------- pending answers ----------

export function readPending(eventId: string): Record<string, AnswerValue | null> {
  const raw = sjson<Record<string, unknown>>(K.pending(eventId))
  const out: Record<string, AnswerValue | null> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [k, v] of Object.entries(raw)) {
    if (!/^[a-z0-9]{8}$/.test(k)) continue
    if (v === null || v === 'free' || v === 'maybe' || v === 'cant') out[k] = v
  }
  return out
}
export function writePending(eventId: string, pending: Record<string, AnswerValue | null>): void {
  if (Object.keys(pending).length === 0) sdel(K.pending(eventId))
  else sset(K.pending(eventId), JSON.stringify(pending))
}

// ---------- the viewer's last-known self (no secrets) ----------

// What the server last said about the viewer on this event: their public person id, name, role and own answers.
// The event page paints it over the anonymous server render on reload, before the identified fetch reconciles.
export interface ViewerCache {
  personId: string
  name: string
  isOrganiser: boolean
  version: number                          // event.version the answers were read at
  answers: Record<string, AnswerValue>
}

// The raw stored string (a stable primitive, for useSyncExternalStore), only while an identity is still held here.
export function readViewerCacheRaw(eventId: string): string | null {
  const id = readIdentity(eventId)
  if (!id.personToken && !id.organiserKey) return null
  return sget(K.viewer(eventId))
}

export function parseViewerCache(raw: string | null): ViewerCache | null {
  if (!raw) return null
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return null
  }
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (typeof o.personId !== 'string' || !o.personId || typeof o.name !== 'string') return null
  const answers: Record<string, AnswerValue> = {}
  if (o.answers && typeof o.answers === 'object') {
    for (const [k, a] of Object.entries(o.answers as Record<string, unknown>)) {
      if (/^[a-z0-9]{8}$/.test(k) && (a === 'free' || a === 'maybe' || a === 'cant')) answers[k] = a
    }
  }
  return {
    personId: o.personId,
    name: o.name.slice(0, 60),
    isOrganiser: o.isOrganiser === true,
    version: Number.isFinite(o.version) ? Number(o.version) : 0,
    answers,
  }
}

export function readViewerCache(eventId: string): ViewerCache | null {
  return parseViewerCache(readViewerCacheRaw(eventId))
}

// Records the viewer from an identified server state; anything else (anonymous, no identity held) is ignored.
export function writeViewerCache(eventId: string, state: EventState): void {
  const id = readIdentity(eventId)
  const personId = state.viewer.personId
  if (!personId || (!id.personToken && !id.organiserKey)) return
  const me = state.people.find(p => p.id === personId)
  if (!me) return
  const entry: ViewerCache = {
    personId,
    name: state.viewer.name ?? me.name,
    isOrganiser: state.viewer.isOrganiser,
    version: state.event.version,
    answers: me.answers,
  }
  const raw = JSON.stringify(entry)
  if (sget(K.viewer(eventId)) !== raw) sset(K.viewer(eventId), raw)
}

export function clearViewerCache(eventId: string): void {
  sdel(K.viewer(eventId))
}

// ---------- create -> event page handoff ----------

// The organiser's full state from the create response, so the event page's first paint after "Make the link"
// is already the organiser view (share card, tools), not the public guest layout. Page lifetime only.
const seeded = new Map<string, EventState>()

export function seedEventState(state: EventState): void {
  seeded.set(state.event.id, state)
}
export function seededEventState(eventId: string, initial: EventState): EventState | null {
  const s = seeded.get(eventId)
  return s && s.event.version >= initial.event.version ? s : null
}
