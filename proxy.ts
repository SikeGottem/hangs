// Rate limiting edge proxy. Soft-fails if Upstash is unreachable — we'd rather
// the site stay up than lock out users during an outage.
//
// All limits are per-IP sliding window. Numbers are tuned for friend-group
// beta; tighten if spam appears in logs.
//
// Next 16 rename: this used to live at middleware.ts. The file convention and
// export name both changed (middleware → proxy). Functionality is unchanged.

import { NextResponse, type NextRequest } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// Only engage Upstash when the env vars are present. Otherwise the proxy
// is a no-op — fine for local dev.
const hasUpstash = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN

const redis = hasUpstash ? Redis.fromEnv() : null

const limits = hasUpstash
  ? {
      create: new Ratelimit({ redis: redis!, limiter: Ratelimit.slidingWindow(10, '1 h'), prefix: 'rl:create', analytics: false }),
      join: new Ratelimit({ redis: redis!, limiter: Ratelimit.slidingWindow(30, '1 h'), prefix: 'rl:join', analytics: false }),
      availability: new Ratelimit({ redis: redis!, limiter: Ratelimit.slidingWindow(60, '1 h'), prefix: 'rl:avail', analytics: false }),
      comments: new Ratelimit({ redis: redis!, limiter: Ratelimit.slidingWindow(30, '1 m'), prefix: 'rl:comments', analytics: false }),
      photos: new Ratelimit({ redis: redis!, limiter: Ratelimit.slidingWindow(10, '1 h'), prefix: 'rl:photos', analytics: false }),
      general: new Ratelimit({ redis: redis!, limiter: Ratelimit.slidingWindow(120, '1 m'), prefix: 'rl:general', analytics: false }),
    }
  : null

function bucketFor(pathname: string, method: string): keyof NonNullable<typeof limits> | null {
  if (method !== 'POST' && method !== 'DELETE') return null
  // Order matters: more specific first
  if (/^\/api\/hangs\/[^/]+\/join$/.test(pathname)) return 'join'
  if (/^\/api\/hangs\/[^/]+\/availability$/.test(pathname)) return 'availability'
  if (/^\/api\/hangs\/[^/]+\/comments$/.test(pathname)) return 'comments'
  if (/^\/api\/hangs\/[^/]+\/photos$/.test(pathname)) return 'photos'
  if (/^\/api\/hangs\/?$/.test(pathname)) return 'create'
  if (pathname.startsWith('/api/hangs/')) return 'general'
  return null
}

function getIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for') || ''
  return fwd.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown'
}

export async function proxy(req: NextRequest) {
  if (!limits) return NextResponse.next()

  const bucket = bucketFor(req.nextUrl.pathname, req.method)
  if (!bucket) return NextResponse.next()

  const ip = getIp(req)
  try {
    const { success, limit, remaining, reset } = await limits[bucket].limit(`${bucket}:${ip}`)
    if (!success) {
      return NextResponse.json(
        { error: 'Too many requests — slow down' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(limit),
            'X-RateLimit-Remaining': String(remaining),
            'X-RateLimit-Reset': String(reset),
          },
        },
      )
    }
  } catch (e) {
    // Upstash is down — log and allow
    console.warn('[hangs] rate limit check failed, allowing request:', e)
  }
  return NextResponse.next()
}

export const config = {
  // Only match API routes under /api/hangs; skip everything else.
  matcher: ['/api/hangs/:path*', '/api/hangs'],
}
