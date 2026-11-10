// Server-only event repository: reads EventState, authorises people/organisers, and runs every mutation as two
// round trips at most: one preflight batch (rate limits, event row, identity rows, options) and one write batch that
// bumps events.version (the etag) and reads the new state back in the same transaction. Ownership is scoped by event_id.
import 'server-only'
import type { Client, InStatement, ResultSet, Row } from '@libsql/client'
import { cache } from 'react'
import { addDays, todayIn } from './dates'
import { getDb, measureDb, serverTimingValue } from './db'
import { HangsError, mapDbError } from './errors'
import { formatOption, formatTime } from './format'
import { newEventId, newOptionId, newPersonId } from './ids'
import type { LimitCheck } from './ratelimit'
import { nameKey, type CreateEventInputT, type LockInputT, type PatchEventInputT } from './schemas'
import { deriveState, etagFor } from './state'
import { hashSecret, newSecret, secretsEqual } from './tokens'
import type {
  AnswerUpdate, AnswerValue, CreateEventResponse, DayPart, EventCore, EventInfo, EventMode, EventState,
  EventSummary, JoinResponse, SaveAnswersResponse,
} from './types'

export const MAX_PEOPLE = 150
export const MAX_OPTIONS = 62
export const MAX_DAYS_AHEAD = 366
const PARTS: DayPart[] = ['morning', 'afternoon', 'evening']

export interface AuthInput { personToken?: string | null; organiserKey?: string | null }

let clock: () => number = () => Date.now()
// Test hook: lets tests move "now" (e.g. to make options past).
export function setClockForTests(fn: (() => number) | null): void {
  clock = fn ?? (() => Date.now())
}

const conn = (): Client => getDb()

export { nameKey }

const todayFor = (tz: string) => todayIn(tz, new Date(clock()))

const tooManyMessage = (mode: EventMode) =>
  mode === 'parts' ? "That's the max with parts of the day: 20 days." : "That's the max: 62 days."

interface EventRow {
  id: string; title: string; note: string; mode: EventMode; tz: string; organiserKeyHash: string
  lockedOptionId: string | null; lockedTime: string | null; lockedPlace: string; lockedAt: number | null
  version: number; createdAt: number; updatedAt: number
}

interface OptionRow { id: string; date: string }

function toEventRow(r: Row): EventRow {
  return {
    id: String(r.id), title: String(r.title), note: String(r.note ?? ''), mode: r.mode === 'parts' ? 'parts' : 'days',
    tz: String(r.tz), organiserKeyHash: String(r.organiser_key_hash),
    lockedOptionId: r.locked_option_id == null ? null : String(r.locked_option_id),
    lockedTime: r.locked_time == null ? null : String(r.locked_time),
    lockedPlace: String(r.locked_place ?? ''),
    lockedAt: r.locked_at == null ? null : Number(r.locked_at),
    version: Number(r.version), createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
  }
}

const organiserKeyMatches = (ev: EventRow, key: string | null | undefined) =>
  !!key && secretsEqual(hashSecret(key), ev.organiserKeyHash)

const bump = (id: string, now: number): InStatement => ({
  sql: 'UPDATE events SET version = version + 1, updated_at = ? WHERE id = ?',
  args: [now, id],
})

// Version bump that only happens while the person row still exists (0 rows affected = they were removed).
const personBump = (id: string, personId: string, now: number): InStatement => ({
  sql: 'UPDATE events SET version = version + 1, updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM people WHERE id = ? AND event_id = ?)',
  args: [now, id, personId, id],
})

