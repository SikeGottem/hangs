// Client storage tests (node + stubbed window): in-memory identity when localStorage fails, hash-link candidates,
// pending answers, done flag and the create handoff.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HASH_CAPTURE_SCRIPT } from '@/lib/hash-capture'
import { makeState, opt, person } from '@/tests/fixtures'

const TOKEN = 'T'.repeat(43)
const KEY = 'K'.repeat(43)
const OTHER = 'O'.repeat(43)

function fakeWindow(opts: { blocked?: boolean; hash?: string } = {}) {
  const data = new Map<string, string>()
  const loc = { hash: opts.hash ?? '', pathname: '/h/abcdefghjk', search: '' }
  const localStorage = {
    getItem: (k: string) => (opts.blocked ? null : data.get(k) ?? null),
    setItem: (k: string, v: string) => {
      if (opts.blocked) throw new DOMException('blocked', 'SecurityError')
      data.set(k, v)
    },
    removeItem: (k: string) => { data.delete(k) },
  }
  const history = { replaceState: vi.fn((_s: unknown, _t: string, url: string) => { loc.hash = url.includes('#') ? url.slice(url.indexOf('#')) : '' }) }
  return { win: { localStorage, location: loc, history }, data, loc, history }
}

// Fresh module per test: the in-memory maps are module state.
async function load() {
  vi.resetModules()
  return import('./storage')
}

beforeEach(() => vi.unstubAllGlobals())
afterEach(() => vi.unstubAllGlobals())

describe('identity', () => {
  it('round-trips through localStorage and clears the person', async () => {
    const { win, data } = fakeWindow()
    vi.stubGlobal('window', win)
    const s = await load()
    s.writeIdentity('ev1', { personToken: TOKEN, personId: 'p1', organiserKey: KEY })
    expect(JSON.parse(data.get('hangs:p:ev1')!)).toEqual({ token: TOKEN, personId: 'p1' })
    expect(data.get('hangs:k:ev1')).toBe(KEY)
    expect(s.isIdentityPersisted('ev1')).toBe(true)
    s.clearPerson('ev1')
    expect(s.readIdentity('ev1')).toEqual({ personToken: null, personId: null, organiserKey: KEY })
    expect(data.has('hangs:p:ev1')).toBe(false)
  })

  it('keeps working in memory when localStorage throws, and reports that it was not persisted', async () => {
    const { win } = fakeWindow({ blocked: true })
    vi.stubGlobal('window', win)
    const s = await load()
    s.writeIdentity('ev1', { personToken: TOKEN, personId: 'p1', organiserKey: KEY })
    expect(s.readIdentity('ev1')).toEqual({ personToken: TOKEN, personId: 'p1', organiserKey: KEY })
    expect(s.isIdentityPersisted('ev1')).toBe(false)
    const api = await import('./api')
    expect(api.authHeaders('ev1')).toEqual({ 'x-hangs-person': TOKEN, 'x-hangs-organiser': KEY })
  })

  it('ignores malformed stored secrets', async () => {
    const { win, data } = fakeWindow()
    data.set('hangs:p:ev1', JSON.stringify({ token: 'short', personId: 'p1' }))
    data.set('hangs:k:ev1', 'not a key!')
    vi.stubGlobal('window', win)
    const s = await load()
    expect(s.readIdentity('ev1')).toEqual({ personToken: null, personId: null, organiserKey: null })
  })
})

