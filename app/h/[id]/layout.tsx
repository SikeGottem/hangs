import { getDb, ensureSchema } from '@/lib/db'

// Format confirmed_date + confirmed_hour into a short readable string
function formatConfirmedWhen(dateStr: string | null | undefined, hour: number | null | undefined): string {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return ''
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const datePart = `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`
  if (hour == null) return datePart
  const h = Number(hour)
  const timePart = h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`
  return `${datePart} · ${timePart}`
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const db = getDb()
    await ensureSchema()
    const [hangRes, pRes] = await db.batch(
      [
        { sql: 'SELECT * FROM hangs WHERE id = ?', args: [id] },
        { sql: 'SELECT COUNT(*) as cnt FROM participants WHERE hang_id = ?', args: [id] },
      ],
      'read',
    )
    const hang = hangRes.rows[0]
    const participantCount = (pRes.rows[0].cnt as number) || 0

    if (!hang) return { title: 'hangs' }

    const title = `${hang.name} — hangs`

    // Branch description: confirmed hangs surface the locked details so the
    // link preview in iMessage / Messenger tells people exactly what's happening.
    let description: string
    if (hang.status === 'confirmed') {
      const when = formatConfirmedWhen(hang.confirmed_date as string | null, hang.confirmed_hour as number | null)
      const location = hang.location as string | null
      const parts: string[] = ['It\'s locked in!']
      if (when) parts.push(when)
      if (location && !location.startsWith('http')) parts.push(location)
      parts.push('Tap for details + add to calendar.')
      description = parts.join(' · ').replace(' · Tap', '. Tap')
    } else {
      description = `${hang.creator_name} is planning a hangout! ${participantCount} people joined. Tap to add your availability.`
    }

    return {
      title, description,
      openGraph: { title: hang.name as string, description, images: [`/api/hangs/${id}/og`] },
      twitter: { card: 'summary_large_image' as const, title: hang.name as string, description, images: [`/api/hangs/${id}/og`] },
    }
  } catch {
    return { title: 'hangs' }
  }
}

export default function HangLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
