// POST /api/hangs/[id]/send-link — email the creator their own hang link so
// they can recover it from any device without keeping the chat message.
// No auth required (anyone with the link can email it to themselves); the
// email only ever contains the public hang link, so there's nothing to leak.
import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'
import { SendLinkSchema, parseBody } from '@/lib/schemas'
import { serverError, badRequest, notFound } from '@/lib/errors'
import { sendHangLink } from '@/lib/email'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const raw = await req.json()
    const parsed = parseBody(raw, SendLinkSchema)
    if ('error' in parsed) return badRequest(parsed.error)

    const db = getDb()
    await ensureSchema()
    const res = await db.execute({ sql: 'SELECT name FROM hangs WHERE id = ?', args: [id] })
    const hang = res.rows[0]
    if (!hang) return notFound('Hang not found')

    const origin = new URL(req.url).origin
    const { emailed } = await sendHangLink({
      email: parsed.data.email,
      hangId: id,
      hangName: (hang.name as string) || 'your hang',
      origin,
    })

    return NextResponse.json({ emailed })
  } catch (e) {
    return serverError(e, 'POST /api/hangs/[id]/send-link')
  }
}
