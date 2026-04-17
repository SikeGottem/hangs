import { createClient, type Client } from '@libsql/client'
import { randomBytes } from 'crypto'

let _client: Client | null = null

export function getDb(): Client {
  if (!_client) {
    const url = (process.env.TURSO_DATABASE_URL || '').trim()
    const authToken = (process.env.TURSO_AUTH_TOKEN || '').trim()

    if (url) {
      _client = createClient({ url, authToken })
    } else {
      _client = createClient({ url: 'file:hangs.db' })
    }
  }
  return _client
}

// Bootstrap schema — idempotent, safe to call repeatedly.
// On cold starts this runs as ONE batched transaction (1 round-trip) instead
// of ~27 sequential statements. On warm lambdas the in-memory flag makes it a no-op.
let _bootstrapped = false
let _bootstrapPromise: Promise<void> | null = null
export async function ensureSchema() {
  if (_bootstrapped) return
  if (_bootstrapPromise) return _bootstrapPromise
  _bootstrapPromise = _bootstrap()
  try { await _bootstrapPromise } finally { _bootstrapPromise = null }
}

async function _bootstrap() {
  const db = getDb()

  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS hangs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      creator_name TEXT NOT NULL,
      creator_id TEXT,
      date_range_start TEXT NOT NULL,
      date_range_end TEXT NOT NULL,
      date_mode TEXT DEFAULT 'range',
      selected_dates TEXT,
      template TEXT,
      duration INTEGER DEFAULT 2,
      location TEXT,
      status TEXT DEFAULT 'planning',
      confirmed_date TEXT,
      confirmed_hour INTEGER,
      confirmed_activity TEXT,
      confirmed_notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      hang_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (hang_id) REFERENCES hangs(id)
    )`,
    `CREATE TABLE IF NOT EXISTS availability (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hang_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      date TEXT NOT NULL,
      hour INTEGER NOT NULL,
      status TEXT DEFAULT 'busy',
      UNIQUE(hang_id, participant_id, date, hour),
      FOREIGN KEY (hang_id) REFERENCES hangs(id),
      FOREIGN KEY (participant_id) REFERENCES participants(id)
    )`,
    `CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hang_id TEXT NOT NULL,
      name TEXT NOT NULL,
      added_by TEXT,
      cost_estimate TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (hang_id) REFERENCES hangs(id)
    )`,
    `CREATE TABLE IF NOT EXISTS activity_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_id INTEGER NOT NULL,
      participant_id TEXT NOT NULL,
      vote TEXT DEFAULT 'up',
      UNIQUE(activity_id, participant_id),
      FOREIGN KEY (activity_id) REFERENCES activities(id),
      FOREIGN KEY (participant_id) REFERENCES participants(id)
    )`,
    `CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hang_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (hang_id) REFERENCES hangs(id),
      FOREIGN KEY (participant_id) REFERENCES participants(id)
    )`,
    `CREATE TABLE IF NOT EXISTS transport (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hang_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'own_way',
      seats INTEGER DEFAULT 0,
      UNIQUE(hang_id, participant_id),
      FOREIGN KEY (hang_id) REFERENCES hangs(id),
      FOREIGN KEY (participant_id) REFERENCES participants(id)
    )`,
    `CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hang_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      data TEXT NOT NULL,
      caption TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (hang_id) REFERENCES hangs(id),
      FOREIGN KEY (participant_id) REFERENCES participants(id)
    )`,
    `CREATE TABLE IF NOT EXISTS bring_list (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hang_id TEXT NOT NULL,
      parent_id INTEGER,
      item TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (hang_id) REFERENCES hangs(id),
      FOREIGN KEY (parent_id) REFERENCES bring_list(id)
    )`,
    `CREATE TABLE IF NOT EXISTS bring_list_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      participant_id TEXT NOT NULL,
      note TEXT,
      UNIQUE(item_id, participant_id),
      FOREIGN KEY (item_id) REFERENCES bring_list(id),
      FOREIGN KEY (participant_id) REFERENCES participants(id)
    )`,
    `CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hang_id TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      paid_by TEXT NOT NULL,
      split_between TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (hang_id) REFERENCES hangs(id),
      FOREIGN KEY (paid_by) REFERENCES participants(id)
    )`,
    `CREATE TABLE IF NOT EXISTS polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hang_id TEXT NOT NULL,
      question TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (hang_id) REFERENCES hangs(id)
    )`,
    `CREATE TABLE IF NOT EXISTS poll_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      FOREIGN KEY (poll_id) REFERENCES polls(id)
    )`,
    `CREATE TABLE IF NOT EXISTS poll_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_option_id INTEGER NOT NULL,
      participant_id TEXT NOT NULL,
      UNIQUE(poll_option_id, participant_id),
      FOREIGN KEY (poll_option_id) REFERENCES poll_options(id),
      FOREIGN KEY (participant_id) REFERENCES participants(id)
    )`,
    `CREATE TABLE IF NOT EXISTS rsvp (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hang_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'going',
      UNIQUE(hang_id, participant_id),
      FOREIGN KEY (hang_id) REFERENCES hangs(id),
      FOREIGN KEY (participant_id) REFERENCES participants(id)
    )`,
    `CREATE TABLE IF NOT EXISTS confirm_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hang_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      vote TEXT NOT NULL DEFAULT 'yes',
      UNIQUE(hang_id, participant_id),
      FOREIGN KEY (hang_id) REFERENCES hangs(id),
      FOREIGN KEY (participant_id) REFERENCES participants(id)
    )`,
    `CREATE TABLE IF NOT EXISTS reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hang_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      emoji TEXT NOT NULL,
      UNIQUE(hang_id, participant_id),
      FOREIGN KEY (hang_id) REFERENCES hangs(id),
      FOREIGN KEY (participant_id) REFERENCES participants(id)
    )`,
    `CREATE TABLE IF NOT EXISTS commitment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hang_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'probably',
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(hang_id, participant_id),
      FOREIGN KEY (hang_id) REFERENCES hangs(id),
      FOREIGN KEY (participant_id) REFERENCES participants(id)
    )`,
    // ── Crew pivot: persistent accounts + saved groups ──
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      display_name TEXT,
      google_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS auth_tokens (
      token TEXT PRIMARY KEY,
      user_id TEXT,
      email TEXT,
      purpose TEXT NOT NULL,
      crew_context TEXT,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS crews (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      slug TEXT UNIQUE,
      created_by TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS crew_members (
      id TEXT PRIMARY KEY,
      crew_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      display_name TEXT,
      role TEXT DEFAULT 'member',
      dietary TEXT,
      transport_preference TEXT,
      contact_phone TEXT,
      notes TEXT,
      joined_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(crew_id, user_id),
      FOREIGN KEY (crew_id) REFERENCES crews(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      crew_id TEXT,
      hang_id TEXT,
      type TEXT NOT NULL,
      text TEXT NOT NULL,
      url TEXT,
      read_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      crew_id TEXT,
      hang_id TEXT,
      event TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  ]

  // One batched write transaction — 1 network round-trip instead of ~20 sequential.
  await db.batch(statements, 'write')

  // Migrations run in parallel since each is independent and ALTER TABLE can fail
  // harmlessly when the column already exists.
  const migrations: [string, string, string][] = [
    ['hangs', 'date_mode', "TEXT DEFAULT 'range'"],
    ['hangs', 'selected_dates', 'TEXT'],
    ['hangs', 'location', 'TEXT'],
    ['hangs', 'duration', 'INTEGER DEFAULT 2'],
    ['hangs', 'template', 'TEXT'],
    ['hangs', 'creator_id', 'TEXT'],
    ['hangs', 'description', 'TEXT'],
    ['hangs', 'theme', 'TEXT'],
    ['hangs', 'dress_code', 'TEXT'],
    ['hangs', 'response_deadline', 'TEXT'],
    ['hangs', 'ask_dietary', 'INTEGER DEFAULT 0'],
    ['hangs', 'custom_question', 'TEXT'],
    ['hangs', 'locked_at', 'TEXT'],
    ['hangs', 'cancelled_at', 'TEXT'],
    ['activities', 'cost_estimate', 'TEXT'],
    ['bring_list', 'parent_id', 'INTEGER'],
    ['participants', 'dietary', 'TEXT'],
    ['participants', 'custom_answer', 'TEXT'],
    // Crew pivot — additive columns for crew-scoped hangs and features
    ['hangs', 'crew_id', 'TEXT'],
    ['hangs', 'recurrence', 'TEXT'],
    ['hangs', 'parent_hang_id', 'TEXT'],
    ['participants', 'user_id', 'TEXT'],
    ['photos', 'crew_id', 'TEXT'],
    ['expenses', 'crew_id', 'TEXT'],
    ['polls', 'crew_id', 'TEXT'],
    // Crew member availability shape — a persistent weekly pattern so members
    // don't repaint their grid every hang. JSON: { "Mon|19": "free", ... }
    ['crew_members', 'availability_shape', 'TEXT'],
    // Recurring hang scheduling. rule is a simple format like "weekly:thu:19"
    // or "biweekly:fri:18". template_hang_id points at the hang to clone.
    ['crews', 'recurring_rule', 'TEXT'],
    ['crews', 'recurring_template_hang_id', 'TEXT'],
    ['crews', 'cover_color', 'TEXT'],
    ['crews', 'cover_emoji', 'TEXT'],
    // Public invite link token. When non-null, anyone with the URL can join.
    // Rotating this value instantly revokes any previously-shared links.
    ['crews', 'public_invite_token', 'TEXT'],
  ]
  await Promise.allSettled(
    migrations.map(([t, c, ty]) => db.execute(`ALTER TABLE ${t} ADD COLUMN ${c} ${ty}`))
  )

  // Backfill: for existing hangs missing a creator_id, set it from the oldest
  // participant matching creator_name. Safe to run repeatedly.
  try {
    await db.execute(`
      UPDATE hangs SET creator_id = (
        SELECT p.id FROM participants p
        WHERE p.hang_id = hangs.id AND p.name = hangs.creator_name
        ORDER BY p.created_at LIMIT 1
      )
      WHERE creator_id IS NULL
    `)
  } catch {}

  _bootstrapped = true
}

export function genId(len = 8): string {
  return randomBytes(len).toString('base64url').slice(0, len)
}

// Read the hang's lock/cancel state. Used by mutation routes to reject writes
// after the creator has locked responses or cancelled the hang.
export async function getHangState(hangId: string) {
  const db = getDb()
  const res = await db.execute({
    sql: 'SELECT id, locked_at, cancelled_at FROM hangs WHERE id = ?',
    args: [hangId],
  })
  if (!res.rows[0]) return { exists: false as const }
  return {
    exists: true as const,
    locked: !!res.rows[0].locked_at,
    cancelled: !!res.rows[0].cancelled_at,
  }
}

// ── Formatting helpers ──

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatSlotDisplay(date: string, hour: number) {
  const d = new Date(date + 'T00:00:00')
  const dayName = DAY_NAMES[d.getDay()]
  const timeStr = hour === 0 ? '12am' : hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour - 12}pm`
  return `${dayName} ${d.getDate()} ${d.toLocaleString('en', { month: 'short' })}, ${timeStr}`
}

