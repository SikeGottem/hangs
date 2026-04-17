// GET /api/notifications — list the current user's notifications (last 30 days)
// POST /api/notifications/mark-all-read — clear unread count

import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { serverError, unauthorized } from '@/lib/errors'

export async function GET(req: Request) {
  try {
    const claims = await requireUser(req)
    if (!claims) return unauthorized('Sign in first')

    const db = getDb()
    await ensureSchema()

    const res = await db.execute({
      sql: `SELECT id, crew_id, hang_id, type, text, url, read_at, created_at
            FROM notifications
            WHERE user_id = ?
              AND created_at > datetime('now', '-30 days')
            ORDER BY created_at DESC
            LIMIT 50`,
      args: [claims.sub],
    })

    const rows = res.rows
    const unreadCount = rows.filter(r => !r.read_at).length

    return NextResponse.json({
      unreadCount,
      items: rows.map(r => ({
        id: r.id,
        crewId: r.crew_id,
        hangId: r.hang_id,
        type: r.type,
        text: r.text,
        url: r.url,
        read: !!r.read_at,
        createdAt: r.created_at,
      })),
    })
  } catch (e) {
    return serverError(e, 'GET /api/notifications')
  }
}

export async function POST(req: Request) {
  try {
    const claims = await requireUser(req)
    if (!claims) return unauthorized('Sign in first')

    const db = getDb()
    await ensureSchema()

    await db.execute({
      sql: "UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL",
      args: [claims.sub],
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return serverError(e, 'POST /api/notifications (mark all read)')
  }
}
