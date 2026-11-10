// POST /api/events: create a hang (rate limited per IP); returns the organiser key, person token and state. Two round trips.
import { createEvent } from '@/lib/events'
import { handle, json, parseJson } from '@/lib/http'
import { checkCreateLimits } from '@/lib/ratelimit'
import { CreateEventInput } from '@/lib/schemas'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  return handle('POST /api/events', async () => {
    await checkCreateLimits(req)
    const input = await parseJson(req, CreateEventInput)
    return json(await createEvent(input), 201)
  })
}