describe('consumeHashIdentity', () => {
  it('strips the hash at once and keeps the candidates until settled (survives a remount or failed fetch)', async () => {
    const { win, loc, history } = fakeWindow({ hash: `#k=${KEY}&p=${TOKEN}` })
    vi.stubGlobal('window', win)
    const s = await load()
    expect(s.consumeHashIdentity('ev1')).toEqual({ k: KEY, p: TOKEN })
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/h/abcdefghjk')
    expect(loc.hash).toBe('')
    // Second call (strict-mode remount, retry after a failed fetch): same candidates although the hash is gone.
    expect(s.consumeHashIdentity('ev1')).toEqual({ k: KEY, p: TOKEN })
    s.settleHashIdentity('ev1')
    expect(s.consumeHashIdentity('ev1')).toEqual({ k: null, p: null })
    // Nothing is stored until the server validates.
    expect(s.readIdentity('ev1')).toEqual({ personToken: null, personId: null, organiserKey: null })
  })

  it('reads the hash the inline layout script already moved out of the address bar, once, for its own event only', async () => {
    const { win, loc, history } = fakeWindow({ hash: `#p=${TOKEN}` })
    loc.pathname = '/h/abcdefghjk'
    // Run the real inline script against the fake window: it stashes the hash and clears the URL before any bundle.
    new Function('window', 'location', 'history', HASH_CAPTURE_SCRIPT)(win, loc, history)
    expect(loc.hash).toBe('')
    expect(history.replaceState).toHaveBeenCalledTimes(1)
    vi.stubGlobal('window', win)
    const s = await load()
    expect(s.consumeHashIdentity('otherevent')).toEqual({ k: null, p: null })
    expect(s.consumeHashIdentity('abcdefghjk')).toEqual({ k: null, p: TOKEN })
    expect((win as { __hangsHash?: unknown }).__hangsHash).toBeUndefined()
    expect(history.replaceState).toHaveBeenCalledTimes(1)
  })

  it('the inline script leaves other pages and other hashes alone', () => {
    for (const [path, hash] of [['/', `#k=${KEY}`], ['/h/abcdefghjk', '#section']]) {
      const { win, loc, history } = fakeWindow({ hash })
      loc.pathname = path
      new Function('window', 'location', 'history', HASH_CAPTURE_SCRIPT)(win, loc, history)
      expect(loc.hash).toBe(hash)
      expect(history.replaceState).not.toHaveBeenCalled()
    }
  })

  it('drops malformed candidates and keeps unrelated hashes', async () => {
    const { win, history } = fakeWindow({ hash: '#k=bad&p=' })
    vi.stubGlobal('window', win)
    const s = await load()
    expect(s.consumeHashIdentity('ev1')).toEqual({ k: null, p: null })
    const other = fakeWindow({ hash: '#section' })
    vi.stubGlobal('window', other.win)
    expect(s.consumeHashIdentity('ev2')).toEqual({ k: null, p: null })
    expect(other.history.replaceState).not.toHaveBeenCalled()
    expect(history.replaceState).toHaveBeenCalledTimes(1)
  })

  it('a later hash adds to, but never erases, an unsettled candidate', async () => {
    const first = fakeWindow({ hash: `#p=${TOKEN}` })
    vi.stubGlobal('window', first.win)
    const s = await load()
    s.consumeHashIdentity('ev1')
    const second = fakeWindow({ hash: `#k=${KEY}` })
    vi.stubGlobal('window', second.win)
    expect(s.consumeHashIdentity('ev1')).toEqual({ k: KEY, p: TOKEN })
    const third = fakeWindow({ hash: `#p=${OTHER}` })
    vi.stubGlobal('window', third.win)
    expect(s.consumeHashIdentity('ev1')).toEqual({ k: KEY, p: OTHER })
  })
})

describe('pending answers, flags and handoff', () => {
  it('persists only valid option ids and values, and removes the key when empty', async () => {
    const { win, data } = fakeWindow()
    vi.stubGlobal('window', win)
    const s = await load()
    s.writePending('ev1', { abcd2345: 'free', efgh6789: null })
    expect(s.readPending('ev1')).toEqual({ abcd2345: 'free', efgh6789: null })
    data.set('hangs:pending:ev1', JSON.stringify({ abcd2345: 'yes', BAD: 'free', efgh6789: 'cant' }))
    expect(s.readPending('ev1')).toEqual({ efgh6789: 'cant' })
    s.writePending('ev1', {})
    expect(data.has('hangs:pending:ev1')).toBe(false)
  })

  it('remembers Done per event until cleared', async () => {
    const { win } = fakeWindow()
    vi.stubGlobal('window', win)
    const s = await load()
    expect(s.hasTappedDone('ev1')).toBe(false)
    s.setTappedDone('ev1', true)
    expect(s.hasTappedDone('ev1')).toBe(true)
    expect(s.hasTappedDone('ev2')).toBe(false)
    expect(s.hasEditedHere('ev1')).toBe(false)
    expect(s.hasEditedHere('ev2')).toBe(false)
    s.setTappedDone('ev1', false)
    expect(s.hasTappedDone('ev1')).toBe(false)
    expect(s.hasEditedHere('ev1')).toBe(true)
  })

  it('hands the create response to the event page only while it is not older than the server state', async () => {
    const s = await load()
    const st = makeState({ options: [opt('aaaaaaaa', '2026-11-21')], people: [person('org0000001', 'Ethan', {}, true)] })
    s.seedEventState(st)
    const id = st.event.id
    expect(s.seededEventState(id, st)).toBe(st)
    const newer = { ...st, event: { ...st.event, version: st.event.version + 1 } }
    expect(s.seededEventState(id, newer)).toBeNull()
    expect(s.seededEventState('other', st)).toBeNull()
  })
})

