// Request-scoped loader for /h/[id]: wraps loadPublicEvent in the in-memory read-miss limiter (shared by page and metadata).
import 'server-only'
import { headers } from 'next/headers'
import { cache } from 'react'
import { loadPublicEvent } from '@/lib/events'
import { noteReadMiss, readMissBlocked } from '@/lib/ratelimit'

// An IP that keeps asking for hangs that do not exist gets not-found with no database read, the same limiter (and key)
// as GET /api/events/[id] and /ics. React cache: page and generateMetadata count one miss, not two.
export const loadEventForPage = cache(async (id: string) => {
  const h = await headers()
  if (readMissBlocked(h)) return null
  const state = await loadPublicEvent(id)
  if (!state) noteReadMiss(h)
  return state
})
