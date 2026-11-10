// Repository tests against a temp-file DB: creation, joins, answers, caps, ownership rules and version bumps.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from '@libsql/client'
import { future, futureDates, useTempDb } from '@/tests/db-helper'
import { HangsError } from './errors'
import {
  authorizeOrganiser, authorizePerson, createEvent, getEventState, getEventSummary, getEventVersion, joinEvent, lockEvent,
  nameKey, patchEvent, prepareJoin, removePerson, renamePerson, saveAnswers, setClockForTests, setEventDates, unlockEvent,
} from './events'
import { setDbForTests } from './db'
import { hashSecret } from './tokens'
import type { AnswerUpdate } from './types'

let db: Client
let cleanup: () => void
beforeAll(() => ({ db, cleanup } = useTempDb()))
afterAll(() => cleanup())
afterEach(() => setClockForTests(null))

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toBeInstanceOf(HangsError)
  await p.catch((e: HangsError) => expect(e.code).toBe(code))
}

async function make(opts: { dates?: string[]; mode?: 'days' | 'parts'; name?: string } = {}) {
  const r = await createEvent({
    title: 'Picnic at mine', note: 'Bring a rug', organiserName: opts.name ?? 'Ethan',
    mode: opts.mode ?? 'days', dates: opts.dates ?? futureDates(3), tz: 'Australia/Sydney',
  })
  return { ...r, state: r.state! }
}

// joinEvent with the state asserted (it is only null when the read after the committed write fails).
async function joinOk(id: string, input: { name: string; answers: AnswerUpdate[] }) {
  const j = await joinEvent(id, input)
  return { ...j, state: j.state! }
}

describe('createEvent', () => {
  it('creates the event, organiser row and options, with the organiser as viewer', async () => {
    const r = await make()
    expect(r.id).toMatch(/^[a-z0-9]{10}$/)
    expect(r.organiserKey).toHaveLength(43)
    expect(r.personToken).toHaveLength(43)
    expect(r.state.event).toMatchObject({ title: 'Picnic at mine', note: 'Bring a rug', mode: 'days', organiserName: 'Ethan', version: 1, lock: null })
    expect(r.state.options).toHaveLength(3)
    expect(r.state.options.every(o => o.part === 'day')).toBe(true)
    expect(r.state.people).toEqual([{ id: r.personId, name: 'Ethan', isOrganiser: true, answers: {}, answeredCount: 0 }])
    expect(r.state.viewer).toMatchObject({ personId: r.personId, isOrganiser: true, personTokenRejected: false, organiserKeyRejected: false })
    const rows = await db.execute({ sql: 'SELECT organiser_key_hash FROM events WHERE id = ?', args: [r.id] })
    expect(rows.rows[0].organiser_key_hash).toBe(hashSecret(r.organiserKey))
  })

  it('expands parts mode to three options per date', async () => {
    const r = await make({ mode: 'parts', dates: futureDates(2) })
    expect(r.state.options.map(o => o.part)).toEqual(['morning', 'afternoon', 'evening', 'morning', 'afternoon', 'evening'])
  })

  it('rejects past or too-far dates and more than 62 options after expansion', async () => {
    await expectCode(make({ dates: [future(-1)] }), 'bad_request')
    await expectCode(make({ dates: [future(400)] }), 'bad_request')
    await expectCode(make({ mode: 'parts', dates: futureDates(21) }), 'too_many_options')
    await expect(make({ mode: 'parts', dates: futureDates(20) })).resolves.toBeTruthy()
  })
})

