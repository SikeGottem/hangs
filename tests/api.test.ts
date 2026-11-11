// Route-handler tests: calls the real handlers with Request objects against a temp-file DB.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from '@libsql/client'
import * as answersRoute from '@/app/api/events/[id]/answers/route'
import * as lockRoute from '@/app/api/events/[id]/lock/route'
import * as optionsRoute from '@/app/api/events/[id]/options/route'
import * as personRoute from '@/app/api/events/[id]/people/[personId]/route'
import * as meRoute from '@/app/api/events/[id]/people/me/route'
import * as peopleRoute from '@/app/api/events/[id]/people/route'
import * as eventRoute from '@/app/api/events/[id]/route'
import * as eventsRoute from '@/app/api/events/route'
import { setClockForTests } from '@/lib/events'
import { hashSecret } from '@/lib/tokens'
import type { CreateEventResponse, EventState, JoinResponse, SaveAnswersResponse } from '@/lib/types'
import { freshIp, future, futureDates, sydneyToday, useTempDb } from './db-helper'

// Happy-path response shapes (state is only null when the read after a committed write fails).
type Created = CreateEventResponse & { state: EventState }
type Joined = JoinResponse & { state: EventState }

let db: Client
let cleanup: () => void
beforeAll(() => ({ db, cleanup } = useTempDb()))
afterAll(() => cleanup())

interface Opts { body?: unknown; raw?: string; headers?: Record<string, string>; ip?: string; contentType?: string | null }

function req(method: string, path: string, o: Opts = {}): Request {
  const headers = new Headers(o.headers)
  headers.set('x-real-ip', o.ip ?? freshIp())
  const hasBody = o.body !== undefined || o.raw !== undefined
  if (hasBody && o.contentType !== null) headers.set('content-type', o.contentType ?? 'application/json')
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: o.raw ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined),
  })
}

const ctx = <P extends Record<string, string>>(params: P) => ({ params: Promise.resolve(params) })
const auth = (r: { organiserKey?: string; personToken?: string }) => ({
  ...(r.organiserKey ? { 'x-hangs-organiser': r.organiserKey } : {}),
  ...(r.personToken ? { 'x-hangs-person': r.personToken } : {}),
})

async function create(o: Partial<{ mode: 'days' | 'parts'; dates: string[]; name: string; ip: string }> = {}): Promise<Created> {
  const res = await eventsRoute.POST(req('POST', '/api/events', {
    ip: o.ip,
    body: { title: 'Picnic at mine', organiserName: o.name ?? 'Ethan', mode: o.mode ?? 'days', dates: o.dates ?? futureDates(3), tz: 'Australia/Sydney' },
  }))
  expect(res.status).toBe(201)
  return res.json()
}

async function join(id: string, name: string, answers: unknown[] = [], ip?: string) {
  return peopleRoute.POST(req('POST', `/api/events/${id}/people`, { body: { name, answers }, ip }), ctx({ id }))
}

async function errorOf(res: Response) {
  const body = await res.json()
  return { status: res.status, code: body.error?.code as string, message: body.error?.message as string }
}

describe('POST /api/events', () => {
  it('creates and returns secrets once, no-store', async () => {
    const res = await eventsRoute.POST(req('POST', '/api/events', { body: { title: 'Picnic', organiserName: 'Ethan', dates: [future(2)] } }))
    expect(res.status).toBe(201)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body: Created = await res.json()
    expect(Object.keys(body).sort()).toEqual(['id', 'organiserKey', 'personId', 'personToken', 'state'])
    expect(body.state.event.tz).toBe('Australia/Sydney')
  })

  it('rejects bad input, non-JSON content types, invalid JSON and big bodies', async () => {
    let r = await errorOf(await eventsRoute.POST(req('POST', '/api/events', { body: { title: '', organiserName: 'E', dates: [future(1)] } })))
    expect(r).toMatchObject({ status: 400, code: 'bad_request' })
    r = await errorOf(await eventsRoute.POST(req('POST', '/api/events', { raw: '{"title":"x"}', contentType: 'text/plain' })))
    expect(r).toMatchObject({ status: 400, code: 'bad_request' })
    r = await errorOf(await eventsRoute.POST(req('POST', '/api/events', { raw: '{"title":', contentType: 'application/json; charset=utf-8' })))
    expect(r).toMatchObject({ status: 400, code: 'invalid_json' })
    r = await errorOf(await eventsRoute.POST(req('POST', '/api/events', { raw: JSON.stringify({ note: 'x'.repeat(17_000) }) })))
    expect(r).toMatchObject({ status: 413, code: 'payload_too_large' })
    r = await errorOf(await eventsRoute.POST(req('POST', '/api/events', { body: { title: 'P', organiserName: 'E', mode: 'parts', dates: futureDates(21) } })))
    expect(r).toMatchObject({ status: 400, code: 'too_many_options' })
  })

  it('rate limits the 21st create from one IP with a human message', async () => {
    const ip = freshIp()
    for (let i = 0; i < 20; i++) await create({ ip })
    const res = await eventsRoute.POST(req('POST', '/api/events', { ip, body: { title: 'P', organiserName: 'E', dates: [future(1)] } }))
    expect(res.status).toBe(429)
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0)
    // The create window is an hour, so the message names the real wait, not "a minute".
    const err = (await res.json()).error
    expect(err.code).toBe('rate_limited')
    expect(err.message).toMatch(/^Too many requests from this connection just now\. Try again in (a minute|\d+ minutes|an hour)\.$/)
    const minutes = Math.ceil(Number(res.headers.get('retry-after')) / 60)
    if (minutes > 1 && minutes < 60) expect(err.message).toContain(`${minutes} minutes`)
  })
})

