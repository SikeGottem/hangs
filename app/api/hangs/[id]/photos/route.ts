// /api/hangs/[id]/photos — GET (public), POST (token-authenticated) + magic-byte check
import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { PhotoSchema, parseBody } from '@/lib/schemas'
import { serverError, badRequest, unauthorized } from '@/lib/errors'

// Server-side magic-byte check as a backup to client-side EXIF stripping.
// Only accept JPEG and PNG base64 data URLs.
function isJpegOrPng(dataUrl: string): boolean {
  if (!dataUrl.startsWith('data:image/jpeg') && !dataUrl.startsWith('data:image/png')) {
    return false
  }
  const base64 = dataUrl.split(',')[1] || ''
  if (base64.length < 8) return false
  // JPEG: /9j/ (FF D8 FF)  |  PNG: iVBORw0 (89 50 4E 47 0D 0A 1A 0A)
  return base64.startsWith('/9j/') || base64.startsWith('iVBORw0')
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    await ensureSchema()
    const res = await db.execute({
      sql: 'SELECT ph.id, ph.data, ph.caption, ph.created_at, p.name as author FROM photos ph JOIN participants p ON p.id = ph.participant_id WHERE ph.hang_id = ? ORDER BY ph.created_at DESC',
      args: [id],
    })
    return NextResponse.json(res.rows)
  } catch (e) {
    return serverError(e, 'GET /photos')
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const raw = await req.json()
    const auth = await requireAuth(req, id, raw)
    if (!auth) return unauthorized()

    const parsed = parseBody(raw, PhotoSchema)
    if ('error' in parsed) return badRequest(parsed.error)
    const { data, caption } = parsed.data

    if (!isJpegOrPng(data)) return badRequest('Only JPEG or PNG images allowed')

    const db = getDb()
    await ensureSchema()
    // Stamp the crew_id so photos roll up into the crew album automatically.
    const crewIdRow = await db.execute({ sql: 'SELECT crew_id FROM hangs WHERE id = ?', args: [id] })
    const crewId = (crewIdRow.rows[0]?.crew_id as string | null) || null
    await db.execute({
      sql: 'INSERT INTO photos (hang_id, crew_id, participant_id, data, caption) VALUES (?, ?, ?, ?, ?)',
      args: [id, crewId, auth.sub, data, caption || null],
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    return serverError(e, 'POST /photos')
  }
}
