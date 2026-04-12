import { ImageResponse } from '@vercel/og'
import { getDb, ensureSchema } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  await ensureSchema()
  const hangRes = await db.execute({ sql: 'SELECT * FROM hangs WHERE id = ?', args: [id] })
  const hang = hangRes.rows[0] as any
  const pRes = await db.execute({ sql: 'SELECT COUNT(*) as cnt FROM participants WHERE hang_id = ?', args: [id] })
  const participantCount = (pRes.rows[0].cnt as number) || 0

  if (!hang) {
    return new ImageResponse(
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: '#FAF8F3', fontSize: 32, fontWeight: 700 }}>hangs</div>,
      { width: 1200, height: 630 }
    )
  }

  const isConfirmed = hang.status === 'confirmed'

  return new ImageResponse(
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%', height: '100%', background: '#FAF8F3', padding: '60px 80px' }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.03em', marginBottom: 40 }}>hangs</div>
      <div style={{ fontSize: 64, fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 20 }}>{hang.name}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 28, color: '#6B6B6B' }}>
        <span>{participantCount} people</span>
        <span style={{ color: '#E8E3D9' }}>|</span>
        <span>{hang.date_range_start} to {hang.date_range_end}</span>
      </div>
      {isConfirmed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 30, padding: '12px 24px', background: '#F5C842', borderRadius: 12, fontSize: 24, fontWeight: 700, color: '#1A1A1A', alignSelf: 'flex-start' }}>
          {hang.confirmed_activity || 'Plan confirmed'}
        </div>
      )}
      <div style={{ position: 'absolute', bottom: 50, left: 80, right: 80, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 22, color: '#A3A3A3' }}>
        <span>Created by {hang.creator_name}</span>
      </div>
    </div>,
    { width: 1200, height: 630 }
  )
}