describe('GET /api/events/[id]', () => {
  it('404s with the JSON error shape for bad and unknown ids', async () => {
    for (const id of ['abc', 'doesnotexist', 'zzzzzzzzzz']) {
      const res = await eventRoute.GET(req('GET', `/api/events/${id}`), ctx({ id }))
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: { code: 'not_found', message: expect.any(String) } })
    }
  })

  it('returns state with an etag, honours If-None-Match, and never returns secrets', async () => {
    const c = await create()
    const res = await eventRoute.GET(req('GET', `/api/events/${c.id}`, { headers: auth(c) }), ctx({ id: c.id }))
    expect(res.status).toBe(200)
    expect(res.headers.get('etag')).toBe(`"1-${sydneyToday()}"`)
    const text = await res.text()
    for (const secret of [c.organiserKey, c.personToken, hashSecret(c.organiserKey), hashSecret(c.personToken)]) expect(text).not.toContain(secret)
    expect(text).not.toMatch(/token_hash|organiser_key|"personToken"|"organiserKey"|Hash"/)
    const state: EventState = JSON.parse(text)
    expect(state.viewer.isOrganiser).toBe(true)

    const etag = res.headers.get('etag') ?? ''
    expect(state.etag).toBe(etag.replace(/"/g, ''))
    const same = await eventRoute.GET(req('GET', `/api/events/${c.id}`, { headers: { 'if-none-match': etag } }), ctx({ id: c.id }))
    expect(same.status).toBe(304)
    expect(same.headers.get('cache-control')).toBe('no-store')
    expect(await same.text()).toBe('')
    const stale = await eventRoute.GET(req('GET', `/api/events/${c.id}`, { headers: { 'if-none-match': `"0-${sydneyToday()}"` } }), ctx({ id: c.id }))
    expect(stale.status).toBe(200)
    const bareVersion = await eventRoute.GET(req('GET', `/api/events/${c.id}`, { headers: { 'if-none-match': '"1"' } }), ctx({ id: c.id }))
    expect(bareVersion.status).toBe(200)
  })

  it('an unchanged event is not a 304 once the date in its timezone has moved on', async () => {
    const c = await create({ dates: [future(0), future(1)] })
    const first = await eventRoute.GET(req('GET', `/api/events/${c.id}`), ctx({ id: c.id }))
    const etag = first.headers.get('etag') ?? ''
    setClockForTests(() => Date.now() + 86_400_000)
    try {
      const next = await eventRoute.GET(req('GET', `/api/events/${c.id}`, { headers: { 'if-none-match': etag } }), ctx({ id: c.id }))
      expect(next.status).toBe(200)
      const state: EventState = await next.json()
      expect(state.today).toBe(future(1))
      expect(state.options[0].isPast).toBe(true)
      expect(next.headers.get('etag')).not.toBe(etag)
    } finally {
      setClockForTests(null)
    }
  })

  it('mutations on unknown events 404 before any per-event rate-limit row is written', async () => {
    const before = await db.execute("SELECT COUNT(*) AS n FROM rate_limits WHERE key NOT LIKE 'mut_ip:%'")
    const ip = freshIp()
    for (let i = 0; i < 5; i++) {
      const id = `zz${String(i).padStart(8, '2')}`
      const h = { 'x-hangs-organiser': 'k'.repeat(43) }
      const patch = await eventRoute.PATCH(req('PATCH', `/api/events/${id}`, { body: { title: 'x' }, headers: h, ip }), ctx({ id }))
      expect(patch.status).toBe(404)
      const put = await answersRoute.PUT(req('PUT', `/api/events/${id}/answers`, { body: { answers: [] }, ip }), ctx({ id }))
      expect(put.status).toBe(404)
      const unlock = await lockRoute.DELETE(req('DELETE', `/api/events/${id}/lock`, { headers: h, ip }), ctx({ id }))
      expect(unlock.status).toBe(404)
      const joined = await join(id, 'Sam', [], ip)
      expect(joined.status).toBe(404)
    }
    const after = await db.execute("SELECT COUNT(*) AS n FROM rate_limits WHERE key NOT LIKE 'mut_ip:%'")
    expect(Number(after.rows[0].n)).toBe(Number(before.rows[0].n))
    const perIp = await db.execute("SELECT COUNT(*) AS n FROM rate_limits WHERE key LIKE 'mut_ip:%'")
    expect(Number(perIp.rows[0].n)).toBeGreaterThan(0)
  })

  it('flags rejected credentials instead of erroring', async () => {
    const c = await create()
    const res = await eventRoute.GET(req('GET', `/api/events/${c.id}`, { headers: { 'x-hangs-person': 'bogus', 'x-hangs-organiser': 'bogus' } }), ctx({ id: c.id }))
    const s: EventState = await res.json()
    expect(s.viewer).toMatchObject({ personTokenRejected: true, organiserKeyRejected: true, isOrganiser: false, personId: null })
  })
})

describe('join, answers, rename', () => {
  it('joins, saves, clears and renames; a body personId is ignored', async () => {
    const c = await create()
    const [a, b] = c.state.options
    const jr = await join(c.id, 'Sam', [{ optionId: a.id, value: 'free' }])
    expect(jr.status).toBe(201)
    const j: Joined = await jr.json()
    expect(j.state.people.find(p => p.id === j.personId)?.answers).toEqual({ [a.id]: 'free' })

    const ana: Joined = await (await join(c.id, 'Ana')).json()
    const save = await answersRoute.PUT(req('PUT', `/api/events/${c.id}/answers`, {
      headers: auth({ personToken: j.personToken }),
      body: { personId: ana.personId, answers: [{ optionId: b.id, value: 'maybe' }, { optionId: a.id, value: null }] },
    }), ctx({ id: c.id }))
    expect(save.status).toBe(200)
    const s: SaveAnswersResponse = await save.json()
    expect(s.state.people.find(p => p.id === j.personId)?.answers).toEqual({ [b.id]: 'maybe' })
    expect(s.state.people.find(p => p.id === ana.personId)?.answers).toEqual({})
    expect(s.skippedOptionIds).toEqual([])

    const ren = await meRoute.PATCH(req('PATCH', `/api/events/${c.id}/people/me`, { headers: auth({ personToken: j.personToken }), body: { name: 'Sam B' } }), ctx({ id: c.id }))
    expect(ren.status).toBe(200)
    expect(((await ren.json()) as EventState).viewer.name).toBe('Sam B')
    const clash = await errorOf(await meRoute.PATCH(req('PATCH', `/api/events/${c.id}/people/me`, { headers: auth({ personToken: j.personToken }), body: { name: 'ana' } }), ctx({ id: c.id })))
    expect(clash).toMatchObject({ status: 409, code: 'name_taken' })
  })

  it('name collision on join is 409 with the human message', async () => {
    const c = await create({ name: 'Priya' })
    await join(c.id, 'Sam')
    const r = await errorOf(await join(c.id, 'Sam'))
    expect(r.status).toBe(409)
    expect(r.code).toBe('name_taken')
    expect(r.message.startsWith("There's already someone called Sam here")).toBe(true)
    expect(r.message).toContain('ask Priya')
  })

  it('writes need a person token, or the organiser key for the organiser row', async () => {
    const c = await create()
    const a = c.state.options[0]
    const none = await errorOf(await answersRoute.PUT(req('PUT', `/api/events/${c.id}/answers`, { body: { answers: [{ optionId: a.id, value: 'free' }] } }), ctx({ id: c.id })))
    expect(none).toMatchObject({ status: 401, code: 'unauthorized' })
    const org = await answersRoute.PUT(req('PUT', `/api/events/${c.id}/answers`, { headers: auth({ organiserKey: c.organiserKey }), body: { answers: [{ optionId: a.id, value: 'free' }] } }), ctx({ id: c.id }))
    expect(org.status).toBe(200)
    const s: SaveAnswersResponse = await org.json()
    expect(s.state.people.find(p => p.isOrganiser)?.answers).toEqual({ [a.id]: 'free' })
    const plain = await errorOf(await answersRoute.PUT(req('PUT', `/api/events/${c.id}/answers`, {
      headers: auth({ organiserKey: c.organiserKey }), raw: JSON.stringify({ answers: [{ optionId: a.id, value: 'free' }] }), contentType: 'text/plain',
    }), ctx({ id: c.id })))
    expect(plain).toMatchObject({ status: 400, code: 'bad_request' })
  })

  it('rate limits joins per IP per event (61st is 429) without blocking other events', async () => {
    const c1 = await create()
    const c2 = await create()
    const ip = freshIp()
    for (let i = 0; i < 60; i++) expect((await join(c1.id, `Guest ${i}`, [], ip)).status).toBe(201)
    const r = await errorOf(await join(c1.id, 'Guest 60', [], ip))
    expect(r).toMatchObject({ status: 429, code: 'rate_limited' })
    expect((await join(c2.id, 'Someone', [], ip)).status).toBe(201)
  })

  it('the 151st person gets event_full', async () => {
    const c = await create()
    const now = Date.now()
    await db.batch(Array.from({ length: 149 }, (_, i) => ({
      sql: 'INSERT INTO people (id, event_id, name, name_key, token_hash, is_organiser, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)',
      args: [`api${String(i).padStart(7, '0')}`, c.id, `F ${i}`, `f ${i}`, hashSecret(`api-${c.id}-${i}`), now, now],
    })), 'write')
    const r = await errorOf(await join(c.id, 'One too many'))
    expect(r).toMatchObject({ status: 409, code: 'event_full' })
  })
})

describe('organiser routes', () => {
  it('non-organisers get 403; the organiser can patch, set dates, remove, lock and unlock', async () => {
    const c = await create()
    const j: Joined = await (await join(c.id, 'Sam', [{ optionId: c.state.options[0].id, value: 'free' }])).json()
    const guest = auth({ personToken: j.personToken })
    const org = auth({ organiserKey: c.organiserKey })
    const id = c.id

    expect((await eventRoute.PATCH(req('PATCH', `/api/events/${id}`, { headers: guest, body: { title: 'Hacked' } }), ctx({ id }))).status).toBe(403)
    expect((await optionsRoute.PUT(req('PUT', `/api/events/${id}/options`, { headers: guest, body: { dates: [future(1)] } }), ctx({ id }))).status).toBe(403)
    expect((await personRoute.DELETE(req('DELETE', `/api/events/${id}/people/${j.personId}`, { headers: guest }), ctx({ id, personId: j.personId }))).status).toBe(403)
    expect((await lockRoute.POST(req('POST', `/api/events/${id}/lock`, { headers: guest, body: { optionId: c.state.options[0].id } }), ctx({ id }))).status).toBe(403)
    expect((await lockRoute.DELETE(req('DELETE', `/api/events/${id}/lock`, { headers: guest }), ctx({ id }))).status).toBe(403)

    const p = await eventRoute.PATCH(req('PATCH', `/api/events/${id}`, { headers: org, body: { title: 'BBQ at mine', note: 'Bring drinks' } }), ctx({ id }))
    expect(((await p.json()) as EventState).event).toMatchObject({ title: 'BBQ at mine', note: 'Bring drinks' })

    const lock = await lockRoute.POST(req('POST', `/api/events/${id}/lock`, { headers: org, body: { optionId: c.state.options[0].id, time: '18:00', place: 'Mine' } }), ctx({ id }))
    expect(lock.status).toBe(200)
    const locked: EventState = await lock.json()
    expect(locked.event.lock).toMatchObject({ time: '18:00', place: 'Mine' })
    expect(locked.attendance?.free).toEqual([j.personId])

    const drop = await errorOf(await optionsRoute.PUT(req('PUT', `/api/events/${id}/options`, { headers: org, body: { dates: [future(40)] } }), ctx({ id })))
    expect(drop).toMatchObject({ status: 409, code: 'locked_option' })

    const unlock = await lockRoute.DELETE(req('DELETE', `/api/events/${id}/lock`, { headers: org }), ctx({ id }))
    expect(((await unlock.json()) as EventState).event.lock).toBeNull()
    expect((await errorOf(await lockRoute.DELETE(req('DELETE', `/api/events/${id}/lock`, { headers: org }), ctx({ id })))).code).toBe('not_locked')

    const self = await errorOf(await personRoute.DELETE(req('DELETE', `/api/events/${id}/people/${c.personId}`, { headers: org }), ctx({ id, personId: c.personId })))
    expect(self).toMatchObject({ status: 400, code: 'cannot_remove_organiser' })
    const rm = await personRoute.DELETE(req('DELETE', `/api/events/${id}/people/${j.personId}`, { headers: org }), ctx({ id, personId: j.personId }))
    expect(rm.status).toBe(200)
    expect(((await rm.json()) as EventState).people).toHaveLength(1)
    const gone = await errorOf(await answersRoute.PUT(req('PUT', `/api/events/${id}/answers`, { headers: guest, body: { answers: [{ optionId: c.state.options[0].id, value: 'free' }] } }), ctx({ id })))
    expect(gone.status).toBe(401)
  })

  it('parts-mode date edits above 20 dates are too_many_options', async () => {
    const c = await create({ mode: 'parts', dates: futureDates(5) })
    const r = await errorOf(await optionsRoute.PUT(req('PUT', `/api/events/${c.id}/options`, { headers: auth(c), body: { dates: futureDates(21) } }), ctx({ id: c.id })))
    expect(r).toMatchObject({ status: 400, code: 'too_many_options', message: "That's the max with parts of the day: 20 days." })
  })
})

describe('cross-event isolation', () => {
  it("event A's credentials are useless against event B", async () => {
    const A = await create()
    const B = await create()
    const ja: Joined = await (await join(A.id, 'Sam')).json()
    const b0 = B.state.options[0].id

    const asPerson = await errorOf(await answersRoute.PUT(req('PUT', `/api/events/${B.id}/answers`, { headers: auth({ personToken: ja.personToken }), body: { answers: [{ optionId: b0, value: 'free' }] } }), ctx({ id: B.id })))
    expect(asPerson.status).toBe(401)
    const asOrgPerson = await errorOf(await answersRoute.PUT(req('PUT', `/api/events/${B.id}/answers`, { headers: auth({ organiserKey: A.organiserKey }), body: { answers: [{ optionId: b0, value: 'free' }] } }), ctx({ id: B.id })))
    expect(asOrgPerson.status).toBe(401)
    const asOrg = await errorOf(await eventRoute.PATCH(req('PATCH', `/api/events/${B.id}`, { headers: auth({ organiserKey: A.organiserKey }), body: { title: 'x' } }), ctx({ id: B.id })))
    expect(asOrg.status).toBe(403)
    const rename = await errorOf(await meRoute.PATCH(req('PATCH', `/api/events/${B.id}/people/me`, { headers: auth({ personToken: A.personToken }), body: { name: 'x' } }), ctx({ id: B.id })))
    expect(rename.status).toBe(401)

    // B's organiser removing a person id that belongs to A -> 404, and A's person survives.
    const rm = await errorOf(await personRoute.DELETE(req('DELETE', `/api/events/${B.id}/people/${ja.personId}`, { headers: auth({ organiserKey: B.organiserKey }) }), ctx({ id: B.id, personId: ja.personId })))
    expect(rm.status).toBe(404)
    const bad = await errorOf(await personRoute.DELETE(req('DELETE', `/api/events/${B.id}/people/NOTANID`, { headers: auth({ organiserKey: B.organiserKey }) }), ctx({ id: B.id, personId: 'NOTANID' })))
    expect(bad.status).toBe(404)
    const stillA: EventState = await (await eventRoute.GET(req('GET', `/api/events/${A.id}`), ctx({ id: A.id }))).json()
    expect(stillA.people.some(p => p.id === ja.personId)).toBe(true)

    // Locking B with an option id from A is rejected.
    const lock = await errorOf(await lockRoute.POST(req('POST', `/api/events/${B.id}/lock`, { headers: auth({ organiserKey: B.organiserKey }), body: { optionId: A.state.options[0].id } }), ctx({ id: B.id })))
    expect(lock.status).toBe(400)
  })
})