describe('viewer cache', () => {
  const OPTS = [opt('aaaaaaaa', '2026-11-21'), opt('bbbbbbbb', '2026-11-22')]
  const identified = () => makeState({
    options: OPTS,
    people: [person('org0000001', 'Ethan', {}, true), person('p0000001', 'Sam', { aaaaaaaa: 'free', bbbbbbbb: 'cant' })],
    viewer: { personId: 'p0000001' },
  })

  it('records the identified viewer (no secrets) and reads it back only while an identity is held', async () => {
    const { win, data } = fakeWindow()
    vi.stubGlobal('window', win)
    const s = await load()
    // No identity held: nothing is written.
    s.writeViewerCache('ev1', identified())
    expect(data.has('hangs:me:ev1')).toBe(false)
    s.writeIdentity('ev1', { personToken: TOKEN, personId: 'p0000001' })
    s.writeViewerCache('ev1', identified())
    const raw = data.get('hangs:me:ev1')!
    expect(raw).not.toContain(TOKEN)
    expect(s.readViewerCache('ev1')).toEqual({
      personId: 'p0000001', name: 'Sam', isOrganiser: false, version: 3, answers: { aaaaaaaa: 'free', bbbbbbbb: 'cant' },
    })
    expect(s.readViewerCacheRaw('ev1')).toBe(raw)
    // An anonymous state never overwrites it.
    s.writeViewerCache('ev1', makeState({ options: OPTS, people: [person('p0000001', 'Sam')] }))
    expect(data.get('hangs:me:ev1')).toBe(raw)
  })

  it('is dropped when the person or key changes, and hidden once no identity is held', async () => {
    const { win, data } = fakeWindow()
    vi.stubGlobal('window', win)
    const s = await load()
    s.writeIdentity('ev1', { personToken: TOKEN, personId: 'p0000001' })
    s.writeViewerCache('ev1', identified())
    // Same token written again (every boot validation): kept.
    s.writeIdentity('ev1', { personToken: TOKEN, personId: 'p0000001' })
    expect(data.has('hangs:me:ev1')).toBe(true)
    s.writeIdentity('ev1', { personToken: OTHER })
    expect(data.has('hangs:me:ev1')).toBe(false)
    s.writeViewerCache('ev1', identified())
    s.clearPerson('ev1')
    expect(data.has('hangs:me:ev1')).toBe(false)
    // A cache left behind without an identity (cleared elsewhere) is never read.
    data.set('hangs:me:ev1', JSON.stringify({ personId: 'p0000001', name: 'Sam', answers: {} }))
    expect(s.readViewerCacheRaw('ev1')).toBeNull()
    expect(s.readViewerCache('ev1')).toBeNull()
  })

  it('parses defensively', async () => {
    const s = await load()
    expect(s.parseViewerCache(null)).toBeNull()
    expect(s.parseViewerCache('{nope')).toBeNull()
    expect(s.parseViewerCache(JSON.stringify({ name: 'Sam' }))).toBeNull()
    expect(s.parseViewerCache(JSON.stringify({
      personId: 'p1', name: 'Sam', isOrganiser: 'yes', version: 'x', answers: { aaaaaaaa: 'free', BAD: 'free', bbbbbbbb: 'nah' },
    }))).toEqual({ personId: 'p1', name: 'Sam', isOrganiser: false, version: 0, answers: { aaaaaaaa: 'free' } })
  })
})
