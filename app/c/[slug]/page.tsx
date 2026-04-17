// /c/[slug] — public crew landing page. No auth required.
// Shows crew name, emoji, color, last 3 confirmed hangs (anonymized), and a
// Join CTA if the caller has a valid ?join=<token> OR the crew has a public
// token active and matches the URL's token.
//
// This is the primary growth surface: shareable as a link in group chats,
// crew pages OG-preview nicely, converts a click into membership in 2 taps.

import { getDb, ensureSchema } from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ join?: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const db = getDb()
  await ensureSchema()
  const res = await db.execute({ sql: 'SELECT name, description FROM crews WHERE slug = ?', args: [slug] })
  const crew = res.rows[0]
  if (!crew) return { title: 'Crew · hangs' }
  return {
    title: `${crew.name} · hangs`,
    description: (crew.description as string) || `Plan hangouts with ${crew.name}`,
  }
}

export default async function PublicCrewPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { join } = await searchParams

  const db = getDb()
  await ensureSchema()

  const crewRes = await db.execute({
    sql: `SELECT id, name, description, cover_color, cover_emoji, public_invite_token
          FROM crews WHERE slug = ?`,
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
    {
      sql: `SELECT id, name, confirmed_date, confirmed_hour, confirmed_activity
            FROM hangs
            WHERE crew_id = ? AND status = 'confirmed' AND confirmed_date < date('now')
            ORDER BY confirmed_date DESC
            LIMIT 3`,
      args: [crewId],
    },
  ], 'read')

  const memberCount = (memberRes.rows[0]?.cnt as number) || 0
  const pastHangs = hangsRes.rows

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Cover band */}
      <div style={{
        width: '100%', padding: '56px 24px 40px',
        background: coverColor,
        color: '#1A1A1A',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 56, marginBottom: 8 }}>{coverEmoji || '·'}</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 800, letterSpacing: '-0.04em', margin: 0 }}>
          {crewName}
        </h1>
        <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600, opacity: 0.7, marginTop: 6 }}>
          {memberCount} {memberCount === 1 ? 'MEMBER' : 'MEMBERS'}
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 20px 48px' }}>
        {description && (
          <div style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.5, textAlign: 'center' }}>
            {description}
          </div>
        )}

        {/* Join CTA */}
        {tokenMatches && (
          <Link
            href={`/c/${slug}/join?token=${encodeURIComponent(join!)}`}
            className="btn-primary"
            style={{ display: 'block', textAlign: 'center', padding: 14, fontSize: 15, marginBottom: 20, textDecoration: 'none' }}
          >
            Join this crew →
          </Link>
        )}
        {!tokenMatches && hasInviteLink && (
          <div style={{
            padding: '12px 14px', marginBottom: 20,
            background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: 10,
            fontSize: 13, color: 'var(--text-muted)', textAlign: 'center',
          }}>
            This crew is invite-only. Use the link you were sent.
          </div>
        )}
        {!hasInviteLink && (
          <div style={{
            padding: '12px 14px', marginBottom: 20,
            background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: 10,
            fontSize: 13, color: 'var(--text-muted)', textAlign: 'center',
          }}>
            This crew isn&apos;t open for public joins right now.
          </div>
        )}

        {pastHangs.length > 0 && (
          <div>
            <div className="label" style={{ marginBottom: 10 }}>Recent hangs</div>
            <div>
              {pastHangs.map(h => (
                <div key={h.id as string} style={{
                  padding: '12px 0', borderBottom: '1px solid var(--border-light)',
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{h.name as string}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {h.confirmed_date as string}
                    {h.confirmed_activity ? ` · ${h.confirmed_activity}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