describe('reads', () => {
  it('never returns tokens or hashes, and flags rejected credentials', async () => {
    const r = await make()
    const pub = await getEventState(r.id, {})
    const text = JSON.stringify(pub)
    expect(text).not.toContain(r.personToken)
    expect(text).not.toContain(r.organiserKey)
    expect(text).not.toContain(hashSecret(r.personToken))
    expect(text).not.toContain(hashSecret(r.organiserKey))
    expect(pub?.viewer).toEqual({ personId: null, name: null, isOrganiser: false, personTokenRejected: false, organiserKeyRejected: false })
    const bad = await getEventState(r.id, { personToken: 'x'.repeat(43), organiserKey: 'y'.repeat(43) })
    expect(bad?.viewer).toMatchObject({ personId: null, isOrganiser: false, personTokenRejected: true, organiserKeyRejected: true })
    expect(await getEventState('zzzzzzzzzz', {})).toBeNull()
    expect(await getEventVersion(r.id)).toBe(1)
  })

  it('an organiser key alone resolves to the organiser person', async () => {
    const r = await make()
    const s = await getEventState(r.id, { organiserKey: r.organiserKey })
    expect(s?.viewer).toMatchObject({ personId: r.personId, isOrganiser: true, name: 'Ethan' })
    const ctx = await authorizePerson(r.id, { organiserKey: r.organiserKey })
    expect(ctx).toMatchObject({ personId: r.personId, isOrganiser: true })
  })
})

describe('joinEvent', () => {
  it('creates the person and saves held answers in one batch, bumping the version', async () => {
    const r = await make()
    const [a, b] = r.state.options
    const j = await joinOk(r.id, { name: 'Sam', answers: [{ optionId: a.id, value: 'free' }, { optionId: b.id, value: null }] })
    expect(j.personToken).toHaveLength(43)
    expect(j.state.viewer).toMatchObject({ personId: j.personId, name: 'Sam', isOrganiser: false })
    expect(j.state.people.find(p => p.id === j.personId)?.answers).toEqual({ [a.id]: 'free' })
    expect(j.state.event.version).toBe(2)
  })

  it('maps a duplicate name (case/space-insensitive) to name_taken with organiser name', async () => {
    const r = await make({ name: 'Priya' })
    await joinEvent(r.id, { name: 'Sam', answers: [] })
    const p = joinEvent(r.id, { name: 'sam', answers: [] })
    await expectCode(p, 'name_taken')
    await p.catch((e: HangsError) => {
      expect(e.message).toBe("There's already someone called sam here. Add an initial, like sam B. If that's you from another app, open the link there, or ask Priya to remove the old one.")
    })
    await expectCode(joinEvent(r.id, { name: 'priya', answers: [] }), 'name_taken')
    expect(nameKey('  Sam   Lee ')).toBe('sam lee')
    expect(await getEventVersion(r.id)).toBe(2)
  })

  it('refuses lookalike names (Cyrillic/Greek homoglyphs, dotless i) on join and rename', async () => {
    const r = await make({ name: 'Olive' })
    await joinEvent(r.id, { name: 'Victor', answers: [] })
    for (const name of ['Victоr', 'Vіctor', 'Victοr', 'Viсtor', 'Vıctor', 'VİCTOR', 'Olіve']) {
      await expectCode(joinEvent(r.id, { name, answers: [] }), 'name_taken')
    }
    const sam = await joinEvent(r.id, { name: 'Sam', answers: [] })
    const ctx = await authorizePerson(r.id, { personToken: sam.personToken })
    await expectCode(renamePerson(ctx, 'Vіctor', {}), 'name_taken')
    await expectCode(renamePerson(ctx, 'Οlіve', {}), 'name_taken')
  })

  it('ignores answers to options from another event', async () => {
    const r1 = await make()
    const r2 = await make()
    const j = await joinOk(r1.id, { name: 'Sam', answers: [{ optionId: r2.state.options[0].id, value: 'free' }] })
    expect(j.state.people.find(p => p.id === j.personId)?.answers).toEqual({})
    const leaked = await db.execute({ sql: 'SELECT COUNT(*) AS n FROM answers WHERE event_id = ?', args: [r2.id] })
    expect(Number(leaked.rows[0].n)).toBe(0)
  })

  it('caps people at 150 (the 151st join is event_full) and writes nothing', async () => {
    const r = await make()
    const now = Date.now()
    const stmts = Array.from({ length: 148 }, (_, i) => ({
      sql: 'INSERT INTO people (id, event_id, name, name_key, token_hash, is_organiser, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)',
      args: [`fill${String(i).padStart(6, '0')}`, r.id, `Filler ${i}`, `filler ${i}`, hashSecret(`${r.id}-${i}`), now, now],
    }))
    await db.batch(stmts, 'write')
    await joinEvent(r.id, { name: 'Number 150', answers: [] })
    const before = await getEventVersion(r.id)
    const p = joinEvent(r.id, { name: 'Number 151', answers: [{ optionId: r.state.options[0].id, value: 'free' }] })
    await expectCode(p, 'event_full')
    await p.catch((e: HangsError) => expect(e.message).toBe("This one's full (150 people). Tell Ethan."))
    expect(await getEventVersion(r.id)).toBe(before)
    const count = await db.execute({ sql: 'SELECT COUNT(*) AS n FROM people WHERE event_id = ?', args: [r.id] })
    expect(Number(count.rows[0].n)).toBe(150)
  })

  it('404s for an unknown event', async () => {
    await expectCode(joinEvent('zzzzzzzzzz', { name: 'Sam', answers: [] }), 'not_found')
  })
})

