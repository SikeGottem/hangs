"use client"
import { useState, useEffect, useRef, useCallback, use } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"

const stepAnim = {
  initial: { opacity: 0, x: 30 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -30 },
  transition: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
}

function generateDateRange(start: string, end: string): string[] {
  const dates: string[] = []
  const d = new Date(start + "T00:00:00")
  const e = new Date(end + "T00:00:00")
  while (d <= e) {
    dates.push(d.toISOString().split("T")[0])
    d.setDate(d.getDate() + 1)
  }
  return dates.slice(0, 7)
}

const HOURS = Array.from({ length: 15 }, (_, i) => i + 8)

function formatHour(h: number) {
  if (h === 0) return "12am"
  if (h < 12) return h + "am"
  if (h === 12) return "12pm"
  return (h - 12) + "pm"
}

function formatDay(d: string) {
  const date = new Date(d + "T00:00:00")
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  return `${days[date.getDay()]} ${date.getDate()}`
}

export default function FriendPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [hang, setHang] = useState<any>(null)
  const [step, setStep] = useState(0) // 0=name, 1=availability, 2=vote, 3=redirect
  const [friendName, setFriendName] = useState("")
  const [participantId, setPid] = useState("")
  const [slots, setSlots] = useState<Record<string, string>>({})
  const [votes, setVotes] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)

  // Drag-to-select state
  const isDragging = useRef(false)
  const paintStatus = useRef<string>("free") // what status we're painting while dragging

  const handleDragStart = (date: string, hour: number) => {
    isDragging.current = true
    const key = `${date}|${hour}`
    const current = slots[key] || "busy"
    // Determine what to paint: cycle forward from current
    const next = current === "busy" ? "free" : current === "free" ? "maybe" : "busy"
    paintStatus.current = next
    setSlots(prev => ({ ...prev, [key]: next }))
  }

  const handleDragEnter = (date: string, hour: number) => {
    if (!isDragging.current) return
    const key = `${date}|${hour}`
    setSlots(prev => ({ ...prev, [key]: paintStatus.current }))
  }

  const handleDragEnd = useCallback(() => {
    isDragging.current = false
  }, [])

  // Touch drag support: resolve which cell the finger is over
  const gridRef = useRef<HTMLDivElement>(null)
  const cellRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return
    e.preventDefault()
    const touch = e.touches[0]
    const el = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null
    if (el?.dataset.slotKey) {
      const key = el.dataset.slotKey
      setSlots(prev => {
        if (prev[key] === paintStatus.current) return prev
        return { ...prev, [key]: paintStatus.current }
      })
    }
  }, [])

  // Global mouseup listener
  useEffect(() => {
    const up = () => { isDragging.current = false }
    window.addEventListener('mouseup', up)
    window.addEventListener('touchend', up)
    return () => {
      window.removeEventListener('mouseup', up)
      window.removeEventListener('touchend', up)
    }
  }, [])

  useEffect(() => {
    fetch(`/api/hangs/${id}`).then(r => r.json()).then(d => { setHang(d); setLoading(false) })
    const existing = localStorage.getItem(`hangs_participant_${id}`)
    if (existing) { router.replace(`/h/${id}/results`) }
  }, [id])

  const join = async () => {
    const res = await fetch(`/api/hangs/${id}/join`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: friendName }),
    })
    const data = await res.json()
    setPid(data.participantId)
    localStorage.setItem(`hangs_participant_${id}`, data.participantId)
    setStep(1)
  }

  const markAllFree = () => {
    if (!hang) return
    const dates = generateDateRange(hang.hang.date_range_start, hang.hang.date_range_end)
    const allSlots: Record<string, string> = {}
    for (const d of dates) for (const h of HOURS) allSlots[`${d}|${h}`] = "free"
    setSlots(allSlots)
  }

  const submitAvailability = async () => {
    const slotArray = Object.entries(slots).map(([key, status]) => {
      const [date, hour] = key.split("|")
      return { date, hour: parseInt(hour), status }
    }).filter(s => s.status !== "busy")
    await fetch(`/api/hangs/${id}/availability`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId, slots: slotArray }),
    })
    setStep(2)
  }

  const submitVotes = async () => {
    for (const [actId, vote] of Object.entries(votes)) {
      await fetch(`/api/hangs/${id}/vote`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId, activityId: parseInt(actId), vote }),
      })
    }
    router.push(`/h/${id}/results`)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: 'var(--text-muted)' }}>
      Loading...
    </div>
  )
  if (!hang) return (
    <div style={{ textAlign: 'center', padding: '80px 24px', color: 'var(--text-muted)' }}>
      Hang not found
    </div>
  )

  const dates = generateDateRange(hang.hang.date_range_start, hang.hang.date_range_end)

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '16px 20px 48px' }}>
      {/* Progress */}
      {step < 3 && (
        <div className="progress-bar" style={{ marginBottom: 28 }}>
          {[0,1,2].map(s => (
            <div key={s} className={`progress-dot ${s <= step ? 'progress-dot-active' : ''}`} />
          ))}
        </div>
      )}

      <AnimatePresence mode="wait">
      {/* Step 0: Name */}
      {step === 0 && (
        <motion.div key="s0" {...stepAnim} style={{ display: 'flex', flexDirection: 'column', gap: 24, textAlign: 'center', paddingTop: 24 }}>
          <div>
            <h1 style={{
              fontFamily: 'var(--font-display)',
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: '-0.03em',
              color: 'var(--text-primary)',
            }}>
              {hang.hang.name}
            </h1>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 8 }}>
              {hang.hang.creator_name} wants to plan a hangout!
            </p>
          </div>
          <input
            type="text" value={friendName} onChange={e => setFriendName(e.target.value)}
            placeholder="What's your name?"
            className="input"
            style={{ textAlign: 'center', fontSize: 18 }}
          />
          <button onClick={join} disabled={!friendName.trim()} className="btn-primary">
            Let's go
          </button>
        </motion.div>
      )}

      {/* Step 1: Availability */}
      {step === 1 && (
        <motion.div key="s1" {...stepAnim} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h2 className="section-title" style={{ fontSize: 24 }}>When are you free?</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
              Tap to cycle: <span style={{ color: 'var(--free)', fontWeight: 600 }}>free</span>
              {' '}&rarr;{' '}
              <span style={{ color: 'var(--maybe)', fontWeight: 600 }}>maybe</span>
              {' '}&rarr; busy
            </p>
          </div>

          <div
            style={{ overflowX: 'auto', margin: '0 -20px', padding: '0 20px', userSelect: 'none', touchAction: 'none' }}
            onTouchMove={handleTouchMove}
          >
            <div style={{
              display: 'inline-grid',
              gridTemplateColumns: `60px repeat(${dates.length}, 48px)`,
              gap: 2,
            }}>
              {/* Header row */}
              <div />
              {dates.map(d => (
                <div key={d} className="grid-header">{formatDay(d)}</div>
              ))}
              {/* Time rows */}
              {HOURS.map(h => (
                <div key={h} style={{ display: 'contents' }}>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    paddingRight: 6,
                  }}>{formatHour(h)}</div>
                  {dates.map(d => {
                    const key = `${d}|${h}`
                    const status = slots[key] || "busy"
                    return (
                      <button
                        key={key}
                        data-slot-key={key}
                        onMouseDown={(e) => { e.preventDefault(); handleDragStart(d, h) }}
                        onMouseEnter={() => handleDragEnter(d, h)}
                        onTouchStart={() => handleDragStart(d, h)}
                        className={`grid-cell grid-cell-${status}`}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          <button onClick={markAllFree} style={{
            width: '100%',
            padding: '12px',
            fontSize: 14,
            fontWeight: 600,
            fontFamily: 'var(--font-display)',
            color: 'var(--free)',
            background: 'var(--free-light)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
          }}>
            I'm down for anything - mark all free
          </button>

          <button onClick={submitAvailability} className="btn-primary">
            Next
          </button>
        </motion.div>
      )}

      {/* Step 2: Vote on activities */}
      {step === 2 && (
        <motion.div key="s2" {...stepAnim} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <h2 className="section-title" style={{ fontSize: 24 }}>What do you wanna do?</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(hang.activities || []).map((a: any) => (
              <div key={a.id} className="card" style={{ padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                  <span style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: 16,
                  }}>{a.name}</span>
                  {a.cost_estimate && (
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      color: 'var(--text-muted)',
                    }}>{a.cost_estimate}</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { key: "up", label: "Keen", cls: "vote-keen" },
                    { key: "meh", label: "Meh", cls: "vote-meh" },
                    { key: "down", label: "Nah", cls: "vote-nah" },
                  ].map(v => (
                    <button
                      key={v.key}
                      onClick={() => setVotes(prev => ({ ...prev, [a.id]: v.key }))}
                      className={`vote-btn ${votes[a.id] === v.key ? v.cls : ''}`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button onClick={submitVotes} className="btn-primary">
            Submit
          </button>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Step 3 no longer exists — user is redirected to /h/[id]/results */}
    </div>
  )
}