// ── Synthesis ──

type SynthParticipant = { id: string; name: string }
type SynthAvail = { participant_id: string; date: string; hour: number; status: string }
type SynthActivity = { id?: number; name: string; ups: number; downs: number }
export type CommitmentLevel = 'in' | 'probably' | 'cant'
type SynthCommitment = { participant_id: string; level: CommitmentLevel }

// Weight applied to a participant's free/maybe contribution to a slot's score
// based on how likely they actually are to show up. Matches Phase 2.3 spec.
const COMMITMENT_WEIGHT: Record<CommitmentLevel, number> = {
  in: 1.0,
  probably: 0.5,
  cant: 0,
}

// Pure synthesis — takes pre-fetched data so the caller can batch its DB round-trips.
// No DB access inside. The main hang route uses this with data already in hand.
export function synthesiseFromData(
  participants: SynthParticipant[],
  allAvail: SynthAvail[],
  activities: SynthActivity[],
  commitments: SynthCommitment[] = [],
) {
  const totalParticipants = participants.length
  if (totalParticipants === 0) return null

  const participantMap: Record<string, string> = {}
  for (const p of participants) participantMap[p.id] = p.name

  const commitmentById: Record<string, CommitmentLevel> = {}
  for (const c of commitments) commitmentById[c.participant_id] = c.level
  const weightFor = (pid: string) => {
    const lvl = commitmentById[pid]
    // Unknown = treat as 'probably' by default so unrated participants don't
    // fully dominate or fully drop out of the ranking.
    return lvl ? COMMITMENT_WEIGHT[lvl] : 0.75
  }

  // Per-slot breakdown: raw free/maybe names (for display) + commitment-weighted
  // attendance score (for ranking).
  type SlotBucket = {
    free: string[]
    maybe: string[]
    absent: string[]
    weightedFree: number
    weightedMaybe: number
  }
  const slotPeople: Record<string, SlotBucket> = {}
  const slotSet = new Set<string>()
  for (const a of allAvail) slotSet.add(`${a.date}|${a.hour}`)
  for (const key of slotSet) {
    slotPeople[key] = { free: [], maybe: [], absent: [], weightedFree: 0, weightedMaybe: 0 }
  }

  for (const a of allAvail) {
    const key = `${a.date}|${a.hour}`
    const name = participantMap[a.participant_id] || a.participant_id
    const w = weightFor(a.participant_id)
    if (a.status === 'free') {
      slotPeople[key].free.push(name)
      slotPeople[key].weightedFree += w
    } else if (a.status === 'maybe') {
      slotPeople[key].maybe.push(name)
      slotPeople[key].weightedMaybe += w
    }
  }

  const respondedIds = new Set(allAvail.map(a => a.participant_id))
  for (const key of Object.keys(slotPeople)) {
    const freeSet = new Set(slotPeople[key].free)
    const maybeSet = new Set(slotPeople[key].maybe)
    for (const pid of respondedIds) {
      const name = participantMap[pid] || pid
      if (!freeSet.has(name) && !maybeSet.has(name)) {
        slotPeople[key].absent.push(name)
      }
    }
  }

  const scored = Object.entries(slotPeople).map(([key, people]) => {
    const [date, hourStr] = key.split('|')
    const hour = parseInt(hourStr)
    // Ranking score uses commitment weights: a slot full of "probably" people
    // scores lower than the same slot with "in" people.
    const score = people.weightedFree * 1.0 + people.weightedMaybe * 0.5
    return {
      date, hour, score,
      free: people.free.length, maybe: people.maybe.length,
      total: people.free.length + people.maybe.length,
      freeNames: people.free, maybeNames: people.maybe, absentNames: people.absent,
      display: formatSlotDisplay(date, hour),
    }
  }).sort((a, b) => b.score - a.score || b.free - a.free)

  const top3 = scored.slice(0, 3)
  const bestSlot = top3[0] || { date: '', hour: 0, score: 0, free: 0, maybe: 0, total: 0, freeNames: [], maybeNames: [], absentNames: [], display: '' }

  // Top activity: highest (ups - downs), preferring ups as tiebreaker
  const topActivity = [...activities]
    .sort((a, b) => ((b.ups || 0) - (b.downs || 0)) - ((a.ups || 0) - (a.downs || 0)) || (b.ups || 0) - (a.ups || 0))
    [0] || null

  const respondedCount = respondedIds.size
  const confidence = respondedCount >= totalParticipants * 0.7 ? 'high'
    : respondedCount >= totalParticipants * 0.4 ? 'medium' : 'low'

  return {
    recommendedTime: {
      date: bestSlot.date, hour: bestSlot.hour, display: bestSlot.display,
      freeCount: bestSlot.free, maybeCount: bestSlot.maybe,
      attendeeCount: bestSlot.total, totalParticipants,
      absentNames: bestSlot.absentNames,
    },
    alternativeTimes: top3.slice(1).map(s => ({
      date: s.date, hour: s.hour, display: s.display,
      freeCount: s.free, maybeCount: s.maybe, attendeeCount: s.total,
      absentNames: s.absentNames,
    })),
    recommendedActivity: topActivity && (topActivity.ups || 0) > 0 ? {
      name: topActivity.name,
      ups: topActivity.ups || 0,
      downs: topActivity.downs || 0,
    } : null,
    confidence, respondedCount, totalParticipants,
  }
}