describe('saveAnswers', () => {
  it('upserts, clears with null, skips unknown and past options, bumps the version', async () => {
    const r = await make({ dates: [future(1), future(3)] })
    const other = await make()
    const [a, b] = r.state.options
    const j = await joinOk(r.id, { name: 'Sam', answers: [] })
    const ctx = await authorizePerson(r.id, { personToken: j.personToken })
    const auth = { personToken: j.personToken }

    let res = await saveAnswers(ctx, [{ optionId: a.id, value: 'free' }, { optionId: b.id, value: 'maybe' }, { optionId: other.state.options[0].id, value: 'free' }], auth)
    expect(res.skippedOptionIds).toEqual([other.state.options[0].id])
    expect(res.state.people.find(p => p.id === j.personId)?.answers).toEqual({ [a.id]: 'free', [b.id]: 'maybe' })
    expect(res.state.event.version).toBe(3)

    res = await saveAnswers(ctx, [{ optionId: a.id, value: 'cant' }, { optionId: b.id, value: null }], auth)
    expect(res.state.people.find(p => p.id === j.personId)?.answers).toEqual({ [a.id]: 'cant' })
    expect(res.state.event.version).toBe(4)

    // Two days later, option a (tomorrow) is in the past and is never written; b is still ahead at any time of day.
    setClockForTests(() => Date.now() + 2 * 86_400_000)
    res = await saveAnswers(ctx, [{ optionId: a.id, value: 'free' }, { optionId: b.id, value: 'free' }], auth)
    expect(res.skippedOptionIds).toEqual([a.id])
    expect(res.state.people.find(p => p.id === j.personId)?.answers).toEqual({ [a.id]: 'cant', [b.id]: 'free' })
  })

  it('authorizePerson rejects unknown tokens and tokens from another event', async () => {
    const r1 = await make()
    const r2 = await make()
    const j = await joinOk(r1.id, { name: 'Sam', answers: [] })
    await expectCode(authorizePerson(r2.id, { personToken: j.personToken }), 'unauthorized')
    await expectCode(authorizePerson(r1.id, { personToken: 'nope' }), 'unauthorized')
    await expectCode(authorizePerson(r1.id, { organiserKey: r2.organiserKey }), 'unauthorized')
    await expectCode(authorizePerson('zzzzzzzzzz', { personToken: j.personToken }), 'not_found')
    await expectCode(authorizeOrganiser(r1.id, { organiserKey: r2.organiserKey }), 'forbidden')
    await expectCode(authorizeOrganiser(r1.id, {}), 'forbidden')
  })
})

describe('renamePerson / patchEvent', () => {
  it('renames, maps collisions to name_taken, and bumps', async () => {
    const r = await make()
    const sam = await joinEvent(r.id, { name: 'Sam', answers: [] })
    await joinEvent(r.id, { name: 'Ana', answers: [] })
    const ctx = await authorizePerson(r.id, { personToken: sam.personToken })
    const s = await renamePerson(ctx, 'Sam B', { personToken: sam.personToken })
    expect(s.viewer.name).toBe('Sam B')
    await expectCode(renamePerson(ctx, 'ANA', {}), 'name_taken')
    const same = await renamePerson(ctx, 'sam b', {})
    expect(same.people.find(p => p.id === sam.personId)?.name).toBe('sam b')
  })

  it('patches title and note', async () => {
    const r = await make()
    const octx = await authorizeOrganiser(r.id, { organiserKey: r.organiserKey })
    const s = await patchEvent(octx, { note: '' }, {})
    expect(s.event).toMatchObject({ title: 'Picnic at mine', note: '', version: 2 })
    const s2 = await patchEvent(octx, { title: 'BBQ' }, {})
    expect(s2.event).toMatchObject({ title: 'BBQ', note: '', version: 3 })
  })
})

