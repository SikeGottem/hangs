"use client"
import Link from "next/link"
import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"

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
  const [stats, setStats] = useState<any>(null)

  useEffect(() => {
    fetch("/api/stats").then(r => r.json()).then(setStats).catch(() => {})
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
            Plan your next<br /><span style={{ color: 'var(--accent)' }}>hangout</span>
          </h1>
        </motion.div>

        <motion.p custom={1} initial="hidden" animate="visible" variants={fadeUp} style={{
          fontSize: 17,
          color: 'var(--text-secondary)',
          lineHeight: 1.55,
          maxWidth: 340,
          marginBottom: 32,
        }}>
          One link. Everyone fills in when they're free, votes on what to do. You get a plan.
        </motion.p>

        <motion.div custom={2} initial="hidden" animate="visible" variants={fadeUp}>
          <Link href="/create" className="btn-primary" style={{ padding: '16px 40px', fontSize: 17, maxWidth: 300 }}>
            Create a Hang
          </Link>
        </motion.div>
      </div>

      {/* ── Animated demo section ── */}
      <motion.div
        custom={3}
        initial="hidden"
        animate="visible"
        variants={fadeUp}
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
          minWidth: 0,
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>
            What to do
          </div>
          <AnimatedVotes />
        </div>
      </motion.div>

      {/* ── Three-step strip ── */}
      <div style={{
        padding: '40px 24px',
        background: 'var(--surface)',
        borderTop: '1px solid var(--border-light)',
        borderBottom: '1px solid var(--border-light)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 32, flexWrap: 'wrap', maxWidth: 520, margin: '0 auto' }}>
          {[
            { n: '1', title: 'Create', desc: 'Pick dates + activities' },
            { n: '2', title: 'Share', desc: 'One link to your group' },
            { n: '3', title: 'Done', desc: 'Smart plan in seconds' },
          ].map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: i * 0.15, duration: 0.4 }}
              style={{ textAlign: 'center', flex: '0 1 120px' }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: i === 2 ? 'var(--accent)' : 'var(--surface-dim)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 8px',
                fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15,
                color: i === 2 ? 'var(--accent-text)' : 'var(--text-muted)',
              }}>{s.n}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{s.title}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{s.desc}</div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Recent hangs (if any) ── */}
      {stats && stats.totalHangs > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          style={{ padding: '36px 24px' }}
        >
          <div style={{ maxWidth: 520, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span className="label">Recent hangs</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                {stats.totalHangs} total
              </span>
            </div>
            {stats.recentHangs?.map((h: any, i: number) => (
              <motion.div
                key={h.id}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.3 }}
              >
                <Link href={`/h/${h.id}/results`} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 0', textDecoration: 'none', color: 'inherit',
                  borderBottom: '1px solid var(--border-light)',
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-display)' }}>{h.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{h.participant_count} people</div>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
                    ...(h.status === 'confirmed'
                      ? { color: 'var(--success)', background: 'var(--free-light)' }
                      : { color: 'var(--text-muted)', background: 'var(--surface-dim)' }),
                  }}>
                    {h.status === 'confirmed' ? 'Confirmed' : 'Planning'}
                  </span>
                </Link>
              </motion.div>
            ))}
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
