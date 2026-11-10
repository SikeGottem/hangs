// Round-trip budget, Server-Timing, cold-start schema and rate-limit privacy tests for the API against a temp-file DB.
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from '@libsql/client'
import * as answersRoute from '@/app/api/events/[id]/answers/route'
import * as icsRoute from '@/app/api/events/[id]/ics/route'
import * as lockRoute from '@/app/api/events/[id]/lock/route'
import * as ogRoute from '@/app/api/events/[id]/og/route'
import * as optionsRoute from '@/app/api/events/[id]/options/route'
import * as personRoute from '@/app/api/events/[id]/people/[personId]/route'
import * as meRoute from '@/app/api/events/[id]/people/me/route'
import * as peopleRoute from '@/app/api/events/[id]/people/route'
import * as eventRoute from '@/app/api/events/[id]/route'
import * as eventsRoute from '@/app/api/events/route'
import { measureDb, resetSchemaStateForTests, SCHEMA_VERSION, serverTimingValue } from '@/lib/db'
import { getEventSummary, loadPublicEvent } from '@/lib/events'
import { clientIp } from '@/lib/http'
import { limitKey, MAX_WINDOW_MS, readMissBlocked } from '@/lib/ratelimit'
import type { CreateEventResponse, EventState, JoinResponse } from '@/lib/types'
import { freshIp, future, futureDates, useTempDb } from './db-helper'

type Created = CreateEventResponse & { state: EventState }

let db: Client
let cleanup: () => void
beforeAll(() => ({ db, cleanup } = useTempDb()))
afterAll(() => cleanup())

function req(method: string, path: string, o: { body?: unknown; headers?: Record<string, string>; ip?: string } = {}): Request {
  const headers = new Headers(o.headers)
  headers.set('x-real-ip', o.ip ?? freshIp())
  if (o.body !== undefined) headers.set('content-type', 'application/json')
  return new Request(`http://localhost${path}`, { method, headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined })
}
const ctx = <P extends Record<string, string>>(params: P) => ({ params: Promise.resolve(params) })

// Round trips reported by the Server-Timing header.
function trips(res: Response): number {
  const h = res.headers.get('server-timing') ?? ''
  const m = /^db;dur=\d+(\.\d)?;desc="(\d+) trips?"$/.exec(h)
  expect(m, `Server-Timing: ${h}`).not.toBeNull()
  return Number(m![2])
}

async function create(ip?: string): Promise<{ res: Response; body: Created }> {
  const res = await eventsRoute.POST(req('POST', '/api/events', { ip, body: { title: 'Picnic', organiserName: 'Ethan', dates: futureDates(3) } }))
  expect(res.status).toBe(201)
  return { res, body: await res.json() }
}

describe('Server-Timing', () => {
  it('reports only duration and trip count', () => {
    expect(serverTimingValue({ trips: 1, ms: 12.345 })).toBe('db;dur=12.3;desc="1 trip"')
    expect(serverTimingValue({ trips: 2, ms: 0 })).toBe('db;dur=0.0;desc="2 trips"')
  })

  it('nested measurements count towards the outer one', async () => {
    await loadPublicEvent('zzzzzzzzzz') // warm: the first call on a fresh database bootstraps the schema
    const { timing } = await measureDb(async () => {
      await db.execute('SELECT 1') // raw client: not counted
      const inner = await measureDb(() => loadPublicEvent('zzzzzzzzzz'))
      expect(inner.timing.trips).toBe(1)
    })
    expect(timing.trips).toBe(1)
  })
})