function upsertAnswer(personId: string, optionId: string, eventId: string, value: AnswerValue, now: number, today: string, guardPerson: boolean): InStatement {
  return {
    sql: `INSERT INTO answers (person_id, option_id, event_id, value, updated_at)
      SELECT ?, id, event_id, ?, ? FROM event_options
      WHERE id = ? AND event_id = ? AND date >= ?${guardPerson ? ' AND EXISTS (SELECT 1 FROM people WHERE id = ?)' : ''}
      ON CONFLICT(person_id, option_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    args: guardPerson
      ? [personId, value, now, optionId, eventId, today, personId]
      : [personId, value, now, optionId, eventId, today],
  }
}

function dedupeAnswers(answers: AnswerUpdate[]): AnswerUpdate[] {
  const m = new Map<string, AnswerUpdate['value']>()
  for (const a of answers) m.set(a.optionId, a.value)
  return [...m].map(([optionId, value]) => ({ optionId, value }))
}

// ---------- state reads ----------

// The statements behind an EventState. With `unlessVersion`, every statement except the event row returns nothing
// when the stored version equals it (SQLite evaluates the constant guard once), so an unchanged poll stays cheap.
function stateStatements(id: string, auth: AuthInput, unlessVersion?: number): InStatement[] {
  const guarded = unlessVersion !== undefined
  const g = guarded ? ' AND NOT EXISTS (SELECT 1 FROM events WHERE id = ? AND version = ?)' : ''
  const ga = (args: (string | number)[]) => (guarded ? [...args, id, unlessVersion] : args)
  const stmts: InStatement[] = [
    { sql: 'SELECT * FROM events WHERE id = ?', args: [id] },
    { sql: `SELECT id, date, part FROM event_options WHERE event_id = ?${g}`, args: ga([id]) },
    { sql: `SELECT id, name, is_organiser FROM people WHERE event_id = ?${g} ORDER BY is_organiser DESC, created_at ASC, rowid ASC`, args: ga([id]) },
    { sql: `SELECT person_id, option_id, value FROM answers WHERE event_id = ?${g}`, args: ga([id]) },
  ]
  if (auth.personToken) {
    stmts.push({ sql: `SELECT id FROM people WHERE token_hash = ? AND event_id = ?${g}`, args: ga([hashSecret(auth.personToken), id]) })
  }
  return stmts
}

function stateFromResults(rs: ResultSet[], auth: AuthInput): EventState | null {
  const [evRs, optRs, peopleRs, ansRs, tokenRs] = rs
  if (!evRs.rows[0]) return null
  const ev = toEventRow(evRs.rows[0])

  const options = optRs.rows.map(r => ({ id: String(r.id), kind: 'date' as const, date: String(r.date), part: String(r.part) as DayPart }))
  const answersByPerson = new Map<string, Record<string, AnswerValue>>()
  for (const r of ansRs.rows) {
    const pid = String(r.person_id)
    const rec = answersByPerson.get(pid) ?? {}
    rec[String(r.option_id)] = String(r.value) as AnswerValue
    answersByPerson.set(pid, rec)
  }
  const people = peopleRs.rows.map(r => ({
    id: String(r.id), name: String(r.name), isOrganiser: Number(r.is_organiser) === 1,
    answers: answersByPerson.get(String(r.id)) ?? {},
  }))
  const organiser = people.find(p => p.isOrganiser)
  const lockedOption = ev.lockedOptionId ? options.find(o => o.id === ev.lockedOptionId) : undefined

  const event: EventInfo = {
    id: ev.id, title: ev.title, note: ev.note, mode: ev.mode, tz: ev.tz,
    organiserName: organiser?.name ?? 'the organiser', organiserPersonId: organiser?.id ?? '',
    version: ev.version, createdAt: ev.createdAt, updatedAt: ev.updatedAt,
    lock: lockedOption
      ? { optionId: lockedOption.id, date: lockedOption.date, part: lockedOption.part, time: ev.lockedTime, place: ev.lockedPlace, lockedAt: ev.lockedAt ?? ev.updatedAt }
      : null,
  }

  let personId: string | null = tokenRs?.rows[0] ? String(tokenRs.rows[0].id) : null
  const personTokenRejected = !!auth.personToken && !personId
  const isOrganiser = organiserKeyMatches(ev, auth.organiserKey)
  const organiserKeyRejected = !!auth.organiserKey && !isOrganiser
  if (!personId && isOrganiser && organiser) personId = organiser.id

  const core: EventCore = { event, options, people }
  return deriveState(core, { personId, isOrganiser, personTokenRejected, organiserKeyRejected }, todayFor(ev.tz))
}

// One read batch (one round trip).
export async function getEventState(id: string, auth: AuthInput): Promise<EventState | null> {
  return stateFromResults(await conn().batch(stateStatements(id, auth), 'read'), auth)
}

export type ConditionalState =
  | { kind: 'missing' }
  | { kind: 'unchanged'; etag: string }   // stored version equals the known one; etag is the current one
  | { kind: 'changed'; state: EventState }

// For If-None-Match: one round trip whether or not anything changed. Unchanged returns only the event row.
export async function getEventStateIfChanged(id: string, auth: AuthInput, knownVersion: number): Promise<ConditionalState> {
  const rs = await conn().batch(stateStatements(id, auth, knownVersion), 'read')
  const row = rs[0].rows[0]
  if (!row) return { kind: 'missing' }
  const ev = toEventRow(row)
  if (ev.version === knownVersion) return { kind: 'unchanged', etag: etagFor(ev.version, todayFor(ev.tz)) }
  const state = stateFromResults(rs, auth)
  return state ? { kind: 'changed', state } : { kind: 'missing' }
}

export async function getEventVersion(id: string): Promise<number | null> {
  const rs = await conn().execute({ sql: 'SELECT version FROM events WHERE id = ?', args: [id] })
  return rs.rows[0] ? Number(rs.rows[0].version) : null
}

// One public read per request, shared by page and generateMetadata (React cache). Its database time is logged,
// because a page response cannot carry a Server-Timing header.
export const loadPublicEvent = cache(async (id: string) => {
  const { value, timing } = await measureDb(() => getEventState(id, {}))
  if (process.env.NODE_ENV === 'production') console.info(`[hangs:timing] page /h/[id] ${serverTimingValue(timing)}`)
  return value
})

export async function getEventSummary(id: string): Promise<EventSummary | null> {
  const s = await loadPublicEvent(id)
  return s ? summarizeEvent(s) : null
}

// The link-preview summary of a loaded public state (no database access).
export function summarizeEvent(s: EventState): EventSummary {
  const optionDates = [...new Set(s.options.map(o => o.date))]
  const hero = s.ranking.hero
  const top = s.ranking.ranked.find(o => o.optionId === hero.optionIds[0])
  const leading = (hero.kind === 'winner' || hero.kind === 'everyone') && top
    ? { label: formatOption(top, { today: s.today }), free: top.free }
    : null
  const lock = s.event.lock
  return {
    id: s.event.id, version: s.event.version, title: s.event.title, note: s.event.note,
    organiserName: s.event.organiserName, mode: s.event.mode, optionDates,
    respondentCount: s.ranking.respondentCount,
    leading,
    lock: lock
      ? {
          label: formatOption(lock, { today: s.today }),
          timeLabel: lock.time ? formatTime(lock.time) : null,
          place: lock.place,
          going: s.attendance?.free.length ?? 0,
          maybe: s.attendance?.maybe.length ?? 0,
          lockedAt: lock.lockedAt,
        }
      : null,
  }
}

// Runs the write statements and reads the resulting state in the same transaction: one round trip, a consistent
// snapshot, and no "committed but the read-back failed" case.
async function commitAndRead(stmts: InStatement[], id: string, auth: AuthInput): Promise<{ rs: ResultSet[]; state: EventState }> {
  const all = await conn().batch([...stmts, ...stateStatements(id, auth)], 'write')
  const state = stateFromResults(all.slice(stmts.length), auth)
  if (!state) throw new HangsError('not_found')
  return { rs: all.slice(0, stmts.length), state }
}

// ---------- preflight + authorisation ----------

export interface PreflightOpts { limits?: LimitCheck }

interface Preflight {
  event: EventRow
  organiser: { id: string; name: string } | null
  options: OptionRow[]
  tokenPerson: { id: string; isOrganiser: boolean } | null
}

// One batch: the rate-limit upserts (when given; this makes it a write batch), the event row, the organiser row, the
// event's options and the person-token row. Throws 429 / not_found in the limiter's order.
async function preflight(id: string, auth: AuthInput, opts: PreflightOpts = {}): Promise<Preflight> {
  const limit = opts.limits?.statements ?? []
  const stmts: InStatement[] = [
    ...limit,
    { sql: 'SELECT * FROM events WHERE id = ?', args: [id] },
    { sql: 'SELECT id, name FROM people WHERE event_id = ? AND is_organiser = 1 LIMIT 1', args: [id] },
    { sql: 'SELECT id, date FROM event_options WHERE event_id = ?', args: [id] },
  ]
  if (auth.personToken) {
    stmts.push({ sql: 'SELECT id, is_organiser FROM people WHERE token_hash = ? AND event_id = ?', args: [hashSecret(auth.personToken), id] })
  }
  const rs = await conn().batch(stmts, opts.limits ? 'write' : 'read')
  const [evRs, orgRs, optRs, tokenRs] = rs.slice(limit.length)
  const evRow = evRs.rows[0]
  opts.limits?.evaluate(rs.slice(0, limit.length), !!evRow)
  if (!evRow) throw new HangsError('not_found')
  const org = orgRs.rows[0]
  const tok = tokenRs?.rows[0]
  return {
    event: toEventRow(evRow),
    organiser: org ? { id: String(org.id), name: String(org.name) } : null,
    options: optRs.rows.map(r => ({ id: String(r.id), date: String(r.date) })),
    tokenPerson: tok ? { id: String(tok.id), isOrganiser: Number(tok.is_organiser) === 1 } : null,
  }
}

interface BaseCtx { event: EventRow; organiserName: string; options: OptionRow[] }
export type OrganiserCtx = BaseCtx
export interface PersonCtx extends BaseCtx { personId: string; isOrganiser: boolean }
export type JoinCtx = BaseCtx

const baseCtx = (p: Preflight): BaseCtx => ({ event: p.event, organiserName: p.organiser?.name ?? 'the organiser', options: p.options })

export async function authorizeOrganiser(id: string, auth: AuthInput, opts: PreflightOpts = {}): Promise<OrganiserCtx> {
  const p = await preflight(id, { organiserKey: auth.organiserKey }, opts)
  if (!organiserKeyMatches(p.event, auth.organiserKey)) throw new HangsError('forbidden')
  return baseCtx(p)
}

// A valid person token wins; otherwise a valid organiser key resolves to the organiser's own row.
export async function authorizePerson(id: string, auth: AuthInput, opts: PreflightOpts = {}): Promise<PersonCtx> {
  const p = await preflight(id, auth, opts)
  if (p.tokenPerson) return { ...baseCtx(p), personId: p.tokenPerson.id, isOrganiser: p.tokenPerson.isOrganiser }
  if (organiserKeyMatches(p.event, auth.organiserKey) && p.organiser) {
    return { ...baseCtx(p), personId: p.organiser.id, isOrganiser: true }
  }
  throw new HangsError('unauthorized')
}

// Joining needs no credentials: just the limits, the event (404) and the organiser's name for error messages.
export async function prepareJoin(id: string, opts: PreflightOpts = {}): Promise<JoinCtx> {
  return baseCtx(await preflight(id, {}, opts))
}

// ---------- mutations ----------

export async function createEvent(input: CreateEventInputT): Promise<CreateEventResponse> {
  const now = clock()
  const today = todayFor(input.tz)
  const max = addDays(today, MAX_DAYS_AHEAD)
  for (const d of input.dates) {
    if (d < today || d > max) throw new HangsError('bad_request', 'Pick days from today up to a year ahead.')
  }
  const parts: DayPart[] = input.mode === 'parts' ? PARTS : ['day']
  if (input.dates.length * parts.length > MAX_OPTIONS) throw new HangsError('too_many_options', tooManyMessage(input.mode))

  const id = newEventId()
  const organiserKey = newSecret()
  const personToken = newSecret()
  const personId = newPersonId()
  const stmts: InStatement[] = [
    {
      sql: `INSERT INTO events (id, title, note, mode, tz, organiser_key_hash, locked_place, version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, '', 1, ?, ?)`,
      args: [id, input.title, input.note, input.mode, input.tz, hashSecret(organiserKey), now, now],
    },
    {
      sql: `INSERT INTO people (id, event_id, name, name_key, token_hash, is_organiser, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      args: [personId, id, input.organiserName, nameKey(input.organiserName), hashSecret(personToken), now, now],
    },
  ]
  for (const date of [...input.dates].sort()) {
    for (const part of parts) {
      stmts.push({
        sql: 'INSERT INTO event_options (id, event_id, kind, date, part, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        args: [newOptionId(), id, 'date', date, part, now],
      })
    }
  }
  const { state } = await commitAndRead(stmts, id, { personToken, organiserKey })
  return { id, organiserKey, personToken, personId, state }
}

