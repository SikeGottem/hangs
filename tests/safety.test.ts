// Safety rails: no DROP, no ALTER of v1 tables, v2 schema uses only new table names, brand hex matches globals.css.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BRAND } from '@/lib/brand'
import { SCHEMA_STATEMENTS } from '@/lib/db'

const ROOT = join(__dirname, '..')

const V1_TABLES = [
  'hangs', 'participants', 'availability', 'activities', 'activity_votes', 'analytics_events', 'auth_tokens',
  'bring_list', 'bring_list_claims', 'comments', 'commitment', 'confirm_votes',
  'crew_members', 'crews', 'expenses', 'notifications', 'photos',
  'poll_options', 'poll_votes', 'polls', 'reactions', 'rsvp', 'transport', 'users',
]
const V2_TABLES = ['schema_meta', 'events', 'event_options', 'people', 'answers', 'rate_limits']

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx|mjs|js|sql)$/.test(name) ? [p] : []
  })
}

const sources = [...files(join(ROOT, 'lib')), ...files(join(ROOT, 'app'))].map(p => ({ p, text: readFileSync(p, 'utf8') }))

describe('database safety', () => {
  it('no DROP appears anywhere in lib/ or app/', () => {
    const hits = sources.filter(s => s.text.includes('DROP')).map(s => s.p)
    expect(hits).toEqual([])
  })

  it('no ALTER statement references a v1 table (and v2 adds none)', () => {
    const alters = sources.flatMap(s => [...s.text.matchAll(/ALTER\s+TABLE\s+["`]?(\w+)/gi)].map(m => `${s.p}: ${m[1]}`))
    expect(alters.filter(a => V1_TABLES.some(t => a.endsWith(`: ${t}`)))).toEqual([])
    expect(alters).toEqual([])
  })

  it('the v2 schema creates only the v2 tables and never names a v1 table', () => {
    const sql = SCHEMA_STATEMENTS.join('\n')
    const created = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(m => m[1])
    expect(created.sort()).toEqual([...V2_TABLES].sort())
    for (const t of V1_TABLES) expect(sql).not.toMatch(new RegExp(`\\b${t}\\b`, 'i'))
    for (const stmt of SCHEMA_STATEMENTS) {
      expect(stmt.trim()).toMatch(/^(CREATE TABLE IF NOT EXISTS|CREATE INDEX IF NOT EXISTS|INSERT (OR IGNORE )?INTO schema_meta)/)
    }
  })

  it('no runtime SQL in lib/ touches a v1 table name', () => {
    const lib = sources.filter(s => s.p.includes(`${join(ROOT, 'lib')}`) && !s.p.endsWith('.test.ts'))
    for (const { p, text } of lib) {
      const sqlStrings = [...text.matchAll(/`([^`]*\b(?:SELECT|INSERT|UPDATE|DELETE)\b[^`]*)`|'([^']*\b(?:SELECT|INSERT|UPDATE|DELETE)\b[^']*)'/g)].map(m => m[1] ?? m[2])
      for (const q of sqlStrings) {
        for (const t of V1_TABLES) {
          expect(q, `${p} uses v1 table ${t}`).not.toMatch(new RegExp(`\\b(FROM|INTO|UPDATE|JOIN)\\s+${t}\\b`, 'i'))
        }
      }
    }
  })
})

describe('brand tokens', () => {
  it('every hex in app/icon.svg is a BRAND colour (the favicon is outside the token scan)', () => {
    const svg = readFileSync(join(ROOT, 'app/icon.svg'), 'utf8')
    const hexes = [...svg.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0].toUpperCase())
    expect(hexes.length).toBeGreaterThan(0)
    const brand = Object.values(BRAND).map(h => h.toUpperCase())
    for (const h of hexes) expect(brand, h).toContain(h)
  })

  it('every BRAND hex appears in app/globals.css', () => {
    const css = readFileSync(join(ROOT, 'app/globals.css'), 'utf8').toUpperCase()
    for (const [name, hex] of Object.entries(BRAND)) {
      expect(css, `${name} ${hex}`).toContain(hex.toUpperCase())
    }
  })
})
