// Per-event Open Graph image (1200x630): planning card or locked "It's on" card, rendered only for the current ?v=.
import { BrandCard, EventCard, ogView, renderOg } from '@/app/api/og/og-kit'
import { serverError } from '@/lib/errors'
import { getEventState } from '@/lib/events'
import { timed } from '@/lib/http'
import { isEventId } from '@/lib/ids'
import { noteReadMiss, readMissBlocked } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'
// Fail fast rather than leave a link-preview crawler hanging.
export const maxDuration = 15

const CACHE = 'public, max-age=300, s-maxage=300'
const SHORT = 'public, max-age=60, s-maxage=60'

function redirect(location: string, cacheControl: string): Response {
  return new Response(null, { status: 307, headers: { Location: location, 'Cache-Control': cacheControl } })
}

// Unknown ids go to the static (CDN-cached) brand card. A real event renders only at its current ?v=<version>; any
// other v redirects there, so a random ?v= cannot bypass the CDN to force a fresh render. One round trip either way.
// An IP over the read-miss limit (an id scanner) gets the brand card with no database read, never cached at the CDN.
export async function GET(req: Request, ctx: RouteContext<'/api/events/[id]/og'>) {
  const { id } = await ctx.params
  if (!isEventId(id)) return redirect('/api/og', CACHE)
  if (readMissBlocked(req)) return redirect('/api/og', 'no-store')
  return timed(async () => {
    try {
      const state = await getEventState(id, {})
      if (!state) {
        noteReadMiss(req)
        return redirect('/api/og', CACHE)
      }
      const version = String(state.event.version)
      if (new URL(req.url).searchParams.get('v') !== version) return redirect(`/api/events/${id}/og?v=${version}`, SHORT)
      return await renderOg(<EventCard view={ogView(state)} />, CACHE)
    } catch (e) {
      // A preview must never 500 in a group chat: log, then fall back to the brand card (short cache so it recovers).
      serverError(e, `GET /api/events/${id}/og`)
      try {
        return await renderOg(<BrandCard />, SHORT)
      } catch {
        return redirect('/api/og', SHORT)
      }
    }
  })
}