describe('setEventDates', () => {
  it('adds and removes dates, dropping answers for removed dates', async () => {
    const d = futureDates(3)
    const r = await make({ dates: d })
    const j = await joinOk(r.id, { name: 'Sam', answers: r.state.options.map(o => ({ optionId: o.id, value: 'free' as const })) })
    const octx = await authorizeOrganiser(r.id, { organiserKey: r.organiserKey })
    const s = await setEventDates(octx, [d[0], d[2], future(10)], {})
    expect(s.options.map(o => o.date)).toEqual([d[0], d[2], future(10)])
    expect(Object.keys(s.people.find(p => p.id === j.personId)!.answers)).toHaveLength(2)
    const orphan = await db.execute({ sql: 'SELECT COUNT(*) AS n FROM answers WHERE event_id = ? AND option_id NOT IN (SELECT id FROM event_options)', args: [r.id] })
    expect(Number(orphan.rows[0].n)).toBe(0)
    expect(s.event.version).toBe(3)
  })

  it('enforces the parts-mode cap (20 dates) and past/locked rules', async () => {
    const r = await make({ mode: 'parts', dates: futureDates(18) })
    const octx = await authorizeOrganiser(r.id, { organiserKey: r.organiserKey })
    await expectCode(setEventDates(octx, futureDates(21), {}), 'too_many_options')
    await expect(setEventDates(octx, futureDates(20), {})).resolves.toBeTruthy()
    await expectCode(setEventDates(octx, [...futureDates(5), future(-1)], {}), 'bad_request')

    const locked = await lockEvent(octx, { optionId: r.state.options[0].id, time: null, place: '' }, {})
    const lockedDate = locked.event.lock!.date
    const fresh = await authorizeOrganiser(r.id, { organiserKey: r.organiserKey })
    await expectCode(setEventDates(fresh, futureDates(3, 30), {}), 'locked_option')
    await expect(setEventDates(fresh, [lockedDate, future(30)], {})).resolves.toBeTruthy()
  })

  it('keeps existing past dates but refuses new past ones', async () => {
    const d = [future(1), future(5)]
    const r = await make({ dates: d })
    setClockForTests(() => Date.now() + 3 * 86_400_000)
    const octx = await authorizeOrganiser(r.id, { organiserKey: r.organiserKey })
    const s = await setEventDates(octx, [d[0], d[1], future(6)], {})
    expect(s.options.map(o => o.date)).toEqual([d[0], d[1], future(6)])
    await expectCode(setEventDates(octx, [d[1], future(2)], {}), 'bad_request')
  })
})

describe('removePerson', () => {
  it('removes a guest and their answers, never the organiser, and only within the event', async () => {
    const r = await make()
    const other = await make()
    const j = await joinOk(r.id, { name: 'Sam', answers: [{ optionId: r.state.options[0].id, value: 'free' }] })
    const stranger = await joinEvent(other.id, { name: 'Zed', answers: [] })
    const octx = await authorizeOrganiser(r.id, { organiserKey: r.organiserKey })
    await expectCode(removePerson(octx, r.personId, {}), 'cannot_remove_organiser')
    await expectCode(removePerson(octx, stranger.personId, {}), 'not_found')
    const s = await removePerson(octx, j.personId, {})
    expect(s.people.map(p => p.id)).toEqual([r.personId])
    const left = await db.execute({ sql: 'SELECT COUNT(*) AS n FROM answers WHERE person_id = ?', args: [j.personId] })
    expect(Number(left.rows[0].n)).toBe(0)
    const still = await getEventState(other.id, {})
    expect(still?.people.some(p => p.id === stranger.personId)).toBe(true)
    // The removed person's token no longer works.
    await expectCode(authorizePerson(r.id, { personToken: j.personToken }), 'unauthorized')
  })
})

