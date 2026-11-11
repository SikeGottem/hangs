// Test helper: points lib/db at a fresh temp-file libSQL database (never the dev or production DB).
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Client } from '@libsql/client'
import { createDb, setDbForTests } from '@/lib/db'
import { addDays, todayIn } from '@/lib/dates'

export function useTempDb(): { db: Client; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'hangs-v2-test-'))
  const db = createDb(`file:${join(dir, 'test.db')}`)
  setDbForTests(db)
  return {
    db,
    cleanup: () => {
      setDbForTests(null)
      db.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

export const sydneyToday = () => todayIn('Australia/Sydney')
export const future = (n: number) => addDays(sydneyToday(), n)
export const futureDates = (count: number, from = 1) => Array.from({ length: count }, (_, i) => future(from + i))

let ipCounter = 1
// A fresh client IP per call so rate-limit buckets never collide between tests.
export const freshIp = () => {
  const n = ipCounter++
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`
}