// Back-compat wrapper — /api/hangs/[id]/synthesis still calls this. One batched read.
export async function synthesise(hangId: string) {
  const db = getDb()
  await ensureSchema()

  const [participantsRes, allAvailRes, actRes, commitRes] = await db.batch([
    { sql: 'SELECT id, name FROM participants WHERE hang_id = ?', args: [hangId] },
    { sql: 'SELECT participant_id, date, hour, status FROM availability WHERE hang_id = ?', args: [hangId] },
    {
      sql: `SELECT a.id, a.name,
        SUM(CASE WHEN av.vote = 'up' THEN 1 ELSE 0 END) as ups,
        SUM(CASE WHEN av.vote = 'down' THEN 1 ELSE 0 END) as downs
      FROM activities a LEFT JOIN activity_votes av ON av.activity_id = a.id
      WHERE a.hang_id = ? GROUP BY a.id`,
      args: [hangId],
    },
    { sql: 'SELECT participant_id, level FROM commitment WHERE hang_id = ?', args: [hangId] },
  ], 'read')

  return synthesiseFromData(
    participantsRes.rows.map(r => ({ id: r.id as string, name: r.name as string })),
    allAvailRes.rows.map(r => ({
      participant_id: r.participant_id as string,
      date: r.date as string,
      hour: r.hour as number,
      status: r.status as string,
    })),
    actRes.rows.map(r => ({
      id: r.id as number,
      name: r.name as string,
      ups: (r.ups as number) || 0,
      downs: (r.downs as number) || 0,
    })),
    commitRes.rows.map(r => ({
      participant_id: r.participant_id as string,
      level: r.level as CommitmentLevel,
    })),
  )
}

