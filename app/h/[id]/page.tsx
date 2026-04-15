"use client"
import { useState, useEffect, useRef, useCallback, use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { formatDeadline } from "@/lib/time"

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
  return dates.slice(0, 31) // allow up to 31 days; was capped at 7
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
  const [bringList, setBringList] = useState<any[]>([])
  const [step, setStep] = useState(editPid ? 1 : 0) // skip to availability if editing
  const [friendName, setFriendName] = useState("")
  const [participantId, setPid] = useState("")
  const [slots, setSlots] = useState<Record<string, string>>({})
  const [votes, setVotes] = useState<Record<number, string>>({})
  // Phase 2: commitment + conditional fields
  const [commitment, setCommitment] = useState<'in' | 'probably' | 'cant' | null>(null)
  const [dietary, setDietary] = useState("")
  const [customAnswer, setCustomAnswer] = useState("")
  // Specific-days mode state
  const [freeDays, setFreeDays] = useState<string[]>([]) // which days the friend picked
  const [specificStep, setSpecificStep] = useState<'days' | 'hours'>('days')
  const [loading, setLoading] = useState(true)

  // Drag-to-select state
  const isDragging = useRef(false)
  const paintStatus = useRef<string>("free") // what status we're painting while dragging
  // Roving tabindex for keyboard nav on the availability grid. One cell is
  // tab-focusable at a time; arrow keys move focus between cells.
  const [focusedSlot, setFocusedSlot] = useState<string | null>(null)

  // Tiny haptic pulse on cell flips — makes the grid feel native on iOS/Android.
  // No-op on desktop browsers without vibration support.
  const haptic = (ms = 5) => {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(ms) } catch { /* ignore */ }
    }
  }

  const handleDragStart = (date: string, hour: number) => {
    isDragging.current = true
    const key = `${date}|${hour}`
    const current = slots[key] || "busy"
    // Determine what to paint: cycle forward from current
    const next = current === "busy" ? "free" : current === "free" ? "maybe" : "busy"
    paintStatus.current = next
    setSlots(prev => ({ ...prev, [key]: next }))
    haptic()
  }

  const handleDragEnter = (date: string, hour: number) => {
    if (!isDragging.current) return
    const key = `${date}|${hour}`
    setSlots(prev => {
      if (prev[key] === paintStatus.current) return prev
      haptic(3)
      return { ...prev, [key]: paintStatus.current }
    })
  }

  const handleDragEnd = useCallback(() => {
    isDragging.current = false
  }, [])

  // Toggle a single cell without involving the drag state. Used by Space/Enter
  // keyboard activation so screen reader + keyboard users can cycle slot status.
  const toggleSlot = useCallback((date: string, hour: number) => {
    const key = `${date}|${hour}`
    setSlots(prev => {
      const current = prev[key] || 'busy'
      const next = current === 'busy' ? 'free' : current === 'free' ? 'maybe' : 'busy'
      return { ...prev, [key]: next }
    })
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(5) } catch { /* ignore */ }
    }
  }, [])

  // Scroll to top whenever the step advances — the input that needs attention
  // is always near the top of the new step, but framer-motion's slide-in
  // animation starts from the previous scroll position.
  useEffect(() => {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [step])

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
    fetch(`/api/hangs/${id}/bring-list`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setBringList(d) })
      .catch(err => console.warn('[hangs] bring-list fetch failed:', err))

    // Prefill the name input from the last hang this user filled in — saves
    // returning users from retyping. 20% of users create 80% of hangouts.
    const lastName = typeof window !== 'undefined' ? localStorage.getItem('hangs_last_name') : null
    if (lastName) setFriendName(lastName)

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
    localStorage.setItem('hangs_last_name', friendName.trim())
    if (data.token) localStorage.setItem(`hangs_token_${id}`, data.token)
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
    const token = typeof window !== 'undefined' ? localStorage.getItem(`hangs_token_${id}`) || '' : ''
    await fetch(`/api/hangs/${id}/availability`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ slots: slotArray }),
    })
    // If editing, go straight back to results (skip voting)
    if (editPid) {
      localStorage.setItem(`hangs_participant_${id}`, participantId)
      router.push(`/h/${id}/results`)
      return
    }
    setStep(2)
  }

  // After submitting votes, advance to the next applicable finalize step instead
  // of redirecting. The final commitment step handles the redirect + POSTs
  // dietary/custom answer/commitment level.
  const submitVotes = async () => {
    const voteList = Object.entries(votes).map(([actId, vote]) => ({
      activityId: parseInt(actId),
      vote,
    }))
    if (voteList.length > 0) {
      const token = typeof window !== 'undefined' ? localStorage.getItem(`hangs_token_${id}`) || '' : ''
      await fetch(`/api/hangs/${id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ votes: voteList }),
      })
    }
    // Advance to the next applicable step: dietary → custom question → commitment
    if (hang?.hang?.ask_dietary) setStep(3)
    else if (hang?.hang?.custom_question) setStep(4)
    else setStep(5)
  }

  // Final submit — runs after commitment is picked. Sends commitment + dietary +
  // custom answer in one call, then redirects to results.
  const submitCommitment = async () => {
    if (!commitment) return
    const token = typeof window !== 'undefined' ? localStorage.getItem(`hangs_token_${id}`) || '' : ''
    await fetch(`/api/hangs/${id}/commitment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({
        level: commitment,
        dietary: dietary || undefined,
        customAnswer: customAnswer || undefined,
      }),
    })
    localStorage.setItem(`hangs_participant_${id}`, participantId)
    router.push(`/h/${id}/results`)
  }

  if (loading) return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '16px 20px 48px', textAlign: 'center' }}>
      <style>{`
        @keyframes hangs-skeleton-shimmer {
          0% { background-position: -400px 0 }
          100% { background-position: 400px 0 }
        }
        .hangs-skel {
          background: linear-gradient(90deg, var(--surface-dim) 0%, var(--border-light) 50%, var(--surface-dim) 100%);
          background-size: 800px 100%;
          animation: hangs-skeleton-shimmer 1.4s linear infinite;
          border-radius: var(--radius-sm);
        }
      `}</style>
      <div className="hangs-skel" style={{ height: 8, width: '60%', margin: '0 auto 36px' }} />
      <div className="hangs-skel" style={{ height: 34, width: '75%', margin: '0 auto 12px' }} />
      <div className="hangs-skel" style={{ height: 14, width: '45%', margin: '0 auto 32px' }} />
      <div className="card" style={{ padding: '18px 20px', textAlign: 'left', marginBottom: 28 }}>
        <div className="hangs-skel" style={{ height: 14, width: '90%', marginBottom: 8 }} />
        <div className="hangs-skel" style={{ height: 14, width: '70%', marginBottom: 14 }} />
        <div className="hangs-skel" style={{ height: 24, width: 110, marginBottom: 14, borderRadius: 6 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          <div className="hangs-skel" style={{ height: 22, width: 70, borderRadius: 6 }} />
          <div className="hangs-skel" style={{ height: 22, width: 84, borderRadius: 6 }} />
          <div className="hangs-skel" style={{ height: 22, width: 60, borderRadius: 6 }} />
        </div>
      </div>
      <div className="hangs-skel" style={{ height: 52, width: '100%', marginBottom: 12 }} />
      <div className="hangs-skel" style={{ height: 50, width: '100%' }} />
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

  // Number of UI steps for the progress bar (dynamic based on optional fields)
  const totalSteps = 3 + (hang.hang.ask_dietary ? 1 : 0) + (hang.hang.custom_question ? 1 : 0) + 1 // name, avail, vote, [dietary], [custom], commitment

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '16px 20px 48px' }}>
      {/* Progress */}
      {step < 6 && (
        <div className="progress-bar" style={{ marginBottom: 28 }}>
          {Array.from({ length: totalSteps }).map((_, s) => (
            <div key={s} className={`progress-dot ${s <= Math.min(step, totalSteps - 1) ? 'progress-dot-active' : ''}`} />
          ))}
        </div>
      )}

      <AnimatePresence mode="wait">
      {/* Step 0: Context card + Name / returning user */}
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
            {(() => {
              const d = formatDeadline(hang.hang.response_deadline)
              if (!d) return null
              const color = d.closed ? 'var(--text-muted)' : d.urgent ? 'var(--error)' : 'var(--text-secondary)'
              const bg = d.urgent ? '#fef2f2' : 'var(--surface-dim)'
              const border = d.urgent ? 'var(--error)' : 'var(--border-light)'
              return (
                <div style={{
                  display: 'inline-block', marginTop: 10,
                  fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)',
                  color, background: bg, border: `1px solid ${border}`,
                  padding: '4px 12px', borderRadius: 6,
                }}>
                  ⏰ {d.text}
                </div>
              )
            })()}
          </div>

          {/* Context card: description / theme / dress code / location / activities / bring list */}
          {(hang.hang.description || hang.hang.theme || hang.hang.dress_code || hang.hang.location || (hang.activities?.length > 0) || bringList.length > 0) && (
            <div className="card" style={{ padding: '18px 20px', textAlign: 'left' }}>
              {hang.hang.description && (
                <p style={{ fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.5, marginBottom: 14 }}>
                  {hang.hang.description}
                </p>
              )}
              {(hang.hang.theme || hang.hang.dress_code) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                  {hang.hang.theme && (
                    <div style={{ padding: '4px 10px', background: 'var(--maybe-light)', color: '#8a6d10', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
                      🎨 {hang.hang.theme}
                    </div>
                  )}
                  {hang.hang.dress_code && (
                    <div style={{ padding: '4px 10px', background: 'var(--surface-dim)', color: 'var(--text-secondary)', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
                      👕 {hang.hang.dress_code}
                    </div>
                  )}
                </div>
              )}
              {hang.hang.location && (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
                  📍 {hang.hang.location.length > 60 ? hang.hang.location.slice(0, 60) + '…' : hang.hang.location}
                </div>
              )}
              {hang.activities?.length > 0 && (
                <div style={{ marginBottom: bringList.length > 0 ? 14 : 0 }}>
                  <div className="label" style={{ marginBottom: 6 }}>Activities on the table</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {hang.activities.map((a: any) => (
                      <span key={a.id} style={{ padding: '4px 10px', background: 'var(--surface-dim)', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
                        {a.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {bringList.length > 0 && (
                <div>
                  <div className="label" style={{ marginBottom: 6 }}>Bring list</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {bringList.map((item: any) => (
                      <span key={item.id} style={{ padding: '4px 10px', background: 'var(--free-light)', color: '#1a7a3a', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
                        {item.item}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

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

          {/* Who's in so far — social proof. Doubles as returning-user picker. */}
          {hang.participants?.length > 0 && (() => {
            const inCount = hang.participants.filter((p: any) => p.commitmentLevel === 'in').length
            const probablyCount = hang.participants.filter((p: any) => p.commitmentLevel === 'probably').length
            const cantCount = hang.participants.filter((p: any) => p.commitmentLevel === 'cant').length
            return (
              <div style={{ paddingTop: 16, borderTop: '1px solid var(--border-light)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 10, marginBottom: 12 }}>
                  <div className="label" style={{ margin: 0 }}>Who's in so far</div>
                  {(inCount + probablyCount + cantCount) > 0 && (
                    <div style={{ display: 'flex', gap: 6, fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                      {inCount > 0 && <span style={{ color: 'var(--free, #1a7a3a)' }}>🔥 {inCount} in</span>}
                      {probablyCount > 0 && <span style={{ color: '#8a6d10' }}>👀 {probablyCount} probably</span>}
                      {cantCount > 0 && <span style={{ color: 'var(--text-muted)' }}>😔 {cantCount} can't</span>}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 10 }}>
                  Already responded? Tap your name
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                {hang.participants.map((p: any) => {
                  // Color each chip by commitment level — green "in", yellow "probably",
                  // muted "can't", subtle gray for haven't-committed-yet.
                  const level = p.commitmentLevel as 'in' | 'probably' | 'cant' | null
                  const avatarBg = level === 'in' ? 'var(--free, #2e9d5f)' : level === 'probably' ? '#d4a920' : level === 'cant' ? 'var(--text-muted)' : 'var(--accent)'
                  const borderColor = level === 'in' ? 'var(--free, #2e9d5f)' : level === 'probably' ? '#d4a920' : 'var(--border-light)'
                  const bgColor = level === 'in' ? 'var(--free-light, #e9f7ee)' : level === 'probably' ? 'var(--maybe-light, #fff5d6)' : 'var(--surface)'
                  const statusBadge = level === 'in' ? '✓' : level === 'probably' ? '~' : level === 'cant' ? '✗' : null
                  const ariaStatus = level === 'in' ? 'is in' : level === 'probably' ? 'is probably in' : level === 'cant' ? "can't make it" : 'has not responded yet'
                  return (
                  <button
                    key={p.id}
                    aria-label={`${p.name} ${ariaStatus}. Tap to continue as ${p.name}.`}
                    onClick={() => {
                      setPid(p.id)
                      localStorage.setItem(`hangs_participant_${id}`, p.id)
                      router.replace(`/h/${id}/results`)
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 16px',
                      background: bgColor,
                      border: `1px solid ${borderColor}`,
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      position: 'relative',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)' }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
                  >
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%',
                      background: avatarBg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700, color: '#fff',
                    }}>
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</span>
                    {statusBadge && (
                      <span aria-hidden="true" style={{
                        fontSize: 10, fontWeight: 800, fontFamily: 'var(--font-mono)',
                        padding: '2px 6px', borderRadius: 4,
                        background: level === 'in' ? 'var(--free, #2e9d5f)' : level === 'probably' ? '#d4a920' : 'var(--surface-dim)',
                        color: level === 'cant' ? 'var(--text-muted)' : '#fff',
                      }}>{statusBadge}</span>
                    )}
                  </button>
                )})}
                </div>
              </div>
            )
          })()}
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
            onKeyDown={(e) => {
              if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return
              if (dates.length === 0) return
              e.preventDefault()
              const currentKey = focusedSlot || `${dates[0]}|${HOURS[0]}`
              const [curDate, curHourStr] = currentKey.split('|')
              const curDateIdx = Math.max(0, dates.indexOf(curDate))
              const curHourIdx = Math.max(0, HOURS.indexOf(parseInt(curHourStr)))
              let nDateIdx = curDateIdx, nHourIdx = curHourIdx
              if (e.key === 'ArrowLeft')  nDateIdx = Math.max(0, curDateIdx - 1)
              if (e.key === 'ArrowRight') nDateIdx = Math.min(dates.length - 1, curDateIdx + 1)
              if (e.key === 'ArrowUp')    nHourIdx = Math.max(0, curHourIdx - 1)
              if (e.key === 'ArrowDown')  nHourIdx = Math.min(HOURS.length - 1, curHourIdx + 1)
              if (e.key === 'Home')       { nDateIdx = 0; nHourIdx = 0 }
              if (e.key === 'End')        { nDateIdx = dates.length - 1; nHourIdx = HOURS.length - 1 }
              const newKey = `${dates[nDateIdx]}|${HOURS[nHourIdx]}`
              setFocusedSlot(newKey)
              cellRefs.current.get(newKey)?.focus()
            }}
          >
            <div
              ref={gridRef}
              role="grid"
              aria-label="Availability grid — arrow keys to navigate, space to cycle free / maybe / busy"
              aria-rowcount={HOURS.length + 1}
              aria-colcount={dates.length + 1}
              style={{
                display: 'inline-grid',
                gridTemplateColumns: `60px repeat(${dates.length}, 48px)`,
                gap: 2,
              }}
            >
              <div role="row" style={{ display: 'contents' }}>
                <div role="columnheader" aria-hidden="true" />
                {dates.map(d => (
                  <div key={d} role="columnheader" className="grid-header">{formatDay(d)}</div>
                ))}
              </div>
              {HOURS.map(h => {
                const hourLabel = formatHour(h)
                return (
                  <div key={h} role="row" style={{ display: 'contents' }}>
                    <div role="rowheader" style={{
                      fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)',
                      display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6,
                    }}>{hourLabel}</div>
                    {dates.map(d => {
                      const key = `${d}|${h}`
                      const status = slots[key] || "busy"
                      const focusableKey = focusedSlot || `${dates[0]}|${HOURS[0]}`
                      const isFocusable = key === focusableKey
                      const dateObj = new Date(d + "T00:00:00")
                      const fullDay = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dateObj.getDay()]
                      const statusWord = status === 'busy' ? 'not free' : status
                      return (
                        <button
                          key={key}
                          data-slot-key={key}
                          ref={(el) => {
                            if (el) cellRefs.current.set(key, el)
                            else cellRefs.current.delete(key)
                          }}
                          role="gridcell"
                          aria-label={`${fullDay} ${dateObj.getDate()}, ${hourLabel}, ${statusWord}`}
                          aria-pressed={status !== 'busy'}
                          tabIndex={isFocusable ? 0 : -1}
                          onFocus={() => setFocusedSlot(key)}
                          onMouseDown={(e) => { e.preventDefault(); handleDragStart(d, h) }}
                          onMouseEnter={() => handleDragEnter(d, h)}
                          onTouchStart={() => handleDragStart(d, h)}
                          onKeyDown={(e) => {
                            if (e.key === ' ' || e.key === 'Enter') {
                              e.preventDefault()
                              toggleSlot(d, h)
                            }
                          }}
                          className={`grid-cell grid-cell-${status}`}
                        />
                      )
                    })}
                  </div>
                )
              })}
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
                    <div role="group" aria-label={`Hours for ${dayNames[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {HOURS.map(h => {
                        const key = `${d}|${h}`
                        const status = slots[key] || 'busy'
                        const statusWord = status === 'busy' ? 'not free' : status
                        return (
                          <button
                            key={key}
                            aria-label={`${formatHour(h)} — ${statusWord}`}
                            aria-pressed={status !== 'busy'}
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
          {(!hang.activities || hang.activities.length === 0) && (
            <div style={{
              padding: '24px 20px', textAlign: 'center',
              background: 'var(--surface-dim)', borderRadius: 'var(--radius-md)',
              border: '1px dashed var(--border)',
            }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🤷</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>
                No activities yet
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {hang.hang.creator_name} hasn't added any — you can skip this step.
              </div>
            </div>
          )}
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
                <div role="radiogroup" aria-label={`Vote on ${a.name}`} style={{ display: 'flex', gap: 8 }}>
                  {[
                    { key: "up", label: "Keen", cls: "vote-keen" },
                    { key: "meh", label: "Meh", cls: "vote-meh" },
                    { key: "down", label: "Nah", cls: "vote-nah" },
                  ].map(v => (
                    <button
                      key={v.key}
                      role="radio"
                      aria-checked={votes[a.id] === v.key}
                      aria-label={`${v.label} — ${a.name}`}
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
            Next
          </button>
        </motion.div>
      )}

      {/* Step 3: Dietary (only if creator asked) */}
      {step === 3 && hang.hang.ask_dietary && (
        <motion.div key="s3" {...stepAnim} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <h2 className="section-title" style={{ fontSize: 24 }}>Any dietary stuff?</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
              So {hang.hang.creator_name} knows what to plan for.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {['No restrictions', 'Vegetarian', 'Vegan', 'Gluten-free', 'Other'].map(opt => (
              <button
                key={opt}
                onClick={() => setDietary(opt)}
                style={{
                  padding: '14px 18px',
                  background: dietary === opt ? 'var(--accent)' : 'var(--surface)',
                  color: dietary === opt ? 'var(--accent-text)' : 'var(--text-primary)',
                  border: `2px solid ${dietary === opt ? 'var(--accent)' : 'var(--border-light)'}`,
                  borderRadius: 'var(--radius-md)', cursor: 'pointer',
                  fontSize: 15, fontWeight: 600, textAlign: 'left',
                }}
              >
                {opt}
              </button>
            ))}
            {dietary === 'Other' && (
              <input
                type="text"
                placeholder="Describe…"
                onChange={e => setDietary(`Other: ${e.target.value}`.slice(0, 60))}
                className="input"
                autoFocus
              />
            )}
          </div>
          <button
            onClick={() => setStep(hang.hang.custom_question ? 4 : 5)}
            disabled={!dietary}
            className="btn-primary"
          >
            Next
          </button>
        </motion.div>
      )}

      {/* Step 4: Custom question (only if creator set one) */}
      {step === 4 && hang.hang.custom_question && (
        <motion.div key="s4" {...stepAnim} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <h2 className="section-title" style={{ fontSize: 24 }}>{hang.hang.custom_question}</h2>
          </div>
          <input
            type="text"
            value={customAnswer}
            onChange={e => setCustomAnswer(e.target.value.slice(0, 300))}
            placeholder="Your answer…"
            className="input"
            style={{ fontSize: 16 }}
            autoFocus
          />
          <button
            onClick={() => setStep(5)}
            disabled={!customAnswer.trim()}
            className="btn-primary"
          >
            Next
          </button>
        </motion.div>
      )}

      {/* Step 5: Commitment — mandatory, always last */}
      {step === 5 && (
        <motion.div key="s5" {...stepAnim} style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <h2 className="section-title" style={{ fontSize: 26 }}>Are you actually coming?</h2>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>
              Be honest — this helps {hang.hang.creator_name} plan properly.
            </p>
          </div>
          <div role="radiogroup" aria-label="Commitment level" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { key: 'in' as const, label: "I'm in", desc: 'Definitely there', emoji: '🔥', color: 'var(--free)', bg: 'var(--free-light)', text: '#1a7a3a' },
              { key: 'probably' as const, label: 'Probably', desc: "If nothing comes up", emoji: '👀', color: 'var(--maybe)', bg: 'var(--maybe-light)', text: '#8a6d10' },
              { key: 'cant' as const, label: "Can't make it", desc: 'Just marking availability to help', emoji: '😔', color: 'var(--error)', bg: '#fef2f2', text: 'var(--error)' },
            ].map(opt => {
              const selected = commitment === opt.key
              return (
                <button
                  key={opt.key}
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${opt.label} — ${opt.desc}`}
                  onClick={() => setCommitment(opt.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '18px 20px',
                    background: selected ? opt.bg : 'var(--surface)',
                    border: `2px solid ${selected ? opt.color : 'var(--border-light)'}`,
                    borderRadius: 'var(--radius-md)', cursor: 'pointer',
                    textAlign: 'left', transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{ fontSize: 28 }}>{opt.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17,
                      color: selected ? opt.text : 'var(--text-primary)',
                    }}>
                      {opt.label}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                      {opt.desc}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
          <button onClick={submitCommitment} disabled={!commitment} className="btn-primary">
            {commitment ? 'Submit' : 'Pick one to submit'}
          </button>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Step 3 no longer exists — user is redirected to /h/[id]/results */}
    </div>
  )
}
