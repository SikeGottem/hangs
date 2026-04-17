// /api/hangs/[id]/polls — GET (public, batched — fixes N+1), POST (token-authenticated)
import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { PollsSchema, parseBody } from '@/lib/schemas'
import { serverError, badRequest, unauthorized } from '@/lib/errors'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    await ensureSchema()

    // Three parallel queries instead of the old N+1 loop.
    const [pollsRes, optsRes, votersRes] = await db.batch(
      [
        { sql: 'SELECT * FROM polls WHERE hang_id = ? ORDER BY created_at DESC', args: [id] },
        {
          sql: `SELECT po.id, po.poll_id, po.text,
                (SELECT COUNT(*) FROM poll_votes pv WHERE pv.poll_option_id = po.id) as votes
                FROM poll_options po
                JOIN polls p ON p.id = po.poll_id
                WHERE p.hang_id = ?`,
          args: [id],
        },
        {
          sql: `SELECT pv.poll_option_id, p.name, po.poll_id FROM poll_votes pv
                JOIN participants p ON p.id = pv.participant_id
                JOIN poll_options po ON po.id = pv.poll_option_id
                JOIN polls pl ON pl.id = po.poll_id
                WHERE pl.hang_id = ?`,
          args: [id],
        },
      ],
      'read',
    )

    const optionsByPoll: Record<number, any[]> = {}
    for (const o of optsRes.rows) {
      const pid = o.poll_id as number
      if (!optionsByPoll[pid]) optionsByPoll[pid] = []
      optionsByPoll[pid].push({ id: o.id, text: o.text, votes: o.votes || 0 })
    }
    const votersByPoll: Record<number, any[]> = {}
    for (const v of votersRes.rows) {
      const pid = v.poll_id as number
      if (!votersByPoll[pid]) votersByPoll[pid] = []
      votersByPoll[pid].push({ poll_option_id: v.poll_option_id, name: v.name })
    }

    const result = pollsRes.rows.map(p => ({
      ...p,
      options: optionsByPoll[p.id as number] || [],
      voters: votersByPoll[p.id as number] || [],
    }))
    return NextResponse.json(result)
  } catch (e) {
    return serverError(e, 'GET /polls')
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const raw = await req.json()
    const auth = await requireAuth(req, id, raw)
    if (!auth) return unauthorized()

    const parsed = parseBody(raw, PollsSchema)
    if ('error' in parsed) return badRequest(parsed.error)
    const body = parsed.data

    const db = getDb()
    await ensureSchema()

    if (body.action === 'create') {
      // Stamp crew_id so polls roll up into crew view.
      const crewIdRow = await db.execute({ sql: 'SELECT crew_id FROM hangs WHERE id = ?', args: [id] })
      const crewId = (crewIdRow.rows[0]?.crew_id as string | null) || null
      const res = await db.execute({
        sql: 'INSERT INTO polls (hang_id, crew_id, question, created_by) VALUES (?, ?, ?, ?)',
        args: [id, crewId, body.question, auth.sub],
      })
      const pollId = Number(res.lastInsertRowid)
      await db.batch(
        body.options.map(opt => ({
          sql: 'INSERT INTO poll_options (poll_id, text) VALUES (?, ?)',
          args: [pollId, opt],
        })),
        'write',
      )
    } else if (body.action === 'vote') {
      // Overwrite: delete any prior vote from this participant on this poll, then insert.
      const optRes = await db.execute({
        sql: 'SELECT poll_id FROM poll_options WHERE id = ?',
        args: [body.optionId],
      })
      const pollId = optRes.rows[0]?.poll_id
      if (pollId == null) return badRequest('Invalid option')
      await db.batch(
        [
          {
            sql: 'DELETE FROM poll_votes WHERE participant_id = ? AND poll_option_id IN (SELECT id FROM poll_options WHERE poll_id = ?)',
            args: [auth.sub, pollId],
          },
          {
            sql: 'INSERT INTO poll_votes (poll_option_id, participant_id) VALUES (?, ?)',
            args: [body.optionId, auth.sub],
          },
        ],
        'write',
      )
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return serverError(e, 'POST /polls')
  }
}
