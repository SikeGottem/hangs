import { createClient, type Client, type InStatement } from '@libsql/client'
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

// Bootstrap schema — idempotent, safe to call repeatedly
let _bootstrapped = false
export async function ensureSchema() {
  if (_bootstrapped) return
  const db = getDb()

  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS hangs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      creator_name TEXT NOT NULL,
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
  ]

  for (const sql of statements) {
    await db.execute(sql)
  }

  // Migrations for existing tables
  const migrate = async (table: string, col: string, type: string) => {
    try { await db.execute(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`) } catch {}
  }
  await migrate('hangs', 'date_mode', "TEXT DEFAULT 'range'")
  await migrate('hangs', 'selected_dates', 'TEXT')
  await migrate('hangs', 'location', 'TEXT')
  await migrate('hangs', 'duration', 'INTEGER DEFAULT 2')
  await migrate('hangs', 'template', 'TEXT')
  await migrate('activities', 'cost_estimate', 'TEXT')
  await migrate('bring_list', 'parent_id', 'INTEGER')
  // Drop old claimed_by column not possible in SQLite, but it's harmless — just unused now

  _bootstrapped = true
}

export function genId(len = 8): string {
  return randomBytes(len).toString('base64url').slice(0, len)
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

export async function synthesise(hangId: string) {
  const db = getDb()
  await ensureSchema()

  const participantsRes = await db.execute({ sql: 'SELECT * FROM participants WHERE hang_id = ?', args: [hangId] })
  const participants = participantsRes.rows
  const totalParticipants = participants.length
  if (totalParticipants === 0) return null

  const allAvailRes = await db.execute({ sql: 'SELECT participant_id, date, hour, status FROM availability WHERE hang_id = ?', args: [hangId] })
  const allAvail = allAvailRes.rows

  const participantMap: Record<string, string> = {}
  for (const p of participants) participantMap[p.id as string] = p.name as string

  const slotPeople: Record<string, { free: string[]; maybe: string[]; absent: string[] }> = {}
  const slotSet = new Set<string>()
  for (const a of allAvail) slotSet.add(`${a.date}|${a.hour}`)
  for (const key of slotSet) slotPeople[key] = { free: [], maybe: [], absent: [] }

  for (const a of allAvail) {
    const key = `${a.date}|${a.hour}`
    const name = participantMap[a.participant_id as string] || (a.participant_id as string)
    if (a.status === 'free') slotPeople[key].free.push(name)
    else if (a.status === 'maybe') slotPeople[key].maybe.push(name)
  }

  const respondedIds = new Set(allAvail.map(a => a.participant_id as string))
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
    const score = people.free.length * 1.0 + people.maybe.length * 0.5
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

  const actRes = await db.execute({
    sql: `SELECT a.id, a.name,
      SUM(CASE WHEN av.vote = 'up' THEN 1 ELSE 0 END) as ups,
      SUM(CASE WHEN av.vote = 'down' THEN 1 ELSE 0 END) as downs
    FROM activities a LEFT JOIN activity_votes av ON av.activity_id = a.id
    WHERE a.hang_id = ? GROUP BY a.id
    ORDER BY (SUM(CASE WHEN av.vote = 'up' THEN 1 ELSE 0 END) - SUM(CASE WHEN av.vote = 'down' THEN 1 ELSE 0 END)) DESC
    LIMIT 1`,
    args: [hangId],
  })
  const activityScores = actRes.rows[0] || null

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
    recommendedActivity: activityScores ? {
      name: activityScores.name as string,
      ups: (activityScores.ups as number) || 0,
      downs: (activityScores.downs as number) || 0,
    } : null,
    confidence, respondedCount, totalParticipants,
  }
}

// ── Heatmap ──

export async function getHeatmap(hangId: string) {
  const db = getDb()
  await ensureSchema()

  const pRes = await db.execute({ sql: 'SELECT COUNT(*) as cnt FROM participants WHERE hang_id = ?', args: [hangId] })
  const total = (pRes.rows[0].cnt as number) || 0

  // Get individual availability with names
  const detailRes = await db.execute({
    sql: `SELECT a.date, a.hour, a.status, p.name
          FROM availability a
          JOIN participants p ON p.id = a.participant_id
          WHERE a.hang_id = ?`,
    args: [hangId],
  })

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
