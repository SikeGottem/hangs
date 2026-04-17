// PATCH /api/notifications/[id] — mark a single notification read

import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { serverError, unauthorized, notFound } from '@/lib/errors'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const claims = await requireUser(req)
    if (!claims) return unauthorized('Sign in first')

    const db = getDb()
    await ensureSchema()

    // Only update if owned by caller — prevents marking someone else's notification read
    const res = await db.execute({
      sql: "UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ? AND read_at IS NULL",
      args: [id, claims.sub],
    })

    if (res.rowsAffected === 0) {
      // Either doesn't exist, already read, or not owned — respond idempotently
      const exists = await db.execute({
        sql: 'SELECT id FROM notifications WHERE id = ? AND user_id = ?',
        args: [id, claims.sub],
      })
      if (!exists.rows[0]) return notFound()
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return serverError(e, 'PATCH /api/notifications/[id]')
  }
}
