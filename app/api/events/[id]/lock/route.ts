// POST /api/events/[id]/lock: organiser locks a day (or changes day/time/place); DELETE unlocks, keeping answers.
import { apiError } from '@/lib/errors'
import { authorizeOrganiser, lockEvent, unlockEvent } from '@/lib/events'
import { handle, json, parseJson, readAuth } from '@/lib/http'
import { isEventId } from '@/lib/ids'
import { limitStatements } from '@/lib/ratelimit'
import { LockInput } from '@/lib/schemas'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctx: RouteContext<'/api/events/[id]/lock'>) {
  const { id } = await ctx.params
  if (!isEventId(id)) return apiError('not_found')
  return handle('POST /api/events/[id]/lock', async () => {
    const auth = readAuth(req)
    const octx = await authorizeOrganiser(id, auth, { limits: limitStatements(req, ['organiser'], id) })
    const input = await parseJson(req, LockInput)
    return json(await lockEvent(octx, input, auth))
  })
}

export async function DELETE(req: Request, ctx: RouteContext<'/api/events/[id]/lock'>) {
  const { id } = await ctx.params
  if (!isEventId(id)) return apiError('not_found')
  return handle('DELETE /api/events/[id]/lock', async () => {
    const auth = readAuth(req)
    const octx = await authorizeOrganiser(id, auth, { limits: limitStatements(req, ['organiser'], id) })
    return json(await unlockEvent(octx, auth))
  })
}