export async function joinEvent(target: string | JoinCtx, input: { name: string; answers: AnswerUpdate[] }, auth: AuthInput = {}): Promise<JoinResponse> {
  const ctx = typeof target === 'string' ? await prepareJoin(target) : target
  const id = ctx.event.id
  const now = clock()
  const today = todayFor(ctx.event.tz)
  const personId = newPersonId()
  const personToken = newSecret()
  const answers = dedupeAnswers(input.answers).filter((a): a is { optionId: string; value: AnswerValue } => a.value !== null)

  const stmts: InStatement[] = [
    {
      sql: `INSERT INTO people (id, event_id, name, name_key, token_hash, is_organiser, created_at, updated_at)
        SELECT ?, ?, ?, ?, ?, 0, ?, ? WHERE (SELECT COUNT(*) FROM people WHERE event_id = ?) < ?`,
      args: [personId, id, input.name, nameKey(input.name), hashSecret(personToken), now, now, id, MAX_PEOPLE],
    },
    ...answers.map(a => upsertAnswer(personId, a.optionId, id, a.value, now, today, true)),
    {
      sql: 'UPDATE events SET version = version + 1, updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM people WHERE id = ?)',
      args: [now, id, personId],
    },
  ]
  let result
  try {
    result = await commitAndRead(stmts, id, { personToken, organiserKey: auth.organiserKey })
  } catch (e) {
    throw mapDbError(e, { name: input.name, organiserName: ctx.organiserName }) ?? e
  }
  if (result.rs[0].rowsAffected === 0) throw new HangsError('event_full', `This one's full (150 people). Tell ${ctx.organiserName}.`)
  return { personId, personToken, state: result.state }
}