describe('round trips per endpoint (warm)', () => {
  it('reads: GET state 1, 304 1, stale etag 1, ics 1, og 1, page data 1', async () => {
    const { body: c } = await create()
    const id = c.id
    const auth = { 'x-hangs-person': c.personToken, 'x-hangs-organiser': c.organiserKey }

    const full = await eventRoute.GET(req('GET', `/api/events/${id}`, { headers: auth }), ctx({ id }))
    expect(full.status).toBe(200)
    expect(trips(full)).toBe(1)
    const etag = full.headers.get('etag')!

    const same = await eventRoute.GET(req('GET', `/api/events/${id}`, { headers: { ...auth, 'if-none-match': etag } }), ctx({ id }))
    expect(same.status).toBe(304)
    expect(trips(same)).toBe(1)

    const stale = await eventRoute.GET(req('GET', `/api/events/${id}`, { headers: { ...auth, 'if-none-match': etag.replace(/"1-/, '"0-') } }), ctx({ id }))
    expect(stale.status).toBe(200)
    expect(trips(stale)).toBe(1)
    const s: EventState = await stale.json()
    expect(s.viewer).toMatchObject({ isOrganiser: true, personId: c.personId })

    const missing = await eventRoute.GET(req('GET', '/api/events/zzzzzzzzzz', { headers: { 'if-none-match': etag } }), ctx({ id: 'zzzzzzzzzz' }))
    expect(missing.status).toBe(404)
    expect(trips(missing)).toBe(1)

    const og = await ogRoute.GET(req('GET', `/api/events/${id}/og?v=0`), ctx({ id }))
    expect(og.status).toBe(307)
    expect(og.headers.get('location')).toBe(`/api/events/${id}/og?v=1`)
    expect(trips(og)).toBe(1)

    const { timing } = await measureDb(() => getEventSummary(id))
    expect(timing.trips).toBe(1)

    // Lock (organiser) so the .ics exists, then the ics read is one trip.
    const locked = await lockRoute.POST(req('POST', `/api/events/${id}/lock`, { headers: auth, body: { optionId: c.state.options[0].id } }), ctx({ id }))
    expect(locked.status).toBe(200)
    expect(trips(locked)).toBe(2)
    const ics = await icsRoute.GET(req('GET', `/api/events/${id}/ics`), ctx({ id }))
    expect(ics.status).toBe(200)
    expect(trips(ics)).toBe(1)
  })

  it('og renders the current version in one trip', async () => {
    const { body: c } = await create()
    const og = await ogRoute.GET(req('GET', `/api/events/${c.id}/og?v=1`), ctx({ id: c.id }))
    expect(og.status).toBe(200)
    expect(og.headers.get('content-type')).toContain('image/png')
    expect(trips(og)).toBe(1)
  }, 20_000)

  it('mutations: create, join, answers, rename, patch, options, remove, unlock are 2 each', async () => {
    const { res, body: c } = await create()
    expect(trips(res)).toBe(2)
    const id = c.id
    const org = { 'x-hangs-organiser': c.organiserKey }
    const [a, b] = c.state.options

    const jr = await peopleRoute.POST(req('POST', `/api/events/${id}/people`, { body: { name: 'Sam', answers: [{ optionId: a.id, value: 'free' }] } }), ctx({ id }))
    expect(jr.status).toBe(201)
    expect(trips(jr)).toBe(2)
    const j: JoinResponse & { state: EventState } = await jr.json()
    const guest = { 'x-hangs-person': j.personToken }

    const put = await answersRoute.PUT(req('PUT', `/api/events/${id}/answers`, { headers: guest, body: { answers: [{ optionId: b.id, value: 'maybe' }, { optionId: a.id, value: null }] } }), ctx({ id }))
    expect(put.status).toBe(200)
    expect(trips(put)).toBe(2)

    // The organiser answering with only their key is still 2 (the organiser row comes from the preflight).
    const orgPut = await answersRoute.PUT(req('PUT', `/api/events/${id}/answers`, { headers: org, body: { answers: [{ optionId: a.id, value: 'free' }] } }), ctx({ id }))
    expect(orgPut.status).toBe(200)
    expect(trips(orgPut)).toBe(2)

    // Nothing valid to write: still 2 (preflight, then a read).
    const noop = await answersRoute.PUT(req('PUT', `/api/events/${id}/answers`, { headers: guest, body: { answers: [{ optionId: 'zzzzzzzz', value: 'free' }] } }), ctx({ id }))
    expect(noop.status).toBe(200)
    expect(trips(noop)).toBe(2)
    expect((await noop.json()).skippedOptionIds).toEqual(['zzzzzzzz'])

    const ren = await meRoute.PATCH(req('PATCH', `/api/events/${id}/people/me`, { headers: guest, body: { name: 'Sam B' } }), ctx({ id }))
    expect(ren.status).toBe(200)
    expect(trips(ren)).toBe(2)

    const patch = await eventRoute.PATCH(req('PATCH', `/api/events/${id}`, { headers: org, body: { title: 'BBQ' } }), ctx({ id }))
    expect(patch.status).toBe(200)
    expect(trips(patch)).toBe(2)

    const opts = await optionsRoute.PUT(req('PUT', `/api/events/${id}/options`, { headers: org, body: { dates: [a.date, b.date, future(20)] } }), ctx({ id }))
    expect(opts.status).toBe(200)
    expect(trips(opts)).toBe(2)

    const lock = await lockRoute.POST(req('POST', `/api/events/${id}/lock`, { headers: org, body: { optionId: a.id } }), ctx({ id }))
    expect(trips(lock)).toBe(2)
    const unlock = await lockRoute.DELETE(req('DELETE', `/api/events/${id}/lock`, { headers: org }), ctx({ id }))
    expect(unlock.status).toBe(200)
    expect(trips(unlock)).toBe(2)

    const rm = await personRoute.DELETE(req('DELETE', `/api/events/${id}/people/${j.personId}`, { headers: org }), ctx({ id, personId: j.personId }))
    expect(rm.status).toBe(200)
    expect(trips(rm)).toBe(2)

    // Errors stop after the preflight: a guest trying an organiser action is one trip.
    const denied = await eventRoute.PATCH(req('PATCH', `/api/events/${id}`, { headers: guest, body: { title: 'x' } }), ctx({ id }))
    expect(denied.status).toBe(403)
    expect(trips(denied)).toBe(1)
  })
})

describe('read paths never write', () => {
  it('GET, 304, 404, og and ics leave rate_limits and versions untouched', async () => {
    const { body: c } = await create()
    const id = c.id
    const snapshot = async () => {
      const rl = await db.execute('SELECT COUNT(*) AS n, COALESCE(SUM(count), 0) AS s FROM rate_limits')
      const v = await db.execute({ sql: 'SELECT version FROM events WHERE id = ?', args: [id] })
      return [Number(rl.rows[0].n), Number(rl.rows[0].s), Number(v.rows[0].version)]
    }
    const before = await snapshot()
    const ip = freshIp()
    const first = await eventRoute.GET(req('GET', `/api/events/${id}`, { ip }), ctx({ id }))
    await eventRoute.GET(req('GET', `/api/events/${id}`, { ip, headers: { 'if-none-match': first.headers.get('etag')! } }), ctx({ id }))
    await eventRoute.GET(req('GET', '/api/events/zzzzzzzzzz', { ip }), ctx({ id: 'zzzzzzzzzz' }))
    await ogRoute.GET(req('GET', `/api/events/${id}/og?v=9`, { ip }), ctx({ id }))
    await icsRoute.GET(req('GET', `/api/events/${id}/ics`, { ip }), ctx({ id }))
    expect(await snapshot()).toEqual(before)
  })

  it('an IP that keeps missing is turned away in memory, without a database read; real hangs still load', async () => {
    const { body: c } = await create()
    const ip = freshIp()
    let last: Response | null = null
    for (let i = 0; i < 121; i++) last = await eventRoute.GET(req('GET', '/api/events/zzzzzzzzzz', { ip }), ctx({ id: 'zzzzzzzzzz' }))
    expect(last!.status).toBe(429)
    expect(trips(last!)).toBe(0)
    expect(Number(last!.headers.get('retry-after'))).toBeGreaterThan(0)
    const other = await eventRoute.GET(req('GET', `/api/events/${c.id}`), ctx({ id: c.id }))
    expect(other.status).toBe(200)
  })

  it('og misses count too; a blocked IP gets the uncached brand card with no read, and the page key matches', async () => {
    const { body: c } = await create()
    const ip = freshIp()
    for (let i = 0; i < 120; i++) {
      const r = await ogRoute.GET(req('GET', '/api/events/zzzzzzzzzz/og', { ip }), ctx({ id: 'zzzzzzzzzz' }))
      expect(r.headers.get('location')).toBe('/api/og')
    }
    // The real event no longer answers with its version (no existence oracle), and nothing touched the database.
    const blocked = await ogRoute.GET(req('GET', `/api/events/${c.id}/og`, { ip }), ctx({ id: c.id }))
    expect(blocked.status).toBe(307)
    expect(blocked.headers.get('location')).toBe('/api/og')
    expect(blocked.headers.get('cache-control')).toBe('no-store')
    expect(blocked.headers.get('server-timing')).toBeNull()
    // Same limiter and key as the API GET and the page (which passes next/headers Headers, not a Request).
    expect((await eventRoute.GET(req('GET', `/api/events/${c.id}`, { ip }), ctx({ id: c.id }))).status).toBe(429)
    expect(readMissBlocked(new Headers({ 'x-real-ip': ip }))).toBe(true)
    expect(readMissBlocked(new Headers({ 'x-real-ip': freshIp() }))).toBe(false)
    const ok = await ogRoute.GET(req('GET', `/api/events/${c.id}/og`), ctx({ id: c.id }))
    expect(ok.headers.get('location')).toBe(`/api/events/${c.id}/og?v=${c.state.event.version}`)
  })
})

describe('cold start schema', () => {
  it('an existing, current schema costs no extra round trip; a fresh database bootstraps once', async () => {
    const { body: c } = await create()
    resetSchemaStateForTests(db) // a new serverless instance
    const cold = await eventRoute.GET(req('GET', `/api/events/${c.id}`), ctx({ id: c.id }))
    expect(cold.status).toBe(200)
    expect(trips(cold)).toBe(1)

    // An older recorded schema version is upgraded once, after the request's own batch.
    await db.execute("UPDATE schema_meta SET value = '1' WHERE key = 'schema_version'")
    resetSchemaStateForTests(db)
    const upgrade = await eventRoute.GET(req('GET', `/api/events/${c.id}`), ctx({ id: c.id }))
    expect(upgrade.status).toBe(200)
    expect(trips(upgrade)).toBe(2)
    const v = await db.execute("SELECT value FROM schema_meta WHERE key = 'schema_version'")
    expect(Number(v.rows[0].value)).toBe(SCHEMA_VERSION)
    const idx = await db.execute("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_rate_limits_window'")
    expect(idx.rows).toHaveLength(1)
    const warm = await eventRoute.GET(req('GET', `/api/events/${c.id}`), ctx({ id: c.id }))
    expect(trips(warm)).toBe(1)
  })

  it('a database with no tables is created on first use (the failed batch is retried)', async () => {
    const fresh = useTempDb()
    try {
      const res = await eventRoute.GET(req('GET', '/api/events/zzzzzzzzzz'), ctx({ id: 'zzzzzzzzzz' }))
      expect(res.status).toBe(404)
      expect(trips(res)).toBe(3) // failed batch, schema, retry
      const tables = await fresh.db.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'events'")
      expect(tables.rows).toHaveLength(1)
    } finally {
      fresh.cleanup()
      // useTempDb's cleanup clears the override; point back at this file's database.
      ;(await import('@/lib/db')).setDbForTests(db)
    }
  })
})

describe('rate-limit privacy', () => {
  it('stores a keyed, daily-rotating hash, never the IP or its plain sha256', async () => {
    const ip = freshIp()
    await create(ip)
    const rows = await db.execute('SELECT key FROM rate_limits')
    const keys = rows.rows.map(r => String(r.key))
    const plain = createHash('sha256').update(ip).digest('hex')
    for (const k of keys) {
      expect(k).not.toContain(ip)
      expect(k).not.toContain(plain.slice(0, 24))
    }
    const now = Date.now()
    const today = limitKey('create', ip, now - (now % 3_600_000))
    expect(keys).toContain(today)
    expect(limitKey('create', ip, now - (now % 3_600_000) + 86_400_000)).not.toBe(today)
    expect(limitKey('create', '10.9.9.9', now - (now % 3_600_000))).not.toBe(today)
  })

  it('expired rows are pruned inside the mutation batch (no extra trip)', async () => {
    const old = Date.now() - MAX_WINDOW_MS - 60_000
    await db.execute({ sql: 'INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 5)', args: ['mut_ip:expired-test', old] })
    const { res } = await create()
    expect(trips(res)).toBe(2)
    const left = await db.execute("SELECT COUNT(*) AS n FROM rate_limits WHERE key = 'mut_ip:expired-test'")
    expect(Number(left.rows[0].n)).toBe(0)
    const stale = await db.execute({ sql: 'SELECT COUNT(*) AS n FROM rate_limits WHERE window_start < ?', args: [Date.now() - MAX_WINDOW_MS] })
    expect(Number(stale.rows[0].n)).toBe(0)
  })

  it('a blocked IP stops writing per-event bucket rows', async () => {
    const { body: c } = await create()
    const ip = freshIp()
    // Push this IP's join_ip bucket over its limit directly.
    const now = Date.now()
    const ws = now - (now % 3_600_000)
    await db.execute({ sql: 'INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 300)', args: [limitKey('join_ip', ip, ws), ws] })
    const r = await peopleRoute.POST(req('POST', `/api/events/${c.id}/people`, { ip, body: { name: 'Zed' } }), ctx({ id: c.id }))
    expect(r.status).toBe(429)
    const perEvent = await db.execute({ sql: 'SELECT COUNT(*) AS n FROM rate_limits WHERE key = ?', args: [limitKey('join', ip, ws, c.id)] })
    expect(Number(perEvent.rows[0].n)).toBe(0)
  })
})

describe('clientIp', () => {
  it('off Vercel trusts x-real-ip, else only the last x-forwarded-for hop', () => {
    const prev = process.env.VERCEL
    delete process.env.VERCEL
    try {
      expect(clientIp(new Request('http://x', { headers: { 'x-real-ip': '1.1.1.1', 'x-forwarded-for': '9.9.9.9' } }))).toBe('1.1.1.1')
      expect(clientIp(new Request('http://x', { headers: { 'x-forwarded-for': '6.6.6.6, 2.2.2.2' } }))).toBe('2.2.2.2')
      process.env.VERCEL = '1'
      expect(clientIp(new Request('http://x', { headers: { 'x-vercel-forwarded-for': '3.3.3.3', 'x-real-ip': '4.4.4.4' } }))).toBe('3.3.3.3')
      expect(clientIp(new Request('http://x', { headers: { 'x-forwarded-for': '5.5.5.5, 7.7.7.7' } }))).toBe('5.5.5.5')
    } finally {
      if (prev === undefined) delete process.env.VERCEL
      else process.env.VERCEL = prev
    }
  })
})
