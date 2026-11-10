// Serves a locked hang as an iCalendar file (all-day when no time) that opens the native Add to Calendar on iOS and imports into Google.
import { serverError } from '@/lib/errors'
import { getEventState } from '@/lib/events'
import { timed } from '@/lib/http'
import { buildIcs, icsSlug } from '@/lib/ics'
import { isEventId } from '@/lib/ids'
import { noteReadMiss, readMissBlocked } from '@/lib/ratelimit'
import { eventUrl } from '@/lib/share'
import { siteUrl } from '@/lib/site'

export const dynamic = 'force-dynamic'

function text(body: string, status: number): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
}

// `?v=<version>` is only a cache-buster for the link; it is ignored here. One round trip.
export async function GET(req: Request, ctx: RouteContext<'/api/events/[id]/ics'>) {
  const { id } = await ctx.params
  if (!isEventId(id)) return text("This hang doesn't exist.", 404)
  return timed(async () => {
    try {
      if (readMissBlocked(req)) return text('Too many requests just now. Try again later.', 429)
      const state = await getEventState(id, {})
      if (!state) {
        noteReadMiss(req)
        return text("This hang doesn't exist.", 404)
      }
      if (!state.event.lock) return text("This hang isn't locked in yet.", 409)
      const body = buildIcs(state, { url: eventUrl(await siteUrl(req), id), now: new Date() })
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': `inline; filename="${icsSlug(state.event.title)}.ics"`,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    } catch (e) {
      serverError(e, `GET /api/events/${id}/ics`)
      return text('Something broke on our end. Try again in a moment.', 500)
    }
  })
}