export async function saveAnswers(ctx: PersonCtx, updates: AnswerUpdate[], auth: AuthInput): Promise<SaveAnswersResponse> {
  const id = ctx.event.id
  const now = clock()
  const today = todayFor(ctx.event.tz)
  // Valid = an option of this event, today or later (from the preflight; the guarded writes re-check it).
  const valid = new Set(ctx.options.filter(o => o.date >= today).map(o => o.id))

  const skipped: string[] = []
  const stmts: InStatement[] = []
  const upsertIds: Array<string | null> = []
  for (const a of dedupeAnswers(updates)) {
    if (!valid.has(a.optionId)) { skipped.push(a.optionId); continue }
    if (a.value === null) {
      stmts.push({ sql: 'DELETE FROM answers WHERE person_id = ? AND option_id = ? AND event_id = ?', args: [ctx.personId, a.optionId, id] })
      upsertIds.push(null)
    } else {
      // Guarded on the person still existing: an organiser may remove them between authorisation and this write.
      stmts.push(upsertAnswer(ctx.personId, a.optionId, id, a.value, now, today, true))
      upsertIds.push(a.optionId)
    }
  }
  if (stmts.length === 0) {
    const state = await getEventState(id, auth)
    if (!state) throw new HangsError('not_found')
    return { state, skippedOptionIds: skipped }
  }
  stmts.push(personBump(id, ctx.personId, now))
  const { rs, state } = await commitAndRead(stmts, id, auth)
  if (rs[rs.length - 1].rowsAffected === 0) throw new HangsError('unauthorized')
  upsertIds.forEach((optionId, i) => { if (optionId && rs[i].rowsAffected === 0) skipped.push(optionId) })
  return { state, skippedOptionIds: skipped }
}

