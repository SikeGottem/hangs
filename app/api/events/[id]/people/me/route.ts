// PATCH /api/events/[id]/people/me: rename yourself (person token, or organiser key for the organiser's row).
import { apiError } from '@/lib/errors'
import { authorizePerson, renamePerson } from '@/lib/events'
import { handle, json, parseJson, readAuth } from '@/lib/http'
import { isEventId } from '@/lib/ids'
import { limitStatements } from '@/lib/ratelimit'
import { RenameInput } from '@/lib/schemas'

export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, ctx: RouteContext<'/api/events/[id]/people/me'>) {
  const { id } = await ctx.params
  if (!isEventId(id)) return apiError('not_found')
  return handle('PATCH /api/events/[id]/people/me', async () => {
    const auth = readAuth(req)
    const pctx = await authorizePerson(id, auth, { limits: limitStatements(req, ['write'], id) })
    const input = await parseJson(req, RenameInput)
    return json(await renamePerson(pctx, input.name, auth))
  })
}
