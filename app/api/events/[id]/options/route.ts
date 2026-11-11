// PUT /api/events/[id]/options: organiser sets the full list of candidate dates (adds/removes options and their answers).
import { apiError } from '@/lib/errors'
import { authorizeOrganiser, setEventDates } from '@/lib/events'
import { handle, json, parseJson, readAuth } from '@/lib/http'
import { isEventId } from '@/lib/ids'
import { limitStatements } from '@/lib/ratelimit'
import { SetDatesInput } from '@/lib/schemas'

export const dynamic = 'force-dynamic'

export async function PUT(req: Request, ctx: RouteContext<'/api/events/[id]/options'>) {
  const { id } = await ctx.params
  if (!isEventId(id)) return apiError('not_found')
  return handle('PUT /api/events/[id]/options', async () => {
    const auth = readAuth(req)
    const octx = await authorizeOrganiser(id, auth, { limits: limitStatements(req, ['organiser'], id) })
    const input = await parseJson(req, SetDatesInput)
    return json(await setEventDates(octx, input.dates, auth))
  })
}