export async function renamePerson(ctx: PersonCtx, name: string, auth: AuthInput): Promise<EventState> {
  const id = ctx.event.id
  const now = clock()
  let result
  try {
    result = await commitAndRead([
      { sql: 'UPDATE people SET name = ?, name_key = ?, updated_at = ? WHERE id = ? AND event_id = ?', args: [name, nameKey(name), now, ctx.personId, id] },
      personBump(id, ctx.personId, now),
    ], id, auth)
  } catch (e) {
    throw mapDbError(e, { name, organiserName: ctx.organiserName }) ?? e
  }
  if (result.rs[0].rowsAffected === 0) throw new HangsError('unauthorized')
  return result.state
}

export async function patchEvent(ctx: OrganiserCtx, patch: PatchEventInputT, auth: AuthInput): Promise<EventState> {
  const { state } = await commitAndRead([{
    sql: 'UPDATE events SET title = COALESCE(?, title), note = COALESCE(?, note), version = version + 1, updated_at = ? WHERE id = ?',
    args: [patch.title ?? null, patch.note ?? null, clock(), ctx.event.id],
  }], ctx.event.id, auth)
  return state
}

// Sets the full desired set of candidate dates; adds/removes options (and their answers) in one transaction.
export async function setEventDates(ctx: OrganiserCtx, dates: string[], auth: AuthInput): Promise<EventState> {
  const ev = ctx.event
  const id = ev.id
  const now = clock()
  const today = todayFor(ev.tz)
  const max = addDays(today, MAX_DAYS_AHEAD)
  const existing = ctx.options
  const existingDates = new Set(existing.map(o => o.date))
  const desired = new Set(dates)
  if (desired.size === 0) throw new HangsError('last_option')

  const toAdd = [...desired].filter(d => !existingDates.has(d)).sort()
  const toRemove = [...existingDates].filter(d => !desired.has(d))
  for (const d of toAdd) {
    if (d < today) throw new HangsError('bad_request', "New days can't be in the past.")
    if (d > max) throw new HangsError('bad_request', 'Pick days up to a year ahead.')
  }
  if (ev.lockedOptionId) {
    const locked = existing.find(o => o.id === ev.lockedOptionId)
    if (locked && toRemove.includes(locked.date)) throw new HangsError('locked_option')
  }
  const parts: DayPart[] = ev.mode === 'parts' ? PARTS : ['day']
  const kept = existing.filter(o => desired.has(o.date)).length
  if (kept + toAdd.length * parts.length > MAX_OPTIONS) throw new HangsError('too_many_options', tooManyMessage(ev.mode))
  if (kept + toAdd.length === 0) throw new HangsError('last_option')

  const stmts: InStatement[] = []
  if (toRemove.length > 0) {
    // In-transaction lock guard (the lock may have changed since ctx was read): a NULL part violates NOT NULL and
    // rolls the batch back when a removed date holds the currently locked option.
    stmts.push({
      sql: `INSERT INTO event_options (id, event_id, kind, date, part, created_at)
        SELECT 'lockcheck', ?, 'date', '0000-00-00', NULL, 0 WHERE EXISTS (
          SELECT 1 FROM events e JOIN event_options o ON o.id = e.locked_option_id
          WHERE e.id = ? AND o.event_id = ? AND o.date IN (${toRemove.map(() => '?').join(', ')})
        )`,
      args: [id, id, id, ...toRemove],
    })
  }
  for (const d of toRemove) {
    stmts.push({
      sql: 'DELETE FROM answers WHERE event_id = ? AND option_id IN (SELECT id FROM event_options WHERE event_id = ? AND date = ?)',
      args: [id, id, d],
    })
    stmts.push({ sql: 'DELETE FROM event_options WHERE event_id = ? AND date = ?', args: [id, d] })
  }
  for (const d of toAdd) {
    for (const part of parts) {
      // OR IGNORE: a concurrent edit that already added this day is not an error.
      stmts.push({
        sql: 'INSERT OR IGNORE INTO event_options (id, event_id, kind, date, part, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        args: [newOptionId(), id, 'date', d, part, now],
      })
    }
  }
  // In-transaction cap re-check: a NULL date violates NOT NULL and rolls the whole batch back.
  stmts.push({
    sql: `INSERT INTO event_options (id, event_id, kind, date, part, created_at)
      SELECT 'capcheck', ?, 'date', NULL, 'day', 0 WHERE (SELECT COUNT(*) FROM event_options WHERE event_id = ?) > ?`,
    args: [id, id, MAX_OPTIONS],
  })
  stmts.push(bump(id, now))
  try {
    return (await commitAndRead(stmts, id, auth)).state
  } catch (e) {
    const mapped = mapDbError(e)
    if (mapped?.code === 'too_many_options') throw new HangsError('too_many_options', tooManyMessage(ev.mode))
    if (mapped?.code === 'locked_option') throw new HangsError('locked_option')
    throw mapped ?? e
  }
}

