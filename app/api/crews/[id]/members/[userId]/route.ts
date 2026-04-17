// PATCH /api/crews/[id]/members/[userId] — update a member's profile.
//   - Self-edit: any member can update their own profile except role
//   - Exec-edit: execs can update any member including role
// DELETE — exec-only; removes a member from the crew.

import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { UpdateMemberProfileSchema, parseBody } from '@/lib/schemas'
import { badRequest, serverError, unauthorized, notFound, forbidden } from '@/lib/errors'

type RouteParams = Promise<{ id: string; userId: string }>

export async function PATCH(req: Request, { params }: { params: RouteParams }) {
  try {
    const { id: crewId, userId: targetUserId } = await params
    const claims = await requireUser(req)
    if (!claims) return unauthorized('Sign in first')

    const body = await req.json().catch(() => null)
    const parsed = parseBody(body, UpdateMemberProfileSchema)
    if ('error' in parsed) return badRequest(parsed.error)

    const db = getDb()
    await ensureSchema()

    const meRes = await db.execute({
      sql: 'SELECT role FROM crew_members WHERE crew_id = ? AND user_id = ?',
      args: [crewId, claims.sub],
    })
    const myRole = meRes.rows[0]?.role as string | undefined
    if (!myRole) return notFound('Crew not found')

    const isSelf = claims.sub === targetUserId
    const isExec = myRole === 'exec'

    if (!isSelf && !isExec) return forbidden('You can only update your own profile')

    // Non-execs can't change role even for themselves
    if (parsed.data.role !== undefined && !isExec) {
      return forbidden('Only execs can change roles')
    }

    const d = parsed.data
    const fields: string[] = []
    const args: (string | null)[] = []
    if (d.displayName !== undefined) { fields.push('display_name = ?'); args.push(d.displayName) }
    if (d.dietary !== undefined) { fields.push('dietary = ?'); args.push(d.dietary || null) }
    if (d.transportPreference !== undefined) { fields.push('transport_preference = ?'); args.push(d.transportPreference === 'none' ? null : d.transportPreference) }
    if (d.contactPhone !== undefined) { fields.push('contact_phone = ?'); args.push(d.contactPhone || null) }
    if (d.notes !== undefined) { fields.push('notes = ?'); args.push(d.notes || null) }
    if (d.role !== undefined) { fields.push('role = ?'); args.push(d.role) }
    if (d.availabilityShape !== undefined) {
      // Strip 'busy' entries before persisting (default state; saves bytes).
      const cleaned: Record<string, string> = {}
      for (const [k, v] of Object.entries(d.availabilityShape)) {
        if (v && v !== 'busy') cleaned[k] = v
      }
      fields.push('availability_shape = ?')
      args.push(Object.keys(cleaned).length ? JSON.stringify(cleaned) : null)
    }

    if (!fields.length) return badRequest('No fields to update')
    fields.push("updated_at = datetime('now')")
    args.push(crewId, targetUserId)

    await db.execute({
      sql: `UPDATE crew_members SET ${fields.join(', ')} WHERE crew_id = ? AND user_id = ?`,
      args,
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return serverError(e, 'PATCH /api/crews/[id]/members/[userId]')
  }
}

export async function DELETE(req: Request, { params }: { params: RouteParams }) {
  try {
    const { id: crewId, userId: targetUserId } = await params
    const claims = await requireUser(req)
    if (!claims) return unauthorized('Sign in first')

    const db = getDb()
    await ensureSchema()

    const meRes = await db.execute({
      sql: 'SELECT role FROM crew_members WHERE crew_id = ? AND user_id = ?',
      args: [crewId, claims.sub],
    })
    const myRole = meRes.rows[0]?.role as string | undefined
    if (!myRole) return notFound('Crew not found')
    if (myRole !== 'exec') return forbidden('Only execs can remove members')

    // Don't let an exec remove themselves if they're the only exec — avoid orphaning the crew.
    if (claims.sub === targetUserId) {
      const otherExecs = await db.execute({
        sql: `SELECT COUNT(*) as cnt FROM crew_members
              WHERE crew_id = ? AND role = 'exec' AND user_id != ?`,
        args: [crewId, claims.sub],
      })
      if ((otherExecs.rows[0]?.cnt as number) === 0) {
        return badRequest('Promote another exec before leaving — the crew needs at least one')
      }
    }

    await db.execute({
      sql: 'DELETE FROM crew_members WHERE crew_id = ? AND user_id = ?',
      args: [crewId, targetUserId],
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return serverError(e, 'DELETE /api/crews/[id]/members/[userId]')
  }
}
