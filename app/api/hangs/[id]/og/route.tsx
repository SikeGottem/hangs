// Dynamic OG image for /h/[id]. Served as the Messenger / iMessage / WhatsApp /
// Twitter / Slack link preview. Must look like a poster, not a form — the
// research flagged "ugly enough to embarrass the sender" as the #1 reason
// group-planning tools die. Optimised for 1200×630 social card slots.
import { ImageResponse } from '@vercel/og'
import { getDb, ensureSchema } from '@/lib/db'

const BG = '#FAF8F3'
const SURFACE = '#FFFFFF'
const ACCENT = '#F5C842'
const TEXT_PRIMARY = '#1A1A1A'
const TEXT_SECONDARY = '#6B6B6B'
const TEXT_MUTED = '#A3A3A3'
const BORDER = '#E8E3D9'
const FREE_LIGHT = '#E8F8EE'
const FREE_TEXT = '#1a7a3a'

function formatDateStr(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return ''
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`
}

function formatHourStr(h: number | null | undefined): string {
  if (h == null) return ''
  if (h === 0) return '12am'
  if (h < 12) return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  await ensureSchema()

  const [hangRes, pRes, actRes] = await db.batch(
    [
      { sql: 'SELECT * FROM hangs WHERE id = ?', args: [id] },
      { sql: 'SELECT COUNT(*) as cnt FROM participants WHERE hang_id = ?', args: [id] },
      { sql: 'SELECT name FROM activities WHERE hang_id = ? ORDER BY id LIMIT 4', args: [id] },
    ],
    'read',
  )
  const hang = hangRes.rows[0] as any
  const participantCount = (pRes.rows[0]?.cnt as number) || 0
  const activities = actRes.rows.map(r => r.name as string).filter(Boolean)

  if (!hang) {
    return new ImageResponse(
      (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '100%', height: '100%',
          background: BG,
          fontSize: 72, fontWeight: 800, color: TEXT_PRIMARY,
          letterSpacing: '-0.04em',
        }}>
          hangs
        </div>
      ),
      { width: 1200, height: 630 },
    )
  }

  const isConfirmed = hang.status === 'confirmed'
  const dateMode = hang.date_mode as string | null
  const selectedDates = dateMode === 'specific' && hang.selected_dates
    ? (() => { try { return JSON.parse(hang.selected_dates) as string[] } catch { return [] } })()
    : []

  // Figure out the "when" string depending on status / mode
  let whenStr = ''
  if (isConfirmed && hang.confirmed_date) {
    const datePart = formatDateStr(hang.confirmed_date)
    const timePart = formatHourStr(hang.confirmed_hour)
    whenStr = timePart ? `${datePart} · ${timePart}` : datePart
  } else if (dateMode === 'specific' && selectedDates.length > 0) {
    const sorted = [...selectedDates].sort()
    whenStr = sorted.length === 1
      ? formatDateStr(sorted[0])
      : `${formatDateStr(sorted[0])} → ${formatDateStr(sorted[sorted.length - 1])}`
  } else if (hang.date_range_start && hang.date_range_end) {
    whenStr = `${formatDateStr(hang.date_range_start)} → ${formatDateStr(hang.date_range_end)}`
  }

  // Truncate long names to fit the 1200-wide poster at 96px
  const displayName = (hang.name as string).length > 42
    ? (hang.name as string).slice(0, 40) + '…'
    : (hang.name as string)

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
        {/* Accent stripe top-left */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0,
          width: 16, height: '100%',
          background: ACCENT,
        }} />

        {/* Subtle border paper feel */}
        <div style={{
          position: 'absolute',
          top: 24, left: 40, right: 24, bottom: 24,
          border: `2px solid ${BORDER}`,
          borderRadius: 20,
        }} />

        {/* Header row: wordmark + status pill */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '72px 96px 0 96px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            fontSize: 36,
            fontWeight: 800,
            color: TEXT_PRIMARY,
            letterSpacing: '-0.04em',
          }}>
            hangs
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            padding: '10px 22px',
            borderRadius: 999,
            background: isConfirmed ? FREE_LIGHT : SURFACE,
            border: `2px solid ${isConfirmed ? FREE_TEXT : BORDER}`,
            fontSize: 24,
            fontWeight: 800,
            color: isConfirmed ? FREE_TEXT : TEXT_SECONDARY,
            letterSpacing: '0.02em',
          }}>
            {isConfirmed ? 'LOCKED IN' : 'PLANNING'}
          </div>
        </div>

        {/* Body: hang name + meta */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          padding: '48px 96px 0 96px',
          justifyContent: 'center',
        }}>
          <div style={{
            display: 'flex',
            fontSize: 96,
            fontWeight: 800,
            color: TEXT_PRIMARY,
            letterSpacing: '-0.045em',
            lineHeight: 1,
            marginBottom: 32,
          }}>
            {displayName}
          </div>

          {whenStr && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              fontSize: 38,
              fontWeight: 700,
              color: isConfirmed ? TEXT_PRIMARY : TEXT_SECONDARY,
              marginBottom: 22,
            }}>
              {whenStr}
            </div>
          )}

          {hang.location && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              fontSize: 30,
              color: TEXT_SECONDARY,
              marginBottom: 28,
            }}>
              📍 {((hang.location as string).startsWith('http') ? 'Location attached' : (hang.location as string).slice(0, 60))}
            </div>
          )}

          {/* Activity chips (only when not yet confirmed — gives preview) */}
          {!isConfirmed && activities.length > 0 && (
            <div style={{
              display: 'flex',
              gap: 12,
              marginTop: 8,
            }}>
              {activities.slice(0, 4).map((a, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 22px',
                  background: SURFACE,
                  border: `2px solid ${BORDER}`,
                  borderRadius: 14,
                  fontSize: 26,
                  fontWeight: 700,
                  color: TEXT_PRIMARY,
                }}>
                  {a.length > 18 ? a.slice(0, 17) + '…' : a}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer row: creator + participant count */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 96px 72px 96px',
          fontSize: 28,
          color: TEXT_MUTED,
        }}>
          <div style={{ display: 'flex' }}>
            {hang.creator_name ? `by ${hang.creator_name}` : ''}
          </div>
          <div style={{ display: 'flex' }}>
            {participantCount} {participantCount === 1 ? 'person' : 'people'} joined
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  )
}