export async function removePerson(ctx: OrganiserCtx, personId: string, auth: AuthInput): Promise<EventState> {
  const id = ctx.event.id
  const now = clock()
  // The bump runs first and only while the person still exists, so a concurrent removal never bumps twice. The
  // trailing SELECT only words the error when nothing was removed (an organiser's row survives the guards).
  const { rs, state } = await commitAndRead([
    {
      sql: `UPDATE events SET version = version + 1, updated_at = ?
        WHERE id = ? AND EXISTS (SELECT 1 FROM people WHERE id = ? AND event_id = ? AND is_organiser = 0)`,
      args: [now, id, personId, id],
    },
    {
      sql: 'DELETE FROM answers WHERE person_id = ? AND event_id = ? AND EXISTS (SELECT 1 FROM people WHERE id = ? AND event_id = ? AND is_organiser = 0)',
      args: [personId, id, personId, id],
    },
    { sql: 'DELETE FROM people WHERE id = ? AND event_id = ? AND is_organiser = 0', args: [personId, id] },
    { sql: 'SELECT is_organiser FROM people WHERE id = ? AND event_id = ?', args: [personId, id] },
  ], id, auth)
  if (rs[2].rowsAffected === 0) {
    if (Number(rs[3].rows[0]?.is_organiser) === 1) throw new HangsError('cannot_remove_organiser')
    throw new HangsError('not_found', "That person isn't part of this hang.")
  }
  return state
}

