// Public crew invitation page; reads crew details and exposes a valid invite link.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getDb, ensureSchema } from '@/lib/db'
import styles from '@/app/product.module.css'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ join?: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const db = getDb()
  await ensureSchema()
  const res = await db.execute({ sql: 'SELECT name, description FROM crews WHERE slug = ?', args: [slug] })
  const crew = res.rows[0]
  if (!crew) return { title: 'Crew · hangs' }
  return { title: `${crew.name} · hangs`, description: (crew.description as string) || `Plan hangouts with ${crew.name}` }
}

export default async function PublicCrewPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { join } = await searchParams
  const db = getDb()
  await ensureSchema()
  const crewRes = await db.execute({
    sql: `SELECT id, name, description, cover_color, cover_emoji, public_invite_token FROM crews WHERE slug = ?`,
    args: [slug],
  })
  const crew = crewRes.rows[0]
  if (!crew) notFound()

  const crewId = crew.id as string
  const crewName = crew.name as string
  const coverColor = (crew.cover_color as string) || '#F5C842'
  const coverEmoji = (crew.cover_emoji as string) || ''
  const description = (crew.description as string) || ''
  const hasInviteLink = !!crew.public_invite_token
  const tokenMatches = hasInviteLink && join && join === (crew.public_invite_token as string)
  const [memberRes, hangsRes] = await db.batch([
    { sql: 'SELECT COUNT(*) as cnt FROM crew_members WHERE crew_id = ?', args: [crewId] },
    { sql: `SELECT id, name, confirmed_date, confirmed_hour, confirmed_activity FROM hangs WHERE crew_id = ? AND status = 'confirmed' AND confirmed_date < date('now') ORDER BY confirmed_date DESC LIMIT 3`, args: [crewId] },
  ], 'read')
  const memberCount = (memberRes.rows[0]?.cnt as number) || 0
  const pastHangs = hangsRes.rows

  return (
    <div className={styles.pageWide}>
      <section style={{ padding: 'clamp(2rem, 7vw, 5rem)', background: coverColor, borderRadius: 'var(--radius-xl)', color: 'var(--text-primary)', boxShadow: 'var(--shadow-md)' }} aria-labelledby="crew-name">
        <span className={styles.eyebrow} style={{ color: 'rgba(25, 24, 21, 0.66)' }}>An invitation to a crew</span>
        {coverEmoji && <div style={{ marginBottom: '1rem', fontSize: 'clamp(2.75rem, 7vw, 4.5rem)', lineHeight: 1 }} aria-hidden="true">{coverEmoji}</div>}
        <h1 id="crew-name" className={styles.titleLarge}>{crewName}</h1>
        <p className={styles.lede} style={{ color: 'rgba(25, 24, 21, 0.76)' }}>{description || 'A small group making time for the good stuff.'}</p>
        <p className={styles.meta} style={{ color: 'rgba(25, 24, 21, 0.72)', marginTop: '1.5rem' }}>{memberCount} {memberCount === 1 ? 'MEMBER' : 'MEMBERS'} ALREADY HERE</p>
      </section>

      <section className={styles.section} aria-labelledby="invite-heading">
        <div className={styles.sectionHeader}><h2 id="invite-heading" className={styles.sectionTitle}>Your way in</h2></div>
        {tokenMatches ? (
          <div className={styles.notice}>
            <p style={{ marginBottom: '1rem' }}>You&apos;ve got an invite. Join the crew to see its plans and make your own.</p>
            <Link href={`/c/${slug}/join?token=${encodeURIComponent(join!)}`} className="btn-primary" style={{ width: 'auto' }}>Join this crew</Link>
          </div>
        ) : (
          <div className={styles.notice}>
            {hasInviteLink ? 'This crew is invite-only. Use the link you were sent.' : 'This crew isn’t open for public joins right now.'}
          </div>
        )}
      </section>

      <section className={styles.section} aria-labelledby="past-hangs-heading">
        <div className={styles.sectionHeader}><h2 id="past-hangs-heading" className={styles.sectionTitle}>Past hangs</h2></div>
        {pastHangs.length > 0 ? <div className={styles.list}>{pastHangs.map(hang => (
          <article key={hang.id as string} className={styles.listRow}>
            <div><h3 className={styles.listTitle}>{hang.name as string}</h3><p className={styles.meta}>{hang.confirmed_date as string}{hang.confirmed_activity ? ` · ${hang.confirmed_activity}` : ''}</p></div>
            <span className={styles.arrow} aria-hidden="true">↗</span>
          </article>
        ))}</div> : <div className={styles.empty}><strong>No stories here yet.</strong><p>Once the crew confirms a hang, its past plans will show up here.</p></div>}
      </section>
    </div>
  )
}
