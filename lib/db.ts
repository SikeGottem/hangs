// libSQL client selection (local file DB vs Turso over HTTP), the idempotent v2 schema (applied lazily, never as an
// extra cold-start round trip once it exists), and a per-request round-trip counter that feeds Server-Timing.
import 'server-only'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createClient, type Client, type InStatement, type ResultSet, type TransactionMode } from '@libsql/client'

export const LOCAL_DB_URL = 'file:hangs-v2.local.db'

// Bump when SCHEMA_STATEMENTS gains something an existing database lacks (a new table or index).
export const SCHEMA_VERSION = 2

// v2 schema. Only CREATE ... IF NOT EXISTS and writes to schema_meta are allowed here.
// New table names (events, event_options, people, answers, rate_limits, schema_meta) never collide with v1.
// Every query is served by a primary key, a UNIQUE autoindex or idx_answers_event; no redundant indexes.
export const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    mode TEXT NOT NULL DEFAULT 'days' CHECK (mode IN ('days','parts')),
    tz TEXT NOT NULL DEFAULT 'Australia/Sydney',
    organiser_key_hash TEXT NOT NULL,
    locked_option_id TEXT,
    locked_time TEXT,
    locked_place TEXT NOT NULL DEFAULT '',
    locked_at INTEGER,
    version INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS event_options (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'date',
    date TEXT NOT NULL,
    part TEXT NOT NULL DEFAULT 'day' CHECK (part IN ('day','morning','afternoon','evening')),
    created_at INTEGER NOT NULL,
    UNIQUE (event_id, date, part)
  )`,
  `CREATE TABLE IF NOT EXISTS people (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    is_organiser INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (event_id, name_key)
  )`,
  `CREATE TABLE IF NOT EXISTS answers (
    person_id TEXT NOT NULL,
    option_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    value TEXT NOT NULL CHECK (value IN ('free','maybe','cant')),
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (person_id, option_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_answers_event ON answers(event_id)`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY,
    window_start INTEGER NOT NULL,
    count INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start)`,
  // Last, so the recorded version only moves once everything above exists. Never moves backwards.
  `INSERT INTO schema_meta (key, value) VALUES ('schema_version', '${SCHEMA_VERSION}')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE CAST(value AS INTEGER) < CAST(excluded.value AS INTEGER)`,
]

const SCHEMA_CHECK = "SELECT value FROM schema_meta WHERE key = 'schema_version'"

export function createDb(url: string, authToken?: string): Client {
  return createClient(authToken ? { url, authToken } : { url })
}

export async function ensureSchema(db: Client): Promise<void> {
  await db.batch(SCHEMA_STATEMENTS, 'write')
}

// ---------- per-request round-trip counter (Server-Timing) ----------

export interface DbTiming { trips: number; ms: number; parent?: DbTiming }

// On globalThis like the client: Next can load this module more than once (route handlers and pages are separate
// bundles) while the instrumented client is shared, so every copy must count into the same store.
const gt = globalThis as typeof globalThis & { __hangsTiming?: AsyncLocalStorage<DbTiming> }
const timingStore = (gt.__hangsTiming ??= new AsyncLocalStorage<DbTiming>())

// Runs fn with its own counter; nested measurements also count towards the outer one.
export async function measureDb<T>(fn: () => Promise<T>): Promise<{ value: T; timing: DbTiming }> {
  const timing: DbTiming = { trips: 0, ms: 0, parent: timingStore.getStore() }
  const value = await timingStore.run(timing, fn)
  return { value, timing }
}

// `db;dur=12.3;desc="2 trips"`: database time and sequential round trips only, nothing about the data.
export function serverTimingValue(t: DbTiming): string {
  return `db;dur=${t.ms.toFixed(1)};desc="${t.trips} ${t.trips === 1 ? 'trip' : 'trips'}"`
}

async function tracked<T>(fn: () => Promise<T>): Promise<T> {
  const start = performance.now()
  try {
    return await fn()
  } finally {
    const ms = performance.now() - start
    for (let t = timingStore.getStore(); t; t = t.parent) {
      t.trips++
      t.ms += ms
    }
  }
}

// ---------- lazy schema ----------

interface SchemaState { current: boolean; ensuring: Promise<void> | null }
const g = globalThis as typeof globalThis & {
  __hangsDb?: Client
  __hangsDbOverride?: Client | null
  __hangsSchemaState?: WeakMap<Client, SchemaState>
  __hangsWrapped?: WeakMap<Client, Client>
}

function schemaState(raw: Client): SchemaState {
  if (!g.__hangsSchemaState) g.__hangsSchemaState = new WeakMap()
  let s = g.__hangsSchemaState.get(raw)
  if (!s) {
    s = { current: false, ensuring: null }
    g.__hangsSchemaState.set(raw, s)
  }
  return s
}

function ensureOnce(raw: Client): Promise<void> {
  const s = schemaState(raw)
  if (!s.ensuring) {
    s.ensuring = tracked(() => ensureSchema(raw)).then(
      () => { s.current = true },
      e => { s.ensuring = null; throw e },
    )
  }
  return s.ensuring
}

export function isMissingTable(e: unknown): boolean {
  for (let x: unknown = e, i = 0; x && i < 4; x = (x as { cause?: unknown }).cause, i++) {
    if (/no such table/i.test(x instanceof Error ? x.message : String(x))) return true
  }
  return false
}

// The first batch on each instance carries the schema-version check as an extra statement (0 extra round trips).
// A missing table means a fresh database: create the schema, then retry (the failed batch rolled back as a whole).
// An older recorded version runs the idempotent schema once after the request's own batch has succeeded.
async function instrumentedBatch(raw: Client, stmts: InStatement[], mode?: TransactionMode): Promise<ResultSet[]> {
  const s = schemaState(raw)
  try {
    if (s.current) return await tracked(() => raw.batch(stmts, mode))
    const rs = await tracked(() => raw.batch([SCHEMA_CHECK, ...stmts], mode))
    const version = Number(rs[0].rows[0]?.value ?? 0)
    if (version >= SCHEMA_VERSION) s.current = true
    else {
      // The request's own statements already committed; an upgrade failure must not turn that into an error.
      await ensureOnce(raw).catch(e => console.error(`[hangs:db] schema upgrade failed: ${e instanceof Error ? e.message : String(e)}`))
    }
    return rs.slice(1)
  } catch (e) {
    if (!isMissingTable(e)) throw e
    await ensureOnce(raw)
    return tracked(() => raw.batch(stmts, mode))
  }
}

async function instrumentedExecute(raw: Client, stmt: InStatement): Promise<ResultSet> {
  try {
    return await tracked(() => raw.execute(stmt))
  } catch (e) {
    if (!isMissingTable(e)) throw e
    await ensureOnce(raw)
    return tracked(() => raw.execute(stmt))
  }
}

// The client every repository call uses: execute/batch are counted per request and bootstrap the schema lazily.
function instrument(raw: Client): Client {
  if (!g.__hangsWrapped) g.__hangsWrapped = new WeakMap()
  const hit = g.__hangsWrapped.get(raw)
  if (hit) return hit
  const wrapped = new Proxy(raw, {
    get(target, prop, recv) {
      if (prop === 'batch') return (stmts: InStatement[], mode?: TransactionMode) => instrumentedBatch(target, stmts, mode)
      if (prop === 'execute') {
        return (stmt: InStatement | string, args?: unknown) =>
          instrumentedExecute(target, typeof stmt === 'string' && args ? ({ sql: stmt, args } as InStatement) : stmt)
      }
      const v = Reflect.get(target, prop, recv)
      return typeof v === 'function' ? v.bind(target) : v
    },
  })
  g.__hangsWrapped.set(raw, wrapped)
  return wrapped
}

// ---------- client selection ----------

// Lazy client. Order: Vercel guards, then local file DB, then Turso. Never called at import time.
export function getDb(): Client {
  if (g.__hangsDbOverride) return instrument(g.__hangsDbOverride)
  const cfg = resolveDbConfig(process.env)
  if (!g.__hangsDb) g.__hangsDb = createDb(cfg.url, cfg.authToken)
  return instrument(g.__hangsDb)
}

// Pure config resolution for tests and diagnostics; mirrors getDb()'s branch order. A libsql:// URL is served over
// HTTPS: each batch is one request on a keep-alive connection, with no WebSocket handshake on a cold start and no
// dead socket after a frozen serverless instance thaws.
export function resolveDbConfig(env: Record<string, string | undefined>): { url: string; authToken?: string } {
  const local = env.HANGS_LOCAL_DB === '1'
  if (env.VERCEL && local) throw new Error('HANGS_LOCAL_DB must not be set on Vercel')
  if (env.VERCEL && !env.TURSO_DATABASE_URL) throw new Error('TURSO_DATABASE_URL missing in production')
  if (local || !env.TURSO_DATABASE_URL) return { url: LOCAL_DB_URL }
  const url = env.TURSO_DATABASE_URL.trim().replace(/^libsql:\/\//i, 'https://')
  return { url, authToken: env.TURSO_AUTH_TOKEN }
}

export function setDbForTests(db: Client | null): void {
  g.__hangsDbOverride = db
}

export function resetDbSingletonForTests(): void {
  g.__hangsDb = undefined
}

// Test hook: forget that this client's schema was verified, so the next batch runs the cold-start path again.
export function resetSchemaStateForTests(db: Client): void {
  g.__hangsSchemaState?.delete(db)
}
