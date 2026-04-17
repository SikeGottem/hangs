// GET /api/me — current user + list of crews they belong to.
// Returns { user: null } when not logged in (200, not 401) so the frontend
// can gracefully render a guest state without a thrown error.

import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { serverError } from '@/lib/errors'

export async function GET(req: Request) {
  try {
    const claims = await requireUser(req)
    if (!claims) return NextResponse.json({ user: null, crews: [] })

    const db = getDb()
    await ensureSchema()

    const [userRes, crewsRes] = await db.batch([
      { sql: 'SELECT id, email, display_name FROM users WHERE id = ?', args: [claims.sub] },
      {
        sql: `SELECT c.id, c.name, c.slug, c.description,
                     cm.role, cm.display_name as member_name,
                     (SELECT COUNT(*) FROM crew_members cm2 WHERE cm2.crew_id = c.id) as member_count
              FROM crews c
              JOIN crew_members cm ON cm.crew_id = c.id
              WHERE cm.user_id = ?
              ORDER BY c.created_at DESC`,
        args: [claims.sub],
      },
    ], 'read')

    const user = userRes.rows[0]
    if (!user) return NextResponse.json({ user: null, crews: [] })

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
      },
      crews: crewsRes.rows.map(r => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        description: r.description,
        role: r.role,
        memberName: r.member_name,
        memberCount: r.member_count,
      })),
    })
  } catch (e) {
    return serverError(e, 'GET /api/me')
  }
}
