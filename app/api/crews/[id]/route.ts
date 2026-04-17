// PATCH /api/crews/[id] — update crew metadata. Exec-only.

import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { UpdateCrewSchema, parseBody } from '@/lib/schemas'
import { badRequest, serverError, unauthorized, notFound, forbidden } from '@/lib/errors'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const claims = await requireUser(req)
    if (!claims) return unauthorized('Sign in first')

    const body = await req.json().catch(() => null)
    const parsed = parseBody(body, UpdateCrewSchema)
    if ('error' in parsed) return badRequest(parsed.error)

    const db = getDb()
    await ensureSchema()

    const roleRes = await db.execute({
      sql: 'SELECT role FROM crew_members WHERE crew_id = ? AND user_id = ?',
      args: [id, claims.sub],
    })
    const myRole = roleRes.rows[0]?.role as string | undefined
    if (!myRole) return notFound('Crew not found')
    if (myRole !== 'exec') return forbidden('Only execs can update crew settings')

    const fields: string[] = []
    const args: (string | null)[] = []
    const d = parsed.data
    if (d.name !== undefined) { fields.push('name = ?'); args.push(d.name) }
    if (d.description !== undefined) { fields.push('description = ?'); args.push(d.description || null) }
    if (d.slug !== undefined) { fields.push('slug = ?'); args.push(d.slug) }
    if (d.recurringRule !== undefined) {
      fields.push('recurring_rule = ?')
      args.push(d.recurringRule || null)
    }
    if (d.recurringTemplateHangId !== undefined) {
      fields.push('recurring_template_hang_id = ?')
      args.push(d.recurringTemplateHangId || null)
    }
    if (d.coverColor !== undefined) { fields.push('cover_color = ?'); args.push(d.coverColor || null) }
    if (d.coverEmoji !== undefined) { fields.push('cover_emoji = ?'); args.push(d.coverEmoji || null) }

    if (!fields.length) return badRequest('No fields to update')
    fields.push("updated_at = datetime('now')")
    args.push(id)

    await db.execute({
      sql: `UPDATE crews SET ${fields.join(', ')} WHERE id = ?`,
      args,
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return serverError(e, 'PATCH /api/crews/[id]')
  }
}