describe('lock / unlock', () => {
  it('locks, updates, unlocks and keeps answers; checks option ownership', async () => {
    const r = await make()
    const other = await make()
    const [a, b] = r.state.options
    await joinEvent(r.id, { name: 'Sam', answers: [{ optionId: a.id, value: 'free' }, { optionId: b.id, value: 'maybe' }] })
    await joinEvent(r.id, { name: 'Ana', answers: [] })
    const octx = await authorizeOrganiser(r.id, { organiserKey: r.organiserKey })
    await expectCode(lockEvent(octx, { optionId: other.state.options[0].id, time: null, place: '' }, {}), 'bad_request')
    await expectCode(unlockEvent(octx, {}), 'not_locked')

    const s = await lockEvent(octx, { optionId: a.id, time: '13:30', place: 'My place' }, {})
    expect(s.event.lock).toMatchObject({ optionId: a.id, date: a.date, part: 'day', time: '13:30', place: 'My place' })
    expect(s.attendance?.free).toHaveLength(1)
    expect(s.attendance?.none).toHaveLength(2)

    const summary = await getEventSummary(r.id)
    expect(summary?.lock).toMatchObject({ timeLabel: '1:30pm', place: 'My place', going: 1, maybe: 0 })

    const octx2 = await authorizeOrganiser(r.id, { organiserKey: r.organiserKey })
    const moved = await lockEvent(octx2, { optionId: b.id, time: null, place: '' }, {})
    expect(moved.event.lock).toMatchObject({ optionId: b.id, time: null, place: '' })
    expect(moved.attendance?.maybe).toHaveLength(1)

    const octx3 = await authorizeOrganiser(r.id, { organiserKey: r.organiserKey })
    const un = await unlockEvent(octx3, {})
    expect(un.event.lock).toBeNull()
    expect(un.attendance).toBeNull()
    expect(un.ranking.respondentCount).toBe(1)
  })

  it('refuses a new past option but allows re-saving the locked past one', async () => {
    const r = await make({ dates: [future(1), future(5)] })
    const [a, , ] = r.state.options
    const octx = await authorizeOrganiser(r.id, { organiserKey: r.organiserKey })
    await lockEvent(octx, { optionId: a.id, time: null, place: '' }, {})
    setClockForTests(() => Date.now() + 3 * 86_400_000)
    const octx2 = await authorizeOrganiser(r.id, { organiserKey: r.organiserKey })
    await expect(lockEvent(octx2, { optionId: a.id, time: '10:00', place: '' }, {})).resolves.toBeTruthy()
    await expectCode(unlockEvent(await authorizeOrganiser(r.id, { organiserKey: r.organiserKey }), {}).then(async () => {
      const o = await authorizeOrganiser(r.id, { organiserKey: r.organiserKey })
      return lockEvent(o, { optionId: a.id, time: null, place: '' }, {})
    }), 'bad_request')
  })
})