export async function lockEvent(ctx: OrganiserCtx, input: LockInputT, auth: AuthInput): Promise<EventState> {
  const ev = ctx.event
  const now = clock()
  const today = todayFor(ev.tz)
  const opt = ctx.options.find(o => o.id === input.optionId)
  if (!opt) throw new HangsError('bad_request', "That day isn't part of this hang.")
  if (opt.date < today && input.optionId !== ev.lockedOptionId) {
    throw new HangsError('bad_request', 'That day has passed. Pick another.')
  }
  // One guarded write: the option must still exist (a concurrent date edit may have removed it) and be today or
  // later, unless it is already the locked option.
  const { rs, state } = await commitAndRead([{
    sql: `UPDATE events SET locked_option_id = ?, locked_time = ?, locked_place = ?, locked_at = ?,
      version = version + 1, updated_at = ?
      WHERE id = ? AND EXISTS (
        SELECT 1 FROM event_options o
        WHERE o.id = ? AND o.event_id = events.id AND (o.date >= ? OR o.id = events.locked_option_id)
      )`,
    args: [input.optionId, input.time, input.place, now, now, ev.id, input.optionId, today],
  }], ev.id, auth)
  if (rs[0].rowsAffected === 0) throw new HangsError('bad_request', "That day isn't part of this hang any more. Pick another.")
  return state
}

export async function unlockEvent(ctx: OrganiserCtx, auth: AuthInput): Promise<EventState> {
  const ev = ctx.event
  if (!ev.lockedOptionId) throw new HangsError('not_locked')
  const { state } = await commitAndRead([{
    sql: `UPDATE events SET locked_option_id = NULL, locked_time = NULL, locked_place = '', locked_at = NULL,
      version = version + 1, updated_at = ? WHERE id = ?`,
    args: [clock(), ev.id],
  }], ev.id, auth)
  return state
}
