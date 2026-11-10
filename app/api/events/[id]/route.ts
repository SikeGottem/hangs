// GET /api/events/[id]: event state in one round trip (etag = version + today, honours If-None-Match); PATCH: organiser edits title/note.
import { apiError } from '@/lib/errors'
import { authorizeOrganiser, getEventState, getEventStateIfChanged, patchEvent } from '@/lib/events'
import { handle, json, parseJson, readAuth } from '@/lib/http'
import { isEventId } from '@/lib/ids'
import { limitStatements, noteReadMiss, readMissBlocked, readMissRetryAfter, rateLimitedMessage } from '@/lib/ratelimit'
import { PatchEventInput } from '@/lib/schemas'

export const dynamic = 'force-dynamic'

const parseEtag = (h: string | null) => h?.trim().replace(/^W\//, '').replace(/^"|"$/g, '') || null
// Only well-formed `{version}-{YYYY-MM-DD}` etags can be answered from the cheap conditional read.
const etagVersion = (etag: string) => {
  const m = /^(\d{1,15})-\d{4}-\d{2}-\d{2}$/.exec(etag)
  return m ? Number(m[1]) : null
}

const notModified = (etag: string) => new Response(null, { status: 304, headers: { 'Cache-Control': 'no-store', ETag: `"${etag}"` } })

export async function GET(req: Request, ctx: RouteContext<'/api/events/[id]'>) {
  const { id } = await ctx.params
  if (!isEventId(id)) return apiError('not_found')
  return handle('GET /api/events/[id]', async () => {
    // Reads never write: a scanner that keeps missing is turned away in memory, before any database read.
    if (readMissBlocked(req)) {
      const retry = readMissRetryAfter()
      return apiError('rate_limited', rateLimitedMessage(retry), { 'Retry-After': String(retry) })
    }
    const auth = readAuth(req)
    // The etag covers the version and today's date in the event tz, so a tab left open past midnight with no
    // new writes still gets fresh isPast / ranking / hero.
    const ifNoneMatch = parseEtag(req.headers.get('if-none-match'))
    const known = ifNoneMatch ? etagVersion(ifNoneMatch) : null
    let state
    if (known !== null) {
      const r = await getEventStateIfChanged(id, auth, known)
      if (r.kind === 'missing') return miss(req)
      if (r.kind === 'unchanged') {
        if (r.etag === ifNoneMatch) return notModified(r.etag)
        state = await getEventState(id, auth) // same version, but the date rolled over (rare): full read
      } else {
        state = r.state
      }
    } else {
      state = await getEventState(id, auth)
    }
    if (!state) return miss(req)
    return json(state, 200, { ETag: `"${state.etag}"` })
  })
}

function miss(req: Request): Response {
  noteReadMiss(req)
  return apiError('not_found')
}

export async function PATCH(req: Request, ctx: RouteContext<'/api/events/[id]'>) {
  const { id } = await ctx.params
  if (!isEventId(id)) return apiError('not_found')
  return handle('PATCH /api/events/[id]', async () => {
    const auth = readAuth(req)
    const octx = await authorizeOrganiser(id, auth, { limits: limitStatements(req, ['organiser'], id) })
    const input = await parseJson(req, PatchEventInput)
    return json(await patchEvent(octx, input, auth))
  })
}
