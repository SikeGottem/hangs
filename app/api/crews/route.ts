// POST /api/crews — create a new crew. Creator becomes the first exec member.
// Optional initial member invites fan out as magic-link emails.

import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getDb, ensureSchema, genId } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { CreateCrewSchema, parseBody } from '@/lib/schemas'
import { badRequest, serverError, unauthorized } from '@/lib/errors'
import { sendMagicLink } from '@/lib/email'
import { logEvent } from '@/lib/analytics'

export async function POST(req: Request) {
  try {
    const claims = await requireUser(req)
    if (!claims) return unauthorized('Sign in first')

    const body = await req.json().catch(() => null)
    const parsed = parseBody(body, CreateCrewSchema)
    if ('error' in parsed) return badRequest(parsed.error)

    const { name, description, inviteEmails } = parsed.data

    const db = getDb()
    await ensureSchema()

    // Fetch the creator's display name for the invite emails
    const creatorRow = await db.execute({
      sql: 'SELECT email, display_name FROM users WHERE id = ?',
      args: [claims.sub],
    })
    const creatorEmail = creatorRow.rows[0]?.email as string | undefined
    const creatorDisplay =
      (creatorRow.rows[0]?.display_name as string | undefined) ||
      (creatorEmail ? creatorEmail.split('@')[0] : 'A friend')

    const crewId = genId(10)
    const membershipId = genId(10)
    const slug = slugify(name) + '-' + crewId.slice(0, 4)

    // Create crew + first member (creator as exec) atomically.
    await db.batch([
      {
        sql: 'INSERT INTO crews (id, name, description, slug, created_by) VALUES (?, ?, ?, ?, ?)',
        args: [crewId, name, description || null, slug, claims.sub],
      },
      {
        sql: `INSERT INTO crew_members (id, crew_id, user_id, display_name, role)
              VALUES (?, ?, ?, ?, 'exec')`,
        args: [membershipId, crewId, claims.sub, creatorDisplay],
      },
    ], 'write')

    // Fan out invites (best-effort — don't fail the whole request if one email errors).
    const origin = new URL(req.url).origin
    const inviteResults: { email: string; ok: boolean; reason?: string }[] = []
    if (inviteEmails?.length) {
      for (const raw of inviteEmails) {
        const email = raw.trim().toLowerCase()
        if (!email || email === creatorEmail) continue
        try {
          await inviteToCrew(db, { email, crewId, crewName: name, inviterName: creatorDisplay, origin })
          inviteResults.push({ email, ok: true })
        } catch (e: any) {
          console.warn('[hangs] invite failed for', email, e?.message)
          inviteResults.push({ email, ok: false, reason: e?.message })
        }
      }
    }

    logEvent('crew_created', { userId: claims.sub, crewId, metadata: { name, inviteCount: inviteResults.length } })
    for (const r of inviteResults) {
      if (r.ok) logEvent('member_invited', { userId: claims.sub, crewId, metadata: { email: r.email } })
    }

    return NextResponse.json({
      crew: { id: crewId, name, slug, description: description || null },
      invited: inviteResults,
    })
  } catch (e) {
    return serverError(e, 'POST /api/crews')
  }
}

function slugify(s: string): string {
  return (s || 'crew')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 34) || 'crew'
}

// Shared helper (exported for members route reuse).
export async function inviteToCrew(
  db: ReturnType<typeof getDb>,
  params: { email: string; crewId: string; crewName: string; inviterName: string; origin?: string },
) {
  // Find-or-create the invitee user
  const existing = await db.execute({
    sql: 'SELECT id FROM users WHERE email = ?',
    args: [params.email],
  })

  let userId: string
  if (existing.rows[0]) {
    userId = existing.rows[0].id as string
  } else {
    userId = randomBytes(8).toString('base64url').slice(0, 10)
    await db.execute({
      sql: 'INSERT INTO users (id, email) VALUES (?, ?)',
      args: [userId, params.email],
    })
  }

  // Add to crew if not already a member (silent no-op on unique violation).
  const alreadyMember = await db.execute({
    sql: 'SELECT 1 FROM crew_members WHERE crew_id = ? AND user_id = ?',
    args: [params.crewId, userId],
  })
  if (!alreadyMember.rows[0]) {
    await db.execute({
      sql: `INSERT INTO crew_members (id, crew_id, user_id, display_name, role)
            VALUES (?, ?, ?, ?, 'member')`,
      args: [genId(10), params.crewId, userId, params.email.split('@')[0]],
    })
  }

  // Issue a magic-link token scoped to land them in the crew
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString()
  await db.execute({
    sql: `INSERT INTO auth_tokens (token, user_id, email, purpose, crew_context, expires_at)
          VALUES (?, ?, ?, 'magic_link', ?, ?)`,
    args: [token, userId, params.email, `/crews/${params.crewId}/profile`, expiresAt],
  })

  await sendMagicLink({
    email: params.email,
    token,
    crewName: params.crewName,
    inviterName: params.inviterName,
    origin: params.origin,
  })
}
