import { getDb, ensureSchema } from '@/lib/db'

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
    const description = `${hang.creator_name} is planning a hangout! ${participantCount} people joined. Tap to add your availability.`

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