describe('version', () => {
  it('bumps on every mutation', async () => {
    const r = await make()
    const v = async () => (await getEventVersion(r.id))!
    const seen = [await v()]
    const j = await joinOk(r.id, { name: 'Sam', answers: [] }); seen.push(await v())
    const pctx = await authorizePerson(r.id, { personToken: j.personToken })
    await saveAnswers(pctx, [{ optionId: r.state.options[0].id, value: 'free' }], {}); seen.push(await v())
    await renamePerson(pctx, 'Sammy', {}); seen.push(await v())
    const o = () => authorizeOrganiser(r.id, { organiserKey: r.organiserKey })
    await patchEvent(await o(), { title: 'New' }, {}); seen.push(await v())
    await setEventDates(await o(), [...r.state.options.map(x => x.date), future(20)], {}); seen.push(await v())
    await lockEvent(await o(), { optionId: r.state.options[0].id, time: null, place: '' }, {}); seen.push(await v())
    await unlockEvent(await o(), {}); seen.push(await v())
    await removePerson(await o(), j.personId, {}); seen.push(await v())
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
})

describe('races and partial failures', () => {
  it('a date edit that read "unlocked" cannot delete a day locked in the meantime (locked_option)', async () => {
    const r = await make({ dates: futureDates(3) })
    const stale = await authorizeOrganiser(r.id, { organiserKey: r.organiserKey })
    const locked = r.state.options[1]
    await lockEvent(await authorizeOrganiser(r.id, { organiserKey: r.organiserKey }), { optionId: locked.id, time: null, place: '' }, {})
    await expectCode(setEventDates(stale, [r.state.options[0].date], {}), 'locked_option')
    const s = (await getEventState(r.id, {}))!
    expect(s.event.lock?.optionId).toBe(locked.id)
    expect(s.options).toHaveLength(3)
    // Removing a different day with the same stale context still works.
    await expect(setEventDates(stale, [r.state.options[1].date, r.state.options[2].date], {})).resolves.toBeTruthy()
  })

  it('locking an option a concurrent date edit just removed is bad_request, never a dangling lock', async () => {
    const r = await make({ dates: futureDates(2) })
    const [a, b] = r.state.options
    await setEventDates(await authorizeOrganiser(r.id, { organiserKey: r.organiserKey }), [a.date], {})
    await expectCode(lockEvent(await authorizeOrganiser(r.id, { organiserKey: r.organiserKey }), { optionId: b.id, time: null, place: '' }, {}), 'bad_request')
    const rows = await db.execute({ sql: 'SELECT locked_option_id, locked_at FROM events WHERE id = ?', args: [r.id] })
    expect(rows.rows[0].locked_option_id).toBeNull()
    expect(rows.rows[0].locked_at).toBeNull()
  })

  it('saveAnswers and renamePerson for a person removed after authorisation write nothing and are unauthorized', async () => {
    const r = await make()
    const j = await joinOk(r.id, { name: 'Sam', answers: [] })
    const pctx = await authorizePerson(r.id, { personToken: j.personToken })
    await removePerson(await authorizeOrganiser(r.id, { organiserKey: r.organiserKey }), j.personId, {})
    const version = await getEventVersion(r.id)
    await expectCode(saveAnswers(pctx, [{ optionId: r.state.options[0].id, value: 'free' }], {}), 'unauthorized')
    await expectCode(renamePerson(pctx, 'Ghost', {}), 'unauthorized')
    const orphans = await db.execute({ sql: 'SELECT COUNT(*) AS n FROM answers WHERE person_id = ?', args: [j.personId] })
    expect(Number(orphans.rows[0].n)).toBe(0)
    expect(await getEventVersion(r.id)).toBe(version)
  })

  it('create and join read their state inside the write transaction, so a later read failure cannot lose a secret', async () => {
    const r = await make()
    const real = db
    // Read-only batches fail; write batches go through. Create and join never need a separate read after writing.
    const flaky = new Proxy(real, {
      get(target, prop, recv) {
        if (prop === 'batch') {
          return (stmts: Parameters<Client['batch']>[0], mode?: Parameters<Client['batch']>[1]) =>
            mode === 'read' ? Promise.reject(new Error('network blip')) : target.batch(stmts, mode)
        }
        const v = Reflect.get(target, prop, recv)
        return typeof v === 'function' ? v.bind(target) : v
      },
    })
    const ctx = await prepareJoin(r.id)
    setDbForTests(flaky)
    try {
      const j = await joinEvent(ctx, { name: 'Sam', answers: [{ optionId: r.state.options[0].id, value: 'free' }] })
      expect(j.personToken).toHaveLength(43)
      expect(j.state?.viewer).toMatchObject({ personId: j.personId, name: 'Sam' })
      const c = await createEvent({ title: 'Again', note: '', organiserName: 'Ethan', mode: 'days', dates: futureDates(1), tz: 'Australia/Sydney' })
      expect(c.organiserKey).toHaveLength(43)
      expect(c.state?.viewer).toMatchObject({ personId: c.personId, isOrganiser: true })
    } finally {
      setDbForTests(real)
    }
    const s = (await getEventState(r.id, {}))!
    expect(s.people.map(p => p.name)).toContain('Sam')
  })
})
