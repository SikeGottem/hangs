// Rate limits. Mutations: DB-backed fixed windows counted inside the request's preflight batch (no extra round trips),
// keyed by a keyed hash of the IP that rotates daily (never the raw IP), with expired rows pruned in the same batch.
// Reads: only an in-memory, per-instance limit on misses (404s), so read paths never write to the database.
import 'server-only'
import { createHmac, randomBytes } from 'node:crypto'
import type { InStatement, ResultSet } from '@libsql/client'
import { getDb } from './db'
import { HangsError } from './errors'
import { clientIp } from './http'

export const BUCKETS = {
  mut_ip: { limit: 1000, windowMs: 10 * 60_000 },   // every mutation, per IP, checked first
  create: { limit: 20, windowMs: 60 * 60_000 },
  join: { limit: 60, windowMs: 60 * 60_000 },
  join_ip: { limit: 300, windowMs: 60 * 60_000 },
  write: { limit: 600, windowMs: 10 * 60_000 },
  organiser: { limit: 120, windowMs: 10 * 60_000 },
} as const

export type Bucket = keyof typeof BUCKETS

// The longest window: a row whose window started longer ago than this has expired for every bucket.
export const MAX_WINDOW_MS = Math.max(...Object.values(BUCKETS).map(b => b.windowMs))

// Buckets keyed by IP alone; the rest are keyed by IP + event id.
const IP_ONLY: ReadonlySet<Bucket> = new Set(['mut_ip', 'create', 'join_ip'])

// On globalThis so every bundle (pages and each route handler) hashes with the same per-process fallback secret.
const gs = globalThis as typeof globalThis & { __hangsRlSecret?: string }

// A server-only secret for the keyed hash: HANGS_RL_SECRET, else the Turso token (already a server secret, never
// revealed by an HMAC), else a random per-process value (local runs).
function secret(): string {
  const s = process.env.HANGS_RL_SECRET?.trim() || process.env.TURSO_AUTH_TOKEN?.trim()
  if (s) return s
  return (gs.__hangsRlSecret ??= randomBytes(32).toString('hex'))
}

// HMAC-SHA256 of the IP (plus scope), mixed with the UTC day of the window: without the secret the IP space cannot be
// brute-forced back out, and the same IP gets unrelated keys on different days. Windows never span a UTC midnight.
export function limitKey(bucket: Bucket, ip: string, windowStart: number, scope?: string): string {
  const day = Math.floor(windowStart / 86_400_000)
  const mac = createHmac('sha256', secret()).update(`${day}|${bucket}|${ip}|${scope ?? ''}`).digest('hex').slice(0, 32)
  return `${bucket}:${mac}`
}

function waitText(seconds: number): string {
  if (seconds <= 60) return 'a minute'
  const minutes = Math.ceil(seconds / 60)
  return minutes >= 60 ? 'an hour' : `${minutes} minutes`
}

export const rateLimitedMessage = (retryAfterSeconds: number) =>
  `Too many requests from this connection just now. Try again in ${waitText(retryAfterSeconds)}.`

interface Planned { bucket: Bucket; key: string; windowStart: number }

// Statements to put at the front of a preflight batch, and the check to run on their results.
export interface LimitCheck {
  statements: InStatement[]
  // Throws a 429 HangsError for the per-IP bucket, then not_found for a missing event, then 429 for the rest.
  evaluate(results: ResultSet[], eventExists: boolean): void
}

const UPSERT_TAIL = `ON CONFLICT(key) DO UPDATE SET
    count = CASE WHEN window_start = excluded.window_start THEN count + 1 ELSE 1 END,
    window_start = excluded.window_start
  RETURNING count`

