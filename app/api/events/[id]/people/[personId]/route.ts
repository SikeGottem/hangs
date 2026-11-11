// DELETE /api/events/[id]/people/[personId]: organiser removes someone's response (never the organiser's own).
import { apiError } from '@/lib/errors'
import { authorizeOrganiser, removePerson } from '@/lib/events'
import { handle, json, readAuth } from '@/lib/http'
import { isEventId, isPersonId } from '@/lib/ids'
import { limitStatements } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'

export async function DELETE(req: Request, ctx: RouteContext<'/api/events/[id]/people/[personId]'>) {
  const { id, personId } = await ctx.params
  if (!isEventId(id)) return apiError('not_found')
  return handle('DELETE /api/events/[id]/people/[personId]', async () => {
    const auth = readAuth(req)
    const octx = await authorizeOrganiser(id, auth, { limits: limitStatements(req, ['organiser'], id) })
    if (!isPersonId(personId)) return apiError('not_found', "That person isn't part of this hang.")
    return json(await removePerson(octx, personId, auth))
  })
}
