// /api/hangs/[id]/recap — 1080×1920 Instagram-Story-sized post-hang summary.
// Rendered server-side via @vercel/og. Linked from the results page once
// confirmed_date has passed.

import { ImageResponse } from '@vercel/og'
import { getDb, ensureSchema } from '@/lib/db'

const BG = '#FAF8F3'
const ACCENT = '#F5C842'
const TEXT_PRIMARY = '#1A1A1A'
const TEXT_SECONDARY = '#6B6B6B'
const TEXT_MUTED = '#A3A3A3'
const BORDER = '#E8E3D9'

function formatDateStr(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return ''
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  await ensureSchema()

  const [hangRes, partRes, commitRes, photoRes] = await db.batch([
    { sql: 'SELECT * FROM hangs WHERE id = ?', args: [id] },
    { sql: 'SELECT COUNT(*) as cnt FROM participants WHERE hang_id = ?', args: [id] },
    { sql: "SELECT COUNT(*) as cnt FROM commitment WHERE hang_id = ? AND level = 'in'", args: [id] },
    { sql: 'SELECT COUNT(*) as cnt FROM photos WHERE hang_id = ?', args: [id] },
  ], 'read')

  const hang = hangRes.rows[0] as any
  const totalPeople = (partRes.rows[0]?.cnt as number) || 0
  const wentCount = (commitRes.rows[0]?.cnt as number) || 0
  const photoCount = (photoRes.rows[0]?.cnt as number) || 0

  let crewBrand: { name: string; color: string; emoji: string } | null = null
  if (hang?.crew_id) {
    const crewRes = await db.execute({
      sql: 'SELECT name, cover_color, cover_emoji FROM crews WHERE id = ?',
      args: [hang.crew_id as string],
    })
    const row = crewRes.rows[0]
    if (row) {
      crewBrand = {
        name: row.name as string,
        color: (row.cover_color as string) || ACCENT,
        emoji: (row.cover_emoji as string) || '',
      }
    }
  }

  const dateStr = hang?.confirmed_date ? formatDateStr(hang.confirmed_date) : ''
  const activity = (hang?.confirmed_activity as string) || ''
  const hangName = (hang?.name as string) || 'hangs'
  const displayName = hangName.length > 32 ? hangName.slice(0, 30) + '…' : hangName

  return new ImageResponse(
    (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: BG,
        fontFamily: 'sans-serif',
        position: 'relative',
      }}>
        {/* Color band top */}
        <div style={{
          width: '100%', height: 200,
          background: crewBrand?.color || ACCENT,
          display: 'flex',
          alignItems: 'flex-end',
          padding: '0 60px 40px 60px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            fontSize: 52,
            fontWeight: 800,
            color: '#1A1A1A',
            letterSpacing: '-0.03em',
          }}>
            {crewBrand?.emoji ? <span>{crewBrand.emoji}</span> : null}
            <span>{crewBrand?.name || 'hangs'}</span>
          </div>
        </div>

        {/* Body */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          padding: '80px 60px',
          justifyContent: 'center',
        }}>
          <div style={{
            display: 'flex',
            fontSize: 36,
            fontWeight: 600,
            color: TEXT_MUTED,
            marginBottom: 24,
          }}>
            RECAP
          </div>
          <div style={{
            display: 'flex',
            fontSize: 116,
            fontWeight: 800,
            color: TEXT_PRIMARY,
            letterSpacing: '-0.045em',
            lineHeight: 1,
            marginBottom: 48,
          }}>
            {displayName}
          </div>
          {dateStr && (
            <div style={{
              display: 'flex',
              fontSize: 54,
              fontWeight: 700,
              color: TEXT_SECONDARY,
              marginBottom: 16,
            }}>
              {dateStr}
            </div>
          )}
          {activity && (
            <div style={{
              display: 'flex',
              fontSize: 48,
              fontWeight: 600,
              color: TEXT_SECONDARY,
              marginBottom: 80,
            }}>
              {activity}
            </div>
          )}

          {/* Stats */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <StatRow value={`${wentCount}/${totalPeople}`} label="went" />
            {photoCount > 0 && <StatRow value={String(photoCount)} label={photoCount === 1 ? 'photo' : 'photos'} />}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '40px 60px',
          borderTop: `2px solid ${BORDER}`,
          fontSize: 32,
          color: TEXT_MUTED,
          fontWeight: 700,
        }}>
          <div style={{ display: 'flex' }}>hangs</div>
        </div>
      </div>
    ),
    { width: 1080, height: 1920 },
  )
}

function StatRow({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 24 }}>
      <div style={{ fontFamily: 'sans-serif', fontSize: 108, fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.04em' }}>
        {value}
      </div>
      <div style={{ fontSize: 42, fontWeight: 600, color: '#6B6B6B' }}>
        {label}
      </div>
    </div>
  )
}