// ── Heatmap ──

export async function getHeatmap(hangId: string) {
  const db = getDb()
  await ensureSchema()

  const [pRes, detailRes] = await db.batch([
    { sql: 'SELECT COUNT(*) as cnt FROM participants WHERE hang_id = ?', args: [hangId] },
    {
      sql: `SELECT a.date, a.hour, a.status, p.name
            FROM availability a
            JOIN participants p ON p.id = a.participant_id
            WHERE a.hang_id = ?`,
      args: [hangId],
    },
  ], 'read')

  const total = (pRes.rows[0].cnt as number) || 0

  const heatmap: Record<string, { free: number; maybe: number; total: number; ratio: number; freeNames: string[]; maybeNames: string[] }> = {}

  for (const r of detailRes.rows) {
    const key = `${r.date}|${r.hour}`
    if (!heatmap[key]) heatmap[key] = { free: 0, maybe: 0, total: 0, ratio: 0, freeNames: [], maybeNames: [] }
    if (r.status === 'free') {
      heatmap[key].free++
      heatmap[key].freeNames.push(r.name as string)
    } else if (r.status === 'maybe') {
      heatmap[key].maybe++
      heatmap[key].maybeNames.push(r.name as string)
    }
  }

  for (const val of Object.values(heatmap)) {
    val.total = val.free + val.maybe
    val.ratio = total > 0 ? val.total / total : 0
  }

  return { heatmap, totalParticipants: total }
}
