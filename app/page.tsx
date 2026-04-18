"use client"
import Link from "next/link"
import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { formatDeadline } from "@/lib/time"

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

  return (
    <div style={{ display: 'inline-grid', gridTemplateColumns: `36px repeat(${DEMO_GRID.cols}, 40px)`, gap: 3 }}>
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
                  backgroundColor: status === 'free' ? '#34C26A' : status === 'maybe' ? '#F5C842' : '#F2EFE8',
                } : { backgroundColor: '#F2EFE8' }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                style={{
                  width: 40,
                  height: 32,
                  borderRadius: 6,
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
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{a}</span>
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
  const [myHangs, setMyHangs] = useState<any[]>([])
  const [me, setMe] = useState<{ user: any; crews: any[] } | null>(null)

  useEffect(() => {
    fetch('/api/me').then(r => r.json()).then(setMe).catch(() => setMe({ user: null, crews: [] }))
  }, [])

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
            color: 'var(--text-primary)',
            marginBottom: 16,
          }}>
            Plan with your crew,<br /><span style={{ color: 'var(--accent)' }}>every week.</span>
          </h1>
        </motion.div>

        <motion.p custom={1} initial="hidden" animate="visible" variants={fadeUp} style={{
          fontSize: 17,
          color: 'var(--text-secondary)',
          lineHeight: 1.55,
          maxWidth: 360,
          marginBottom: 32,
        }}>
          Dinner club, society, study group. Save your crew once — every future hang takes 10 seconds.
        </motion.p>

        <motion.div custom={2} initial="hidden" animate="visible" variants={fadeUp} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%', maxWidth: 320 }}>
          {me?.user ? (
            <>
              <Link
                href={me.crews.length > 0 ? '/crews' : '/crews/new'}
                className="btn-primary"
                style={{ padding: '16px 24px', fontSize: 16, width: '100%', textAlign: 'center' }}
              >
                {me.crews.length > 0 ? `Your crews (${me.crews.length})` : 'Start a crew'}
              </Link>
              <Link
                href="/create"
                style={{
                  padding: '14px 24px', fontSize: 15, width: '100%', textAlign: 'center',
                  border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 600,
                  background: 'var(--surface)',
                  boxSizing: 'border-box',
                }}
              >
                Plan a one-off →
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="btn-primary"
                style={{ padding: '16px 24px', fontSize: 16, width: '100%', textAlign: 'center' }}
              >
                Start a crew
              </Link>
              <Link
                href="/create"
                style={{
                  padding: '14px 24px', fontSize: 15, width: '100%', textAlign: 'center',
                  border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 600,
                  background: 'var(--surface)',
                  boxSizing: 'border-box',
                }}
              >
                Plan a one-off →
              </Link>
            </>
          )}
        </motion.div>
      </div>

      {/* ── Animated demo section ── */}
      <motion.div
        custom={3}
        initial="hidden"
        animate="visible"
        variants={fadeUp}
        className="demo-cards-container"
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          gap: 16,
          padding: '40px 16px 48px',
          maxWidth: 600,
          margin: '0 auto',
        }}
      >
        {/* Grid demo */}
        <div style={{
          padding: '20px 24px 24px',
          background: 'var(--surface)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--border-light)',
          boxShadow: 'var(--shadow-md)',
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>
            When works
          </div>
          <AnimatedGrid />
        </div>

        {/* Vote demo */}
        <div style={{
          padding: '20px 24px 24px',
          background: 'var(--surface)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--border-light)',
          boxShadow: 'var(--shadow-md)',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minWidth: 200,
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
              { n: '1', title: 'Save your group', desc: 'Name it, invite members by email.', emoji: '👥' },
              { n: '2', title: 'Members set it once', desc: 'Dietary, transport, typical availability — answered forever.', emoji: '📝' },
              { n: '3', title: 'Every hang is 10 seconds', desc: 'Profile auto-fills, “Use my usual” for availability, one tap to confirm.', emoji: '⚡️' },
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
                  background: i === 2 ? 'var(--accent)' : 'var(--surface-dim)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20,
                }}>
                  {s.emoji}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 2 }}>
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
              return (
                <motion.div
                  key={h.id}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.3 }}
                >
                  <Link href={href} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 0', textDecoration: 'none', color: 'inherit',
                    borderBottom: '1px solid var(--border-light)',
                    gap: 12,
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
                            fontFamily: 'var(--font-mono)', fontWeight: 700,
                            color: deadline.urgent ? 'var(--error)' : 'var(--text-muted)',
                          }}>
                            ⏰ {deadline.text}
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
