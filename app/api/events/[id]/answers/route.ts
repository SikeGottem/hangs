// PUT /api/events/[id]/answers: save the caller's answers (null clears); unknown or past options are skipped. Two round trips.
import { apiError } from '@/lib/errors'
import { authorizePerson, saveAnswers } from '@/lib/events'
import { handle, json, parseJson, readAuth } from '@/lib/http'
import { isEventId } from '@/lib/ids'
import { limitStatements } from '@/lib/ratelimit'
import { SaveAnswersInput } from '@/lib/schemas'

export const dynamic = 'force-dynamic'

export async function PUT(req: Request, ctx: RouteContext<'/api/events/[id]/answers'>) {
  const { id } = await ctx.params
  if (!isEventId(id)) return apiError('not_found')
  return handle('PUT /api/events/[id]/answers', async () => {
    const auth = readAuth(req)
    const pctx = await authorizePerson(id, auth, { limits: limitStatements(req, ['write'], id) })
    const input = await parseJson(req, SaveAnswersInput)
    return json(await saveAnswers(pctx, input.answers, auth))
  })
}
