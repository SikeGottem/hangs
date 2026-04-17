// POST /api/hangs/[id]/join — returns participant token.
//
// Two paths:
//   1. Guest: body has `name` → create participant with that name, no user link.
//   2. Crew member: session cookie present + hang has crew_id + caller is a
//      member → name/dietary pulled from crew profile. Body `name` ignored.
//
// Idempotent for crew members: if they've already joined this hang, return
// the existing participant instead of creating a duplicate.

import { NextResponse } from 'next/server'
import { getDb, ensureSchema, genId } from '@/lib/db'
import { signParticipantToken, requireUser } from '@/lib/auth'
import { JoinSchema, parseBody } from '@/lib/schemas'
import { serverError, badRequest, notFound } from '@/lib/errors'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const raw = await req.json().catch(() => ({}))
    const parsed = parseBody(raw, JoinSchema)
    if ('error' in parsed) return badRequest(parsed.error)

    const db = getDb()
    await ensureSchema()

    const hangRes = await db.execute({
      sql: 'SELECT id, crew_id FROM hangs WHERE id = ?',
      args: [id],
    })
    const hang = hangRes.rows[0]
    if (!hang) return notFound()

    const hangCrewId = hang.crew_id as string | null
    const userClaims = hangCrewId ? await requireUser(req) : null

    // ── Path 1: crew member auto-join ──
    if (hangCrewId && userClaims) {
      const memberRes = await db.execute({
        sql: `SELECT display_name, dietary, availability_shape FROM crew_members
              WHERE crew_id = ? AND user_id = ?`,
        args: [hangCrewId, userClaims.sub],
      })
      const member = memberRes.rows[0]
      if (member) {
        const existing = await db.execute({
          sql: 'SELECT id, name, dietary FROM participants WHERE hang_id = ? AND user_id = ?',
          args: [id, userClaims.sub],
        })
        let participantId: string
        let displayName: string
        let dietary: string | null
        if (existing.rows[0]) {
          participantId = existing.rows[0].id as string
          displayName = existing.rows[0].name as string
          dietary = (existing.rows[0].dietary as string | null) || null
        } else {
          participantId = genId()
          displayName = (member.display_name as string) || userClaims.email.split('@')[0]
          dietary = (member.dietary as string | null) || null
          await db.execute({
            sql: 'INSERT INTO participants (id, hang_id, name, user_id, dietary) VALUES (?, ?, ?, ?, ?)',
            args: [participantId, id, displayName, userClaims.sub, dietary],
          })
        }
        const token = await signParticipantToken(participantId, id, false)
        let availabilityShape: Record<string, string> | null = null
        if (member.availability_shape) {
          try { availabilityShape = JSON.parse(member.availability_shape as string) } catch { /* ignore */ }
        }
        return NextResponse.json({
          participantId,
          token,
          prefilled: true,
          name: displayName,
          dietary,
          availabilityShape,
        })
      }
      // Logged-in but not a crew member → fall through to guest path (requires name)
    }

    // ── Path 2: guest ──
    const guestName = parsed.data.name
    if (!guestName) return badRequest('Name required')

    const participantId = genId()
    await db.execute({
      sql: 'INSERT INTO participants (id, hang_id, name, user_id) VALUES (?, ?, ?, ?)',
      args: [participantId, id, guestName, userClaims?.sub ?? null],
    })

    const token = await signParticipantToken(participantId, id, false)
    return NextResponse.json({ participantId, token, prefilled: false })
  } catch (e) {
    return serverError(e, 'POST /api/hangs/[id]/join')
  }
}
