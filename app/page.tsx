"use client"
import Link from "next/link"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { formatDeadline } from "@/lib/time"
import { showToast } from "@/components/Toast"

// ── Animated grid demo: simulates cells filling in ──
const DEMO_GRID = { cols: 5, rows: 7 }
const DEMO_SEQUENCE = [
  // [col, row, status] — choreographed fill pattern
  [0,2,'free'],[0,3,'free'],[0,4,'free'],
  [1,1,'free'],[1,2,'free'],[1,3,'free'],[1,4,'maybe'],
  [2,3,'free'],[2,4,'free'],[2,5,'free'],
  [3,1,'maybe'],[3,2,'free'],[3,3,'free'],[3,4,'free'],[3,5,'free'],
  [4,2,'free'],[4,3,'free'],[4,4,'free'],[4,5,'maybe'],
] as const

function AnimatedGrid() {
  const [filled, setFilled] = useState<Set<string>>(new Set())
  const [statuses, setStatuses] = useState<Record<string, string>>({})

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    DEMO_SEQUENCE.forEach(([c, r, s], i) => {
      timers.push(setTimeout(() => {
        setFilled(prev => new Set([...prev, `${c}-${r}`]))
        setStatuses(prev => ({ ...prev, [`${c}-${r}`]: s }))
      }, 600 + i * 120))
    })
    // Reset loop
    const reset = setTimeout(() => {
      setFilled(new Set())
      setStatuses({})
    }, 600 + DEMO_SEQUENCE.length * 120 + 2000)
    timers.push(reset)

    const loop = setInterval(() => {
      setFilled(new Set())
      setStatuses({})
      DEMO_SEQUENCE.forEach(([c, r, s], i) => {
        timers.push(setTimeout(() => {
          setFilled(prev => new Set([...prev, `${c}-${r}`]))
          setStatuses(prev => ({ ...prev, [`${c}-${r}`]: s }))
        }, 600 + i * 120))
      })
    }, 600 + DEMO_SEQUENCE.length * 120 + 3000)

    return () => { timers.forEach(clearTimeout); clearInterval(loop) }
  }, [])

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const hours = ['9am', '10am', '11am', '12pm', '1pm', '2pm', '3pm']

  // Use min()/clamp() so all 5 day columns + the row-label column fit at 320px
  // without clipping. At 320px viewport the card has ~272px usable width
  // (card padding 24px each side), so label=28px + 5×(272-28)/5≈48px per col.
  // clamp(28px, 7vw, 40px) gracefully scales the cell width across breakpoints.
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `min(28px, 7vw) repeat(${DEMO_GRID.cols}, minmax(0, 1fr))`,
      gap: 3,
      width: '100%',
    }}>
      <div />
      {days.map(d => (
        <div key={d} style={{ textAlign: 'center', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontWeight: 500, padding: '2px 0' }}>{d}</div>
      ))}
      {hours.map((h, ri) => (
        <div key={h} style={{ display: 'contents' }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 4 }}>{h}</div>
          {days.map((_, ci) => {
            const key = `${ci}-${ri}`
            const status = statuses[key]
            const isFilled = filled.has(key)
            return (
              <motion.div
                key={key}
                initial={{ scale: 1 }}
                animate={isFilled ? {
                  scale: [1, 1.15, 1],
                  // Use literal hex matching the design tokens (Framer Motion needs JS values)
                  backgroundColor: status === 'free' ? '#34C26A' : status === 'maybe' ? '#F5C842' : '#F2EFE8',
                } : { backgroundColor: '#F2EFE8' }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                style={{
                  height: 30,
                  borderRadius: 'var(--radius-xs)',
                  border: `1px solid ${isFilled ? (status === 'free' ? '#34C26A' : status === 'maybe' ? '#F5C842' : '#E8E3D9') : '#E8E3D9'}`,
                }}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ── Animated vote cards ──
function AnimatedVotes() {
  const [votes, setVotes] = useState<Record<string, string>>({})

  useEffect(() => {
    const seq = [
      { delay: 200, activity: 'Bowling', vote: 'keen' },
      { delay: 600, activity: 'Dinner', vote: 'keen' },
      { delay: 1000, activity: 'Karaoke', vote: 'meh' },
    ]
    const timers = seq.map(s =>
      setTimeout(() => setVotes(prev => ({ ...prev, [s.activity]: s.vote })), s.delay)
    )
    const reset = setTimeout(() => setVotes({}), 3500)
    timers.push(reset)

    const loop = setInterval(() => {
      setVotes({})
      seq.forEach(s => {
        timers.push(setTimeout(() => setVotes(prev => ({ ...prev, [s.activity]: s.vote })), s.delay))
      })
    }, 4500)

    return () => { timers.forEach(clearTimeout); clearInterval(loop) }
  }, [])

  const activities = ['Bowling', 'Dinner', 'Karaoke']
  const voteColors: Record<string, { bg: string; border: string; text: string }> = {
    keen: { bg: '#E8F8EE', border: '#34C26A', text: '#1a7a3a' },
    meh: { bg: '#FEF7E0', border: '#F5C842', text: '#8a6d10' },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 220 }}>
      {activities.map(a => {
        const v = votes[a]
        const c = v ? voteColors[v] : null
        return (
          <motion.div
            key={a}
            layout
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', borderRadius: 10,
              background: c ? c.bg : '#fff',
              border: `1.5px solid ${c ? c.border : '#E8E3D9'}`,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{a}</span>
            <AnimatePresence mode="wait">
              {v && (
                <motion.span
                  key={v}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                  style={{ fontSize: 12, fontWeight: 700, color: c?.text }}
                >
                  {v === 'keen' ? 'Keen' : 'Meh'}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>
        )
      })}
    </div>
  )
}

// ── Stagger entrance wrapper ──
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.12, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  }),
}

export default function Home() {
  const router = useRouter()
  const [myHangs, setMyHangs] = useState<any[]>([])
  const [me, setMe] = useState<{ user: any; crews: any[] } | null>(null)
  // null = scanning localStorage, number = how many hang IDs we expect to resolve.
  // When it's null OR we still have outstanding fetches, show a skeleton.
  const [expectedHangs, setExpectedHangs] = useState<number | null>(null)
  const [repeatingId, setRepeatingId] = useState<string | null>(null)

  // One-tap clone + redirect. Dates default to today→+7 on the server side.
  // Target user: the returning creator ("Justin Guo 20/80 rule" — 20% of users
  // create 80% of hangs). This saves them walking the 5-step wizard every week.
  const repeatHang = async (hangId: string) => {
    setRepeatingId(hangId)
    try {
      const res = await fetch(`/api/hangs/${hangId}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Clone failed' }))
        showToast(err.error || 'Could not repeat hang', 'error')
        setRepeatingId(null)
        return
      }
      const data = await res.json()
      // Seed the creator state so /results treats them as host on arrival.
      if (data.id && data.creatorId) {
        localStorage.setItem(`hangs_${data.id}`, data.creatorId)
        localStorage.setItem(`hangs_participant_${data.id}`, data.creatorId)
      }
      if (data.creatorToken) {
        localStorage.setItem(`hangs_token_${data.id}`, data.creatorToken)
      }
      router.push(`/h/${data.id}/results?justCreated=1`)
    } catch {
      showToast('Network error — try again', 'error')
      setRepeatingId(null)
    }
  }

  useEffect(() => {
    fetch('/api/me').then(r => r.json()).then(setMe).catch(() => setMe({ user: null, crews: [] }))
  }, [])

  // Cross-device history: a logged-in user's hangs live on the server (linked by
  // user_id), so they show up even on a device whose localStorage is empty.
  // Merged in (deduped by id) alongside the localStorage scan below.
  useEffect(() => {
    if (!me?.user) return
    let cancelled = false
    fetch('/api/me/hangs').then(r => r.json()).then(data => {
      if (cancelled || !data?.hangs?.length) return
      const serverItems = data.hangs.map((h: any) => ({
        id: h.id,
        name: h.name,
        status: h.status,
        participant_count: h.participantCount || 0,
        created_at: h.createdAt || 0,
        response_deadline: null,
        confirmed_date: h.confirmedDate,
        needsResponse: false,
        isCreator: h.isCreator,
      }))
      // Seed localStorage so links + repeat work on this device going forward.
      data.hangs.forEach((h: any) => {
        if (!h.participantId) return
        localStorage.setItem(`hangs_participant_${h.id}`, h.participantId)
        if (h.isCreator) localStorage.setItem(`hangs_${h.id}`, h.participantId)
      })
      setMyHangs(prev => {
        const byId = new Map<string, any>(prev.map((x: any) => [x.id, x]))
        for (const item of serverItems) if (!byId.has(item.id)) byId.set(item.id, item)
        const merged = [...byId.values()]
        merged.sort((a: any, b: any) => {
          if (a.needsResponse !== b.needsResponse) return a.needsResponse ? -1 : 1
          if (a.status === 'confirmed' && b.status !== 'confirmed') return 1
          if (b.status === 'confirmed' && a.status !== 'confirmed') return -1
          return (b.created_at || 0) - (a.created_at || 0)
        })
        return merged
      })
      setExpectedHangs(prev => Math.max(prev || 0, serverItems.length))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [me])

  useEffect(() => {
    // Find hang IDs from localStorage — only show hangs the user is part of.
    // Whitelist exact patterns so unrelated keys (hangs_last_name, hangs_token_*)
    // don't leak into the ID list and trigger 404s.
    const ids: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      const participant = key.match(/^hangs_participant_([a-zA-Z0-9]{6,})$/)
      if (participant) { ids.push(participant[1]); continue }
      const creator = key.match(/^hangs_([a-zA-Z0-9]{6,})$/)
      if (creator) ids.push(creator[1])
    }

    // Fetch details for each hang
    const unique = [...new Set(ids)]
    setExpectedHangs(unique.length)
    if (unique.length === 0) return

    Promise.all(
      unique.map(async hid => {
        try {
          const r = await fetch(`/api/hangs/${hid}`)
          if (r.status === 404) {
            // Stale localStorage — the hang was deleted server-side. Clean up
            // so it doesn't keep showing up here and triggering 404s.
            localStorage.removeItem(`hangs_${hid}`)
            localStorage.removeItem(`hangs_participant_${hid}`)
            localStorage.removeItem(`hangs_token_${hid}`)
            return null
          }
          if (!r.ok) return null
          return await r.json()
        } catch {
          return null
        }
      })
    ).then(results => {
      // Figure out which participant is "me" per hang so we can flag
      // hangs that still need a response from this user.
      const valid = results.filter(Boolean).map((r: any) => {
        const myPid = localStorage.getItem(`hangs_participant_${r.hang.id}`) || localStorage.getItem(`hangs_${r.hang.id}`)
        const me = myPid ? r.participants?.find((p: any) => p.id === myPid) : null
        const needsResponse = me ? !me.hasResponded : true
        return {
          id: r.hang.id,
          name: r.hang.name,
          status: r.hang.status,
          participant_count: r.participants?.length || 0,
          created_at: r.hang.created_at,
          response_deadline: r.hang.response_deadline,
          confirmed_date: r.hang.confirmed_date,
          needsResponse,
          isCreator: !!localStorage.getItem(`hangs_${r.hang.id}`),
        }
      })
      // Sort: needs-my-response first, then active, then confirmed, then past.
      valid.sort((a: any, b: any) => {
        if (a.needsResponse !== b.needsResponse) return a.needsResponse ? -1 : 1
        if (a.status === 'confirmed' && b.status !== 'confirmed') return 1
        if (b.status === 'confirmed' && a.status !== 'confirmed') return -1
        return (b.created_at || 0) - (a.created_at || 0)
      })
      setMyHangs(valid)
    })
  }, [])

  return (
    <div style={{ minHeight: '100vh', overflow: 'hidden' }}>
      {/* ── Hero ── */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '48px 24px 0',
        textAlign: 'center',
        maxWidth: 560,
        margin: '0 auto',
      }}>
        <motion.div custom={0} initial="hidden" animate="visible" variants={fadeUp}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(38px, 9vw, 56px)',
            fontWeight: 800,
            letterSpacing: '-0.045em',
            lineHeight: 1.0,
            color: 'var(--text)',
            marginBottom: 16,
          }}>
            Find when everyone's free.
          </h1>
        </motion.div>

        <motion.p custom={1} initial="hidden" animate="visible" variants={fadeUp} style={{
          fontSize: 17,
          color: 'var(--text-secondary)',
          lineHeight: 1.55,
          maxWidth: 360,
          marginBottom: 32,
        }}>
          One link. No signup. Sort it tonight.
        </motion.p>

        <motion.div custom={2} initial="hidden" animate="visible" variants={fadeUp} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%', maxWidth: 320 }}>
          {/* Primary CTA — always /create, always yellow. No exceptions. */}
          <Link
            href="/create"
            className="btn-primary"
            style={{ padding: '16px 24px', fontSize: 16, width: '100%', textAlign: 'center' }}
          >
            Plan a hang
          </Link>

          {/* Microcopy — warm lowercase, matching FirstVisitCoach voice */}
          <p style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.01em',
            margin: '2px 0 4px',
          }}>
            free · no signup · works on any phone
          </p>

          {/* Secondary — crew feature, demoted to a plain text link */}
          {me?.user ? (
            <Link
              href={me.crews.length > 0 ? '/crews' : '/crews/new'}
              style={{
                fontSize: 13,
                color: 'var(--text-secondary)',
                textDecoration: 'none',
                fontWeight: 500,
                borderBottom: '1px solid var(--border)',
                paddingBottom: 1,
              }}
            >
              or plan with the same crew every week →
            </Link>
          ) : (
            <Link
              href="/login"
              style={{
                fontSize: 13,
                color: 'var(--text-secondary)',
                textDecoration: 'none',
                fontWeight: 500,
                borderBottom: '1px solid var(--border)',
                paddingBottom: 1,
              }}
            >
              or plan with the same crew every week →
            </Link>
          )}
        </motion.div>
      </div>

      {/* ── Animated demo section ── */}
      {/* Outer wrapper: full-width, clips nothing. Cards stack on narrow screens
          via flex-wrap so both fit at 320px without horizontal scroll. */}
      <motion.div
        custom={3}
        initial="hidden"
        animate="visible"
        variants={fadeUp}
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 12,
          padding: '40px 16px 48px',
          maxWidth: 600,
          margin: '0 auto',
          boxSizing: 'border-box',
        }}
      >
        {/* Grid demo — flex-grows to fill available width */}
        <div style={{
          padding: '16px 16px 20px',
          background: 'var(--surface)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--border-light)',
          boxShadow: 'var(--shadow-md)',
          flex: '1 1 200px',
          minWidth: 0,
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>
            When works
          </div>
          <AnimatedGrid />
        </div>

        {/* Vote demo */}
        <div style={{
          padding: '16px 16px 20px',
          background: 'var(--surface)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--border-light)',
          boxShadow: 'var(--shadow-md)',
          display: 'flex',
          flexDirection: 'column',
          flex: '1 1 160px',
          minWidth: 0,
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>
            What to do
          </div>
          <AnimatedVotes />
        </div>
      </motion.div>

      {/* ── How crews work — the compounding story ── */}
      <div style={{
        padding: '40px 24px',
        background: 'var(--surface)',
        borderTop: '1px solid var(--border-light)',
        borderBottom: '1px solid var(--border-light)',
      }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <div className="label" style={{ textAlign: 'center', marginBottom: 24 }}>How crews work</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              {
                n: '1', title: 'Save your group', desc: 'Name it, invite members by email.',
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                ),
              },
              {
                n: '2', title: 'Members set it once', desc: 'Dietary, transport, typical availability — answered forever.',
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                  </svg>
                ),
              },
              {
                n: '3', title: 'Every hang is 10 seconds', desc: 'Profile auto-fills, "Use my usual" for availability, one tap to confirm.',
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                  </svg>
                ),
              },
            ].map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ delay: i * 0.1, duration: 0.35 }}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 14,
                  padding: '16px 18px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-lg, 14px)',
                }}
              >
                <div style={{
                  flexShrink: 0,
                  width: 38, height: 38, borderRadius: 10,
                  background: 'var(--surface-dim)',
                  color: 'var(--text-secondary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {s.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 2 }}>
                    {s.title}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {s.desc}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            FOR UNI SOCIETIES · DINNER CLUBS · GAME NIGHTS · STUDY CREWS
          </div>
        </div>
      </div>

      {/* ── Your hangs (only ones you're part of) ── */}
      {/* Skeleton while we still have outstanding hang fetches — prevents a
          blank gap between "How crews work" and the footer on slow mobile. */}
      {expectedHangs !== null && expectedHangs > 0 && myHangs.length === 0 && (
        <div style={{ padding: '36px 24px' }}>
          <div style={{ maxWidth: 520, margin: '0 auto' }}>
            <div className="label" style={{ marginBottom: 16 }}>Your hangs</div>
            {Array.from({ length: Math.min(expectedHangs, 3) }).map((_, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 0', gap: 12,
                borderBottom: '1px solid var(--border-light)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="skeleton" style={{ height: 16, width: `${55 + (i * 10)}%`, marginBottom: 8 }} />
                  <div className="skeleton" style={{ height: 11, width: 120 }} />
                </div>
                <div className="skeleton" style={{ height: 22, width: 72, borderRadius: 6 }} />
              </div>
            ))}
          </div>
        </div>
      )}
      {myHangs.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          style={{ padding: '36px 24px' }}
        >
          <div style={{ maxWidth: 520, margin: '0 auto' }}>
            <div className="label" style={{ marginBottom: 16 }}>Your hangs</div>
            {myHangs.map((h: any, i: number) => {
              const deadline = formatDeadline(h.response_deadline)
              // Route new-responders to the fill-in flow; everyone else to results.
              const href = h.needsResponse ? `/h/${h.id}` : `/h/${h.id}/results`
              // Repeat is available for ANY hang you hosted — the clone always
              // starts a fresh planning flow with new dates, so there's no
              // ambiguity even on in-flight hangs. Previously gated to
              // confirmed/cancelled but most hangs never reach those states.
              const canRepeat = h.isCreator
              const isRepeating = repeatingId === h.id
              return (
                <motion.div
                  key={h.id}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.3 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '14px 0',
                    borderBottom: '1px solid var(--border-light)',
                  }}
                >
                  <Link href={href} style={{
                    flex: 1, minWidth: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    textDecoration: 'none', color: 'inherit', gap: 12,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-display)' }}>{h.name}</span>
                        {h.isCreator && (
                          <span style={{ fontSize: 9, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--accent)', background: 'var(--maybe-light)', padding: '1px 6px', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>host</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                        <span>{h.participant_count} people</span>
                        {deadline && !deadline.closed && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            fontFamily: 'var(--font-mono)', fontWeight: 700,
                            color: deadline.urgent ? 'var(--error)' : 'var(--text-muted)',
                          }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <circle cx="12" cy="12" r="10"/>
                              <polyline points="12 6 12 12 16 14"/>
                            </svg>
                            {deadline.text}
                          </span>
                        )}
                      </div>
                    </div>
                    {h.needsResponse && h.status !== 'cancelled' ? (
                      <span style={{
                        fontSize: 11, fontWeight: 800, padding: '5px 10px', borderRadius: 6,
                        color: 'var(--accent-text)', background: 'var(--accent)',
                        whiteSpace: 'nowrap',
                      }}>
                        Respond →
                      </span>
                    ) : (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
                        whiteSpace: 'nowrap',
                        ...(h.status === 'cancelled'
                          ? { color: 'var(--error)', background: '#fef2f2' }
                          : h.status === 'confirmed'
                            ? { color: 'var(--success, #1a7a3a)', background: 'var(--free-light)' }
                            : { color: 'var(--text-muted)', background: 'var(--surface-dim)' }),
                      }}>
                        {h.status === 'cancelled' ? 'Cancelled' : h.status === 'confirmed' ? 'Confirmed' : 'Planning'}
                      </span>
                    )}
                  </Link>
                  {canRepeat && (
                    <button
                      onClick={() => repeatHang(h.id)}
                      disabled={isRepeating}
                      aria-label={`Repeat ${h.name}`}
                      title="Repeat this hang with the same activities and crew"
                      style={{
                        padding: '6px 10px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border-light)',
                        borderRadius: 6,
                        fontSize: 11, fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-secondary)',
                        cursor: isRepeating ? 'wait' : 'pointer',
                        whiteSpace: 'nowrap',
                        opacity: isRepeating ? 0.6 : 1,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={e => {
                        if (isRepeating) return
                        e.currentTarget.style.borderColor = 'var(--accent)'
                        e.currentTarget.style.color = 'var(--accent-text, var(--text-primary))'
                        e.currentTarget.style.background = 'var(--maybe-light)'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.borderColor = 'var(--border-light)'
                        e.currentTarget.style.color = 'var(--text-secondary)'
                        e.currentTarget.style.background = 'var(--surface)'
                      }}
                    >
                      {isRepeating ? '…' : (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="1 4 1 10 7 10"/>
                            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                          </svg>
                          Repeat
                        </>
                      )}
                    </button>
                  )}
                </motion.div>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* ── Footer ── */}
      <div style={{ padding: 24, textAlign: 'center', borderTop: '1px solid var(--border-light)' }}>
        <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
          hangs
        </span>
      </div>
    </div>
  )
}
