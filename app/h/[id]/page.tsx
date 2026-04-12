"use client"
import { useState, useEffect, useRef, useCallback, use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
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
  const searchParams = useSearchParams()
  const editPid = searchParams.get('edit') // if editing, skip name step
  const [hang, setHang] = useState<any>(null)
  const [step, setStep] = useState(editPid ? 1 : 0) // skip to availability if editing
  const [friendName, setFriendName] = useState("")
  const [participantId, setPid] = useState("")
  const [slots, setSlots] = useState<Record<string, string>>({})
  const [votes, setVotes] = useState<Record<number, string>>({})
  // Specific-days mode state
  const [freeDays, setFreeDays] = useState<string[]>([]) // which days the friend picked
  const [specificStep, setSpecificStep] = useState<'days' | 'hours'>('days')
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

    // If editing, use the edit param as participant ID — don't redirect
    if (editPid) {
      setPid(editPid)
      return
    }

    // Otherwise check if already responded and redirect to results
    const existing = localStorage.getItem(`hangs_participant_${id}`)
    if (existing) { router.replace(`/h/${id}/results`) }
  }, [id, editPid])

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
    // If editing, go straight back to results (skip voting)
    if (editPid) {
      localStorage.setItem(`hangs_participant_${id}`, participantId)
      router.push(`/h/${id}/results`)
      return
    }
    setStep(2)
  }

  const submitVotes = async () => {
    for (const [actId, vote] of Object.entries(votes)) {
      await fetch(`/api/hangs/${id}/vote`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId, activityId: parseInt(actId), vote }),
      })
    }
    // Ensure localStorage is set so future visits go to results
    localStorage.setItem(`hangs_participant_${id}`, participantId)
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

  const isSpecificMode = hang.hang.date_mode === 'specific'
  const dates = isSpecificMode
    ? (hang.hang.selected_dates ? JSON.parse(hang.hang.selected_dates) as string[] : []).sort()
    : generateDateRange(hang.hang.date_range_start, hang.hang.date_range_end)

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
      {/* Step 0: Name / returning user */}
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

          {/* New person */}
          <div>
            <input
              type="text" value={friendName} onChange={e => setFriendName(e.target.value)}
              placeholder="What's your name?"
              className="input"
              style={{ textAlign: 'center', fontSize: 18 }}
            />
            <button onClick={join} disabled={!friendName.trim()} className="btn-primary" style={{ marginTop: 12 }}>
              Join
            </button>
          </div>

          {/* Returning person — pick your name */}
          {hang.participants?.length > 0 && (
            <div style={{ paddingTop: 16, borderTop: '1px solid var(--border-light)' }}>
              <div className="label" style={{ marginBottom: 10 }}>Already responded? Tap your name</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                {hang.participants.map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setPid(p.id)
                      localStorage.setItem(`hangs_participant_${id}`, p.id)
                      router.replace(`/h/${id}/results`)
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 16px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border-light)',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--maybe-light)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.background = 'var(--surface)' }}
                  >
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%',
                      background: 'var(--accent)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700, color: 'var(--accent-text)',
                    }}>
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Step 1: Availability — RANGE MODE (original grid) */}
      {step === 1 && hang.hang.date_mode !== 'specific' && (
        <motion.div key="s1-range" {...stepAnim} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
            className="grid-scroll-container"
            style={{ margin: '0 -20px', padding: '0 20px', userSelect: 'none', touchAction: 'none' }}
            onTouchMove={handleTouchMove}
          >
            <div style={{
              display: 'inline-grid',
              gridTemplateColumns: `60px repeat(${dates.length}, 48px)`,
              gap: 2,
            }}>
              <div />
              {dates.map(d => (
                <div key={d} className="grid-header">{formatDay(d)}</div>
              ))}
              {HOURS.map(h => (
                <div key={h} style={{ display: 'contents' }}>
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6,
                  }}>{formatHour(h)}</div>
                  {dates.map(d => {
                    const key = `${d}|${h}`
                    const status = slots[key] || "busy"
                    return (
                      <button key={key} data-slot-key={key}
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
            width: '100%', padding: '12px', fontSize: 14, fontWeight: 600,
            fontFamily: 'var(--font-display)', color: 'var(--free)',
            background: 'var(--free-light)', border: 'none',
            borderRadius: 'var(--radius-md)', cursor: 'pointer',
          }}>
            I'm down for anything - mark all free
          </button>

          <button onClick={submitAvailability} className="btn-primary">Next</button>
        </motion.div>
      )}

      {/* Step 1: Availability — SPECIFIC DAYS MODE (two-step: pick days, then hours) */}
      {step === 1 && hang.hang.date_mode === 'specific' && (
        <motion.div key="s1-specific" {...stepAnim} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Step 1a: Pick which days work */}
          {specificStep === 'days' && (
            <>
              <div>
                <h2 className="section-title" style={{ fontSize: 24 }}>Which days work?</h2>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
                  Tap the days you could do.
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(JSON.parse(hang.hang.selected_dates || '[]') as string[]).map((d: string) => {
                  const date = new Date(d + 'T00:00:00')
                  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
                  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
                  const isSelected = freeDays.includes(d)
                  return (
                    <button
                      key={d}
                      onClick={() => setFreeDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '16px 20px',
                        background: isSelected ? 'var(--free-light)' : 'var(--surface)',
                        border: `2px solid ${isSelected ? 'var(--free)' : 'var(--border-light)'}`,
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ textAlign: 'left' }}>
                        <div style={{
                          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16,
                          color: 'var(--text-primary)',
                        }}>
                          {dayNames[date.getDay()]}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                          {date.getDate()} {months[date.getMonth()]}
                        </div>
                      </div>
                      {isSelected && (
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: 'var(--free)', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
              <button
                onClick={() => setSpecificStep('hours')}
                disabled={freeDays.length === 0}
                className="btn-primary"
              >
                Next — pick times
              </button>
            </>
          )}

          {/* Step 1b: Pick hours for each selected day */}
          {specificStep === 'hours' && (
            <>
              <div>
                <h2 className="section-title" style={{ fontSize: 24 }}>What times work?</h2>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
                  Tap hours for each day. Green = free, yellow = maybe.
                </p>
              </div>
              {freeDays.sort().map(d => {
                const date = new Date(d + 'T00:00:00')
                const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
                const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
                return (
                  <div key={d} style={{ marginBottom: 8 }}>
                    <div style={{
                      fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15,
                      marginBottom: 10, color: 'var(--text-primary)',
                    }}>
                      {dayNames[date.getDay()]} {date.getDate()} {months[date.getMonth()]}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {HOURS.map(h => {
                        const key = `${d}|${h}`
                        const status = slots[key] || 'busy'
                        return (
                          <button
                            key={key}
                            onClick={() => {
                              const next = status === 'busy' ? 'free' : status === 'free' ? 'maybe' : 'busy'
                              setSlots(prev => ({ ...prev, [key]: next }))
                            }}
                            style={{
                              padding: '10px 14px',
                              fontSize: 13,
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 600,
                              borderRadius: 'var(--radius-sm)',
                              border: `2px solid ${status === 'free' ? 'var(--free)' : status === 'maybe' ? 'var(--maybe)' : 'var(--border-light)'}`,
                              background: status === 'free' ? 'var(--free-light)' : status === 'maybe' ? 'var(--maybe-light)' : 'var(--surface)',
                              color: status === 'free' ? '#1a7a3a' : status === 'maybe' ? '#8a6d10' : 'var(--text-muted)',
                              cursor: 'pointer',
                              transition: 'all 0.1s ease',
                            }}
                          >
                            {formatHour(h)}
                          </button>
                        )
                      })}
                    </div>
                    {/* Quick actions per day */}
                    <button
                      onClick={() => {
                        const newSlots = { ...slots }
                        HOURS.forEach(h => { newSlots[`${d}|${h}`] = 'free' })
                        setSlots(newSlots)
                      }}
                      style={{
                        marginTop: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600,
                        color: 'var(--free)', background: 'none', border: 'none', cursor: 'pointer',
                      }}
                    >
                      All day free
                    </button>
                  </div>
                )
              })}
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setSpecificStep('days')} className="btn-secondary" style={{ flex: 1 }}>Back</button>
                <button onClick={submitAvailability} className="btn-primary" style={{ flex: 1 }}>Next</button>
              </div>
            </>
          )}
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
