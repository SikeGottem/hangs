// POST /api/events/[id]/people: join a hang with a name (and any held answers); returns the new person token.
import { apiError } from '@/lib/errors'
import { joinEvent, prepareJoin } from '@/lib/events'
import { handle, json, parseJson, readAuth } from '@/lib/http'
import { isEventId } from '@/lib/ids'
import { limitStatements } from '@/lib/ratelimit'
import { JoinInput } from '@/lib/schemas'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctx: RouteContext<'/api/events/[id]/people'>) {
  const { id } = await ctx.params
  if (!isEventId(id)) return apiError('not_found')
  return handle('POST /api/events/[id]/people', async () => {
    const jctx = await prepareJoin(id, { limits: limitStatements(req, ['join_ip', 'join'], id) })
    const input = await parseJson(req, JoinInput)
    return json(await joinEvent(jctx, input, readAuth(req)), 201)
  })
}
