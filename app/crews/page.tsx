// /crews — authenticated user's crew dashboard. Lists crews they belong to.

"use client"
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import NotificationBell from '@/components/NotificationBell'

type Crew = {
  id: string
  name: string
  slug: string | null
  description: string | null
  role: 'exec' | 'member'
  memberName: string | null
  memberCount: number
}

type Me = {
  user: { id: string; email: string; displayName: string | null } | null
  crews: Crew[]
}

export default function CrewsDashboard() {
  const router = useRouter()
  const [me, setMe] = useState<Me | null>(null)

  useEffect(() => {
    fetch('/api/me')
      .then(r => r.json())
      .then(setMe)
      .catch(() => setMe({ user: null, crews: [] }))
  }, [])

  // Unauthenticated → send to login
  useEffect(() => {
    if (me && !me.user) {
      router.replace('/login?redirect=/crews')
    }
  }, [me, router])

  if (!me || !me.user) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '32px 24px 48px' }}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 8 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 800, letterSpacing: '-0.04em', margin: 0 }}>
            Your crews
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <NotificationBell />
            <button
              onClick={() => fetch('/api/auth/logout', { method: 'POST' }).then(() => router.replace('/'))}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', padding: 4 }}
            >
              Sign out
            </button>
          </div>
        </div>
      </motion.div>

      {me.crews.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          style={{
            padding: 28,
            background: 'var(--surface)',
            border: '1px dashed var(--border-light)',
            borderRadius: 16,
            textAlign: 'center',
            marginBottom: 24,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>No crews yet</div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 20 }}>
            Crews are groups who plan together regularly — your society, dinner club, or game-night crew.
            Save members once, plan forever.
          </div>
          <Link
            href="/crews/new"
            className="btn-primary"
            style={{ padding: '12px 24px', fontSize: 15, display: 'inline-block' }}
          >
            Start your first crew
          </Link>
        </motion.div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {me.crews.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06, duration: 0.3 }}
              >
                <Link
                  href={`/crews/${c.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '18px 20px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border-light)',
                    borderRadius: 14,
                    textDecoration: 'none',
                    color: 'inherit',
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>
                        {c.name}
                      </span>
                      {c.role === 'exec' && (
                        <span style={{
                          fontSize: 9, fontWeight: 800, fontFamily: 'var(--font-mono)',
                          color: 'var(--accent)', background: 'var(--maybe-light)',
                          padding: '1px 6px', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.05em',
                        }}>exec</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {c.memberCount} {c.memberCount === 1 ? 'member' : 'members'}
                    </div>
                  </div>
                  <div style={{ fontSize: 18, color: 'var(--text-muted)' }}>→</div>
                </Link>
              </motion.div>
            ))}
          </div>

          <Link
            href="/crews/new"
            style={{
              display: 'block',
              textAlign: 'center',
              padding: 14,
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--accent)',
              border: '1.5px dashed var(--border-light)',
              borderRadius: 12,
              textDecoration: 'none',
            }}
          >
            + Start another crew
          </Link>
        </>
      )}
    </div>
  )
}