// mut_ip is always counted. Every other bucket only counts when the event exists (unknown ids never grow
// rate_limits) and no earlier bucket is already over its limit (a blocked IP stops creating per-event rows).
// The final statement prunes rows whose window has ended for every bucket.
export function limitStatements(req: Request, buckets: Bucket[], eventId: string | null, now = Date.now()): LimitCheck {
  const ip = clientIp(req)
  const plan: Planned[] = (['mut_ip', ...buckets.filter(b => b !== 'mut_ip')] as Bucket[]).map(bucket => {
    const windowStart = Math.floor(now / BUCKETS[bucket].windowMs) * BUCKETS[bucket].windowMs
    return { bucket, windowStart, key: limitKey(bucket, ip, windowStart, IP_ONLY.has(bucket) ? undefined : eventId ?? undefined) }
  })
  const statements: InStatement[] = plan.map((p, i) => {
    if (i === 0) {
      return { sql: `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1) ${UPSERT_TAIL}`, args: [p.key, p.windowStart] }
    }
    const earlier = plan.slice(0, i)
    const conds: string[] = []
    const args: (string | number)[] = [p.key, p.windowStart]
    if (eventId) {
      conds.push('EXISTS (SELECT 1 FROM events WHERE id = ?)')
      args.push(eventId)
    }
    conds.push(`NOT EXISTS (SELECT 1 FROM rate_limits WHERE ${earlier.map(() => '(key = ? AND window_start = ? AND count > ?)').join(' OR ')})`)
    for (const e of earlier) args.push(e.key, e.windowStart, BUCKETS[e.bucket].limit)
    return {
      sql: `INSERT INTO rate_limits (key, window_start, count) SELECT ?, ?, 1 WHERE ${conds.join(' AND ')} ${UPSERT_TAIL}`,
      args,
    }
  })
  statements.push({ sql: 'DELETE FROM rate_limits WHERE window_start < ?', args: [now - MAX_WINDOW_MS] })

  const tripped = (p: Planned, rs: ResultSet | undefined) => {
    const count = rs?.rows[0] ? Number(rs.rows[0].count) : 0
    if (count <= BUCKETS[p.bucket].limit) return
    const retryAfter = Math.max(1, Math.ceil((p.windowStart + BUCKETS[p.bucket].windowMs - now) / 1000))
    throw new HangsError('rate_limited', rateLimitedMessage(retryAfter), { 'Retry-After': String(retryAfter) })
  }

  return {
    statements,
    evaluate(results, eventExists) {
      tripped(plan[0], results[0])
      if (!eventExists) throw new HangsError('not_found')
      plan.forEach((p, i) => { if (i > 0) tripped(p, results[i]) })
    },
  }
}

// Create has no event yet: the per-IP and create buckets (plus the prune) in one write batch.
export async function checkCreateLimits(req: Request): Promise<void> {
  const check = limitStatements(req, ['create'], null)
  const rs = await getDb().batch(check.statements, 'write')
  check.evaluate(rs, true)
}

// ---------- reads: in-memory miss limiter ----------

const MISS_LIMIT = 120
const MISS_WINDOW_MS = 10 * 60_000
const MISS_MAX_KEYS = 5000
// On globalThis: Next bundles route handlers and pages separately, and each copy of this module must share one map,
// or a scanner blocked on the API could keep probing through the page or the OG route.
const gm = globalThis as typeof globalThis & { __hangsReadMisses?: Map<string, { windowStart: number; count: number }> }
const misses = (gm.__hangsReadMisses ??= new Map())

// `src` is the Request in route handlers, or the request Headers in a server component (next/headers).
function missKey(src: Request | Headers, windowStart: number): string {
  return limitKey('mut_ip', `miss|${clientIp(src)}`, windowStart)
}

// Per instance, in memory: an IP that keeps asking for hangs that do not exist (an id scanner) is turned away before
// any database read. Normal polling of a real hang never counts.
export function readMissBlocked(src: Request | Headers, now = Date.now()): boolean {
  const windowStart = Math.floor(now / MISS_WINDOW_MS) * MISS_WINDOW_MS
  const m = misses.get(missKey(src, windowStart))
  return !!m && m.windowStart === windowStart && m.count >= MISS_LIMIT
}

export function noteReadMiss(src: Request | Headers, now = Date.now()): void {
  const windowStart = Math.floor(now / MISS_WINDOW_MS) * MISS_WINDOW_MS
  const key = missKey(src, windowStart)
  const m = misses.get(key)
  if (m && m.windowStart === windowStart) m.count++
  else {
    if (misses.size >= MISS_MAX_KEYS) misses.clear()
    misses.set(key, { windowStart, count: 1 })
  }
}

export function readMissRetryAfter(now = Date.now()): number {
  const windowStart = Math.floor(now / MISS_WINDOW_MS) * MISS_WINDOW_MS
  return Math.max(1, Math.ceil((windowStart + MISS_WINDOW_MS - now) / 1000))
}
