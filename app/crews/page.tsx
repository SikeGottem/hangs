// Crews index — an editorial launchpad for a member's recurring groups.
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import NotificationBell from '@/components/NotificationBell'
import product from '@/app/product.module.css'

type Crew = { id: string; name: string; slug: string | null; description: string | null; role: 'exec' | 'member'; memberName: string | null; memberCount: number }
type Me = { user: { id: string; email: string; displayName: string | null } | null; crews: Crew[] }

export default function CrewsDashboard() {
  const router = useRouter()
  const [me, setMe] = useState<Me | null>(null)

  useEffect(() => { fetch('/api/me').then(r => r.json()).then(setMe).catch(() => setMe({ user: null, crews: [] })) }, [])
  useEffect(() => { if (me && !me.user) router.replace('/login?redirect=/crews') }, [me, router])

  if (!me || !me.user) return <div className={product.statusPage}>Loading…</div>

  return (
    <div className={product.page}>
      <div className={product.dashboardIntro}>
        <div>
          <span className={product.eyebrow}>Your groups</span>
          <h1 className={product.title}>Crews, kept close.</h1>
          <p className={product.lede}>The people you plan with more than once. Their details and usual availability stay ready for the next hang.</p>
        </div>
        <div className={product.dashboardTools}>
          <NotificationBell />
          <button className={product.quietButton} onClick={() => fetch('/api/auth/logout', { method: 'POST' }).then(() => router.replace('/'))}>Sign out</button>
        </div>
      </div>

      {me.crews.length === 0 ? (
        <section className={product.empty} aria-labelledby="empty-crews-title">
          <strong id="empty-crews-title">Start with your regulars.</strong>
          <p>A crew saves the people, preferences, and weekly rhythms that make organising feel less like admin.</p>
          <Link href="/crews/new" className="btn-primary">Start your first crew</Link>
        </section>
      ) : (
        <>
          <section className={product.list} aria-label="Your crews">
            {me.crews.map((crew) => (
              <Link key={crew.id} href={`/crews/${crew.id}`} className={product.listRow}>
                <span>
                  <span className={product.listTitle}>{crew.name}{crew.role === 'exec' && <span className={product.badge}>Organiser</span>}</span>
                  <span className={product.meta}>{crew.memberCount} {crew.memberCount === 1 ? 'member' : 'members'}{crew.description ? ` · ${crew.description}` : ''}</span>
                </span>
                <span className={product.arrow} aria-hidden="true">↗</span>
              </Link>
            ))}
          </section>
          <Link href="/crews/new" className={product.dashedAction}>Start another crew <span aria-hidden="true">→</span></Link>
        </>
      )}
    </div>
  )
}
