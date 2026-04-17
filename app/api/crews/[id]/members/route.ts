// POST /api/crews/[id]/members — invite by email (exec-only).

import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { InviteMembersSchema, parseBody } from '@/lib/schemas'
import { badRequest, serverError, unauthorized, notFound, forbidden } from '@/lib/errors'
import { inviteToCrew } from '../../route'
import { logEvent } from '@/lib/analytics'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const claims = await requireUser(req)
    if (!claims) return unauthorized('Sign in first')

    const body = await req.json().catch(() => null)
    const parsed = parseBody(body, InviteMembersSchema)
    if ('error' in parsed) return badRequest(parsed.error)

    const db = getDb()
    await ensureSchema()

    const [crewRes, meRes] = await db.batch([
      { sql: 'SELECT name FROM crews WHERE id = ?', args: [id] },
      {
        sql: `SELECT cm.role, u.email, u.display_name
              FROM crew_members cm JOIN users u ON u.id = cm.user_id
              WHERE cm.crew_id = ? AND cm.user_id = ?`,
        args: [id, claims.sub],
      },
    ], 'read')

    const crewName = crewRes.rows[0]?.name as string | undefined
    if (!crewName) return notFound('Crew not found')

    const me = meRes.rows[0]
    if (!me) return forbidden('Not a member')
    if (me.role !== 'exec') return forbidden('Only execs can invite')

    const inviterName = (me.display_name as string | null) || (me.email as string).split('@')[0]
    const origin = new URL(req.url).origin
    const results: { email: string; ok: boolean; reason?: string }[] = []

    for (const raw of parsed.data.emails) {
      const email = raw.trim().toLowerCase()
      if (!email) continue
      try {
        await inviteToCrew(db, { email, crewId: id, crewName, inviterName, origin })
        results.push({ email, ok: true })
        logEvent('member_invited', { userId: claims.sub, crewId: id, metadata: { email } })
      } catch (e: any) {
        results.push({ email, ok: false, reason: e?.message })
      }
    }

    return NextResponse.json({ invited: results })
  } catch (e) {
    return serverError(e, 'POST /api/crews/[id]/members')
  }
}
