// Proves all four getDb() branches: Vercel guards, local file DB (ignoring Turso vars), and Turso (over HTTPS).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getDb, LOCAL_DB_URL, resetDbSingletonForTests, resolveDbConfig, setDbForTests } from '@/lib/db'

const KEYS = ['VERCEL', 'HANGS_LOCAL_DB', 'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'] as const
let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map(k => [k, process.env[k]]))
  for (const k of KEYS) delete process.env[k]
  setDbForTests(null)
  resetDbSingletonForTests()
})
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
  resetDbSingletonForTests()
})

// A URL that is never contacted: clients are lazy and these tests never run a query.
const FAKE_TURSO = 'https://hangs-test.invalid'

describe('getDb()', () => {
  it('1. throws on Vercel when HANGS_LOCAL_DB=1', () => {
    process.env.VERCEL = '1'
    process.env.HANGS_LOCAL_DB = '1'
    process.env.TURSO_DATABASE_URL = FAKE_TURSO
    expect(() => getDb()).toThrow('HANGS_LOCAL_DB must not be set on Vercel')
  })

  it('2. throws on Vercel without TURSO_DATABASE_URL', () => {
    process.env.VERCEL = '1'
    expect(() => getDb()).toThrow('TURSO_DATABASE_URL missing in production')
  })

  it('3. uses the local file DB when HANGS_LOCAL_DB=1, even with Turso vars set (e.g. from .env.local)', () => {
    process.env.HANGS_LOCAL_DB = '1'
    process.env.TURSO_DATABASE_URL = FAKE_TURSO
    process.env.TURSO_AUTH_TOKEN = 'secret'
    expect(resolveDbConfig(process.env)).toEqual({ url: LOCAL_DB_URL })
    expect(LOCAL_DB_URL).toBe('file:hangs-v2.local.db')
    const db = getDb()
    expect(db.protocol).toBe('file')
    db.close()
  })

  it('3b. uses the local file DB when no TURSO_DATABASE_URL is set', () => {
    expect(resolveDbConfig(process.env)).toEqual({ url: LOCAL_DB_URL })
    const db = getDb()
    expect(db.protocol).toBe('file')
    db.close()
  })

  it('4. otherwise uses Turso with the auth token', () => {
    process.env.TURSO_DATABASE_URL = FAKE_TURSO
    process.env.TURSO_AUTH_TOKEN = 'tok'
    expect(resolveDbConfig(process.env)).toEqual({ url: FAKE_TURSO, authToken: 'tok' })
    const db = getDb()
    expect(db.protocol).not.toBe('file')
    expect(getDb()).toBe(db) // singleton
    db.close()
  })

  it('5. serves a libsql:// Turso URL over HTTPS (one request per batch, no WebSocket handshake)', () => {
    expect(resolveDbConfig({ TURSO_DATABASE_URL: 'libsql://hangs-test.invalid', TURSO_AUTH_TOKEN: 'tok' }))
      .toEqual({ url: 'https://hangs-test.invalid', authToken: 'tok' })
  })
})
