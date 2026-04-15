// POST /api/hangs/[id]/vote — bulk vote, token-authenticated
import { NextResponse } from 'next/server'
import { getDb, ensureSchema, getHangState } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { VoteSchema, parseBody } from '@/lib/schemas'
import { serverError, badRequest, unauthorized, forbidden, notFound } from '@/lib/errors'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const raw = await req.json()
    const auth = await requireAuth(req, id, raw)
    if (!auth) return unauthorized()

    const parsed = parseBody(raw, VoteSchema)
    if ('error' in parsed) return badRequest(parsed.error)
    const body = parsed.data

    const votes =
      body.votes ??
      (body.activityId && body.vote ? [{ activityId: body.activityId, vote: body.vote }] : [])
    if (votes.length === 0) return badRequest('No votes to record')

    const db = getDb()
    await ensureSchema()

    const state = await getHangState(id)
    if (!state.exists) return notFound()
    if (state.cancelled) return forbidden('This hang was cancelled')
    if (state.locked) return forbidden('Responses are locked for this hang')

    await db.batch(
      votes.map(v => ({
        sql: `INSERT INTO activity_votes (activity_id, participant_id, vote) VALUES (?, ?, ?)
              ON CONFLICT(activity_id, participant_id) DO UPDATE SET vote = excluded.vote`,
        args: [v.activityId, auth.sub, v.vote],
      })),
      'write',
    )

    return NextResponse.json({ success: true, count: votes.length })
  } catch (e) {
    return serverError(e, 'POST /vote')
  }
}
