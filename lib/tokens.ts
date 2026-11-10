// Server-side secrets: random person tokens / organiser keys, sha256 hashing and constant-time compare.
import 'server-only'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export function newSecret(): string {
  return randomBytes(32).toString('base64url')
}

export function hashSecret(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

const HEX64 = /^[0-9a-f]{64}$/

export function secretsEqual(hashA: string | null | undefined, hashB: string | null | undefined): boolean {
  if (typeof hashA !== 'string' || typeof hashB !== 'string') return false
  if (!HEX64.test(hashA) || !HEX64.test(hashB) || hashA.length !== hashB.length) return false
  return timingSafeEqual(Buffer.from(hashA, 'hex'), Buffer.from(hashB, 'hex'))
}
