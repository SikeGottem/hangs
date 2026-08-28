"use client"
import { useState, useEffect, useRef, useCallback, use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { expandDateRange, formatDeadline } from "@/lib/time"
import { OnboardingHero, InlineTip } from "@/components/FirstVisitCoach"
import GoogleCalendarSync from "@/components/GoogleCalendarSync"
import { showToast } from "@/components/Toast"
import styles from "./respond.module.css"

const stepAnim = {
  initial: { opacity: 0, x: 30 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -30 },
  transition: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
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
  // [P0] Separate otherText keeps the "Other" input mounted even after one keystroke
  const [otherText, setOtherText] = useState("")
  const [customAnswer, setCustomAnswer] = useState("")
  // [med] join loading + error state
  const [joining, setJoining] = useState(false)
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
    // [high] Drag intent is derived from the FIRST cell only: busy→free, anything else→erase.
    // This keeps multi-cell drags predictable (no mid-stroke colour flip).
    // Single-tap keeps the 3-state cycle (handled by toggleSlot).
    const next = current === "busy" ? "free" : "busy"
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

  // [high] Attach touchmove with {passive:false} on the grid element so
  // preventDefault() actually suppresses scroll during drag-paint.
  // React's synthetic onTouchMove can't opt out of passive by default.
  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const handler = (e: TouchEvent) => {
      if (!isDragging.current) return
      e.preventDefault()
      const touch = e.touches[0]
      const target = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null
      if (target?.dataset.slotKey) {
        const key = target.dataset.slotKey
        setSlots(prev => {
          if (prev[key] === paintStatus.current) return prev
          return { ...prev, [key]: paintStatus.current }
        })
      }
    }
    el.addEventListener('touchmove', handler, { passive: false })
    return () => el.removeEventListener('touchmove', handler)
  })

  // Crew prefill banner state — non-null when a logged-in crew member was
  // auto-joined with data pulled from their crew profile.
  const [crewPrefill, setCrewPrefill] = useState<{ name: string; dietary: string | null } | null>(null)
  // Crew member's saved weekly availability shape — used by "Use my usual" button
  const [crewShape, setCrewShape] = useState<Record<string, string> | null>(null)

  useEffect(() => {
    fetch(`/api/hangs/${id}`).then(r => r.json()).then(d => { setHang(d); setLoading(false) })
    fetch(`/api/hangs/${id}/bring-list`)
      .then(r => {
        if (!r.ok) throw new Error(`bring-list ${r.status}`)
        return r.json()
      })
      .then(d => { if (Array.isArray(d)) setBringList(d) })
      .catch(err => {
        console.warn('[hangs] bring-list fetch failed:', err)
        showToast("Couldn't load bring list — tap to retry later", 'error')
      })

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

  // Crew-member auto-join: when a logged-in user opens a hang for a crew they
  // belong to, skip the name/dietary/custom-question steps entirely and jump
  // straight into availability. Server validates membership and pulls the
  // display_name + dietary from their crew profile. This is the key
  // "respond in <15 seconds" feature for returning crew members.
  useEffect(() => {
    if (!hang?.hang) return
    const crewId = hang.hang.crew_id
    if (!crewId) return
    // Skip if we already have a participantId (either edit mode or returning responder)
    if (participantId || editPid) return
    const existing = typeof window !== 'undefined' ? localStorage.getItem(`hangs_participant_${id}`) : null
    if (existing) return

    let cancelled = false
    ;(async () => {
      // Narrow the try/catch to the network layer so we can tell "user isn't
      // in a crew, walk them through the full flow" (silent, expected) apart
      // from "user IS logged in but the network dropped mid-prefill" (toast).
      let me: any = null
      try {
        const meRes = await fetch('/api/me')
        if (cancelled) return
        me = await meRes.json()
      } catch {
        return // offline or /me unreachable — silent, full flow still works
      }
      if (!me?.user) return
      try {
        const joinRes = await fetch(`/api/hangs/${id}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
        if (!joinRes.ok) return // not a crew member of this hang — expected
        const data = await joinRes.json()
        if (cancelled) return
        if (!data.prefilled) return
        setPid(data.participantId)
        setFriendName(data.name)
        if (data.dietary) setDietary(data.dietary)
        localStorage.setItem(`hangs_participant_${id}`, data.participantId)
        if (data.token) localStorage.setItem(`hangs_token_${id}`, data.token)
        if (data.name) localStorage.setItem('hangs_last_name', data.name)
        setCrewPrefill({ name: data.name, dietary: data.dietary || null })
        if (data.availabilityShape && typeof data.availabilityShape === 'object') {
          setCrewShape(data.availabilityShape)
        }
        // Jump past the name step
        setStep(1)
      } catch (e) {
        // /me succeeded (user is logged in) but /join blew up — this is the
        // case the user actually notices (they expected prefill). Tell them.
        console.warn('[hangs] crew auto-join failed:', e)
        if (!cancelled) showToast("Couldn't pull your crew profile — fill in manually", 'error')
      }
    })()
    return () => { cancelled = true }
  }, [hang, id, participantId, editPid])

  const join = async () => {
    // [med] Show a disabled/spinner state during the network call; catch failures with a toast.
    setJoining(true)
    try {
      const res = await fetch(`/api/hangs/${id}/join`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: friendName }),
      })
      if (!res.ok) throw new Error(`join ${res.status}`)
      const data = await res.json()
      setPid(data.participantId)
      localStorage.setItem(`hangs_participant_${id}`, data.participantId)
      localStorage.setItem('hangs_last_name', friendName.trim())
      if (data.token) localStorage.setItem(`hangs_token_${id}`, data.token)
      setStep(1)
    } catch (err) {
      console.warn('[hangs] join failed:', err)
      showToast("Couldn't join — check your connection and try again", 'error')
    } finally {
      setJoining(false)
    }
  }

  const offeredAvailabilityDates = (): string[] => {
    if (!hang) return []
    if (hang.hang.date_mode !== 'specific') {
      return expandDateRange(hang.hang.date_range_start, hang.hang.date_range_end)
    }
    try {
      const dates: unknown = JSON.parse(hang.hang.selected_dates || '[]')
      return Array.isArray(dates)
        ? [...new Set(dates.filter((date: unknown): date is string => typeof date === 'string'))].sort()
        : []
    } catch {
      return []
    }
  }

  const activeAvailabilityDates = (): string[] => {
    const offered = offeredAvailabilityDates()
    const usesSpecificHourPicker = hang?.hang.date_mode === 'specific' && hang?.hang.time_granularity !== 'blocks'
    if (!usesSpecificHourPicker) return offered
    const chosen = new Set(freeDays)
    return offered.filter(date => chosen.has(date))
  }

  const markAllFree = () => {
    const dates = activeAvailabilityDates()
    const allSlots: Record<string, string> = {}
    for (const d of dates) for (const h of HOURS) allSlots[`${d}|${h}`] = "free"
    setSlots(allSlots)
  }

  // Preset filters for the availability grid. Each takes a (date, hour) pair
  // and returns whether that slot should be marked free. This is the single
  // biggest friction killer on the respond page — 80% of responders will tap
  // one of these instead of painting the grid by hand.
  const presetIconProps = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  const PRESETS: { key: string; label: string; icon: React.ReactElement; match: (d: Date, h: number) => boolean }[] = [
    {
      key: 'weekdayEvenings', label: 'Weekday evenings',
      icon: <svg {...presetIconProps}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
      match: (d, h) => d.getDay() >= 1 && d.getDay() <= 5 && h >= 17 && h <= 22,
    },
    {
      key: 'weekendAllDay', label: 'Weekend all day',
      icon: <svg {...presetIconProps}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>,
      match: (d, h) => (d.getDay() === 0 || d.getDay() === 6) && h >= 10 && h <= 22,
    },
    {
      key: 'afterWork', label: 'After work',
      icon: <svg {...presetIconProps}><path d="M12 10V2"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="M16 18a4 4 0 0 0-8 0"/></svg>,
      match: (d, h) => d.getDay() >= 1 && d.getDay() <= 5 && h >= 18 && h <= 23,
    },
    {
      key: 'anytime', label: "I'm flexible",
      icon: <svg {...presetIconProps}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>,
      match: (_d, _h) => true,
    },
  ]

  const applyPreset = (presetKey: string) => {
    if (!hang) return
    const preset = PRESETS.find(p => p.key === presetKey)
    if (!preset) return
    const dateList = activeAvailabilityDates()
    const newSlots: Record<string, string> = { ...slots }
    for (const d of dateList) {
      const dateObj = new Date(d + 'T00:00:00')
      for (const h of HOURS) {
        const key = `${d}|${h}`
        if (preset.match(dateObj, h)) newSlots[key] = 'free'
      }
    }
    setSlots(newSlots)
    // Remember which preset the user picked for next time.
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('hangs_last_preset', presetKey) } catch { /* ignore */ }
    }
    // Haptic confirmation — big state change deserves a pulse.
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate([8, 30, 8]) } catch { /* ignore */ }
    }
  }

  // Apply the user's previous-hang availability shape if they have one saved.
  // We store the raw slot pattern by weekday+hour (e.g. "Mon|18" → "free") so
  // it generalises across hangs with different date ranges.
  const applyLastHangShape = () => {
    if (!hang) return
    if (typeof window === 'undefined') return
    let pattern: Record<string, string> = {}
    try {
      const raw = localStorage.getItem('hangs_last_availability_shape')
      if (!raw) return
      pattern = JSON.parse(raw)
    } catch { return }
    const dateList = activeAvailabilityDates()
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    const newSlots: Record<string, string> = { ...slots }
    for (const d of dateList) {
      const dayName = dayNames[new Date(d + 'T00:00:00').getDay()]
      for (const h of HOURS) {
        const patternKey = `${dayName}|${h}`
        const status = pattern[patternKey]
        if (status && status !== 'busy') newSlots[`${d}|${h}`] = status
      }
    }
    setSlots(newSlots)
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate([8, 30, 8]) } catch { /* ignore */ }
    }
  }

  // Is there a saved availability pattern from a prior hang?
  const [hasLastShape, setHasLastShape] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    try { setHasLastShape(!!localStorage.getItem('hangs_last_availability_shape')) } catch { /* ignore */ }
  }, [])

  // Apply the logged-in crew member's saved availability_shape (from their
  // crew_members row) to the current hang's dates. Overrides whatever's on
  // the grid so "Use my usual" is always a clean rehydrate.
  const applyCrewShape = () => {
    if (!hang || !crewShape) return
    const dateList = activeAvailabilityDates()
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const newSlots: Record<string, string> = {}
    for (const d of dateList) {
      const dayName = dayNames[new Date(d + 'T00:00:00').getDay()]
      for (const h of HOURS) {
        const status = crewShape[`${dayName}|${h}`]
        if (status && status !== 'busy') newSlots[`${d}|${h}`] = status
      }
    }
    setSlots(newSlots)
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate([8, 30, 8]) } catch { /* ignore */ }
    }
  }

  const submitAvailability = async () => {
    const allowedDates = new Set(activeAvailabilityDates())
    const slotArray = Object.entries(slots).map(([key, status]) => {
      const [date, hour] = key.split("|")
      return { date, hour: parseInt(hour), status }
    }).filter(s => s.status !== "busy" && allowedDates.has(s.date))
    const token = typeof window !== 'undefined' ? localStorage.getItem(`hangs_token_${id}`) || '' : ''
    await fetch(`/api/hangs/${id}/availability`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ slots: slotArray }),
    })
    // Persist the user's availability shape by weekday+hour (not absolute date)
    // so "same as last time" can rehydrate it into a future hang with a
    // totally different date range. Only stores free/maybe, not busy.
    if (typeof window !== 'undefined' && slotArray.length > 0) {
      const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
      const shape: Record<string, string> = {}
      for (const s of slotArray) {
        const dayName = dayNames[new Date(s.date + 'T00:00:00').getDay()]
        shape[`${dayName}|${s.hour}`] = s.status
      }
      try { localStorage.setItem('hangs_last_availability_shape', JSON.stringify(shape)) } catch { /* ignore */ }
    }
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
    // Advance to the next applicable step: dietary → custom question → commitment.
    // Crew members with dietary already on their profile skip step 3.
    const skipDietary = !!crewPrefill?.dietary
    if (hang?.hang?.ask_dietary && !skipDietary) setStep(3)
    else if (hang?.hang?.custom_question) setStep(4)
    else setStep(5)
  }

  // Final submit — runs after commitment is picked. Sends commitment + dietary +
  // custom answer in one call, then redirects to results.
  const submitCommitment = async () => {
    if (!commitment) return
    const token = typeof window !== 'undefined' ? localStorage.getItem(`hangs_token_${id}`) || '' : ''
    // [P0] Compose the final dietary value here so the "Other" input staying mounted
    // doesn't affect which value gets sent.
    const finalDietary = (dietary === 'Other' || dietary.startsWith('Other:'))
      ? (otherText.trim() ? `Other: ${otherText.trim()}` : undefined)
      : (dietary || undefined)
    await fetch(`/api/hangs/${id}/commitment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({
        level: commitment,
        dietary: finalDietary,
        customAnswer: customAnswer || undefined,
      }),
    })
    localStorage.setItem(`hangs_participant_${id}`, participantId)
    router.push(`/h/${id}/results`)
  }

  if (loading) return (
    <div className={`${styles.page} ${styles.loading}`} style={{ maxWidth: 520, margin: '0 auto', padding: '16px 20px 48px', textAlign: 'center' }}>
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
  if (!hang?.hang) return (
    <div className={`${styles.page} ${styles.empty}`} style={{ textAlign: 'center', padding: '80px 24px', color: 'var(--text-muted)' }}>
      Hang not found
    </div>
  )

  const isSpecificMode = hang.hang.date_mode === 'specific'
  const dates = isSpecificMode
    ? (hang.hang.selected_dates ? JSON.parse(hang.hang.selected_dates) as string[] : []).sort()
    : expandDateRange(hang.hang.date_range_start, hang.hang.date_range_end)

  // [P0] Empty-grid guard: count non-busy slots so Next buttons can be disabled or soft-confirmed.
  const freeSlotCount = Object.values(slots).filter(s => s !== 'busy').length

  // Number of UI steps for the progress bar (dynamic based on optional fields)
  const totalSteps = 3 + (hang.hang.ask_dietary ? 1 : 0) + (hang.hang.custom_question ? 1 : 0) + 1 // name, avail, vote, [dietary], [custom], commitment

  return (
    <div className={styles.page} style={{ maxWidth: 520, margin: '0 auto', padding: '16px 20px 48px' }}>
      {/* Crew hero band — shown whenever the hang belongs to a crew.
          Signals "this is Climbing Soc, not a random link". */}
      {hang?.crew && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', marginBottom: 12,
            background: hang.crew.coverColor || 'var(--maybe-light)',
            borderRadius: 10,
            color: '#1A1A1A',
          }}
        >
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'rgba(255,255,255,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18,
          }}>
            {hang.crew.coverEmoji || '·'}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.7 }}>
              From the crew
            </div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{hang.crew.name}</div>
          </div>
        </motion.div>
      )}

      {/* Crew prefill banner — shown when we auto-joined via crew membership */}
      {crewPrefill && step < 5 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', marginBottom: 16,
            background: 'var(--maybe-light)', border: '1px solid #F5C842', borderRadius: 10,
            fontSize: 13,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: '#8a6d10', flexShrink: 0 }}>
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <div>
            <div style={{ fontWeight: 700 }}>Welcome back, {crewPrefill.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Name{crewPrefill.dietary ? ' + dietary' : ''} pulled from your crew profile.
            </div>
          </div>
        </motion.div>
      )}

      {/* First-visit onboarding — only on step 0, auto-hides after dismiss. */}
      {step === 0 && !editPid && <OnboardingHero />}

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
              // [P0] When closed, be honest — submissions are still accepted (no hard lock),
              // so say "late responses still count" rather than claiming closed.
              const displayText = d.closed
                ? `closed — late responses still count`
                : d.text
              return (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 10,
                  fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)',
                  color, background: bg, border: `1px solid ${border}`,
                  padding: '4px 12px', borderRadius: 6,
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                  {displayText}
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
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: 'var(--maybe-light)', color: '#8a6d10', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor"/>
                        <circle cx="17.5" cy="10.5" r="0.5" fill="currentColor"/>
                        <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor"/>
                        <circle cx="6.5" cy="12.5" r="0.5" fill="currentColor"/>
                        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
                      </svg>
                      {hang.hang.theme}
                    </div>
                  )}
                  {hang.hang.dress_code && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: 'var(--surface-dim)', color: 'var(--text-secondary)', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>
                      </svg>
                      {hang.hang.dress_code}
                    </div>
                  )}
                </div>
              )}
              {hang.hang.location && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                  {hang.hang.location.length > 60 ? hang.hang.location.slice(0, 60) + '…' : hang.hang.location}
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

          {/* spin keyframe for join button spinner */}
          <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
          {/* [med] Name gate — soften copy so the grid context is visible first. */}
          <div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
              Almost done — just let us know who you are
            </p>
            <input
              type="text" value={friendName} onChange={e => setFriendName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && friendName.trim() && !joining) join() }}
              placeholder="Your name"
              className="input"
              autoComplete="given-name"
              style={{ textAlign: 'center', fontSize: 18 }}
            />
            <button
              onClick={join}
              disabled={!friendName.trim() || joining}
              className="btn-primary"
              style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {joining ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ animation: 'spin 0.8s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" opacity="0.3"/><path d="M21 12a9 9 0 0 1-9 9"/>
                  </svg>
                  Joining…
                </>
              ) : 'Tap times to respond'}
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
                    <div style={{ display: 'flex', gap: 8, fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                      {inCount > 0 && (
                        <span style={{ color: 'var(--free-text, #1a7a3a)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                          {/* [high] Show tapped word "keen" not the DB key "in" */}
                          {inCount} keen
                        </span>
                      )}
                      {probablyCount > 0 && (
                        <span style={{ color: 'var(--maybe-text, #8a6d10)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="6" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18" cy="12" r="1"/></svg>
                          {probablyCount} depends
                        </span>
                      )}
                      {cantCount > 0 && (
                        <span style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          {cantCount} can&apos;t
                        </span>
                      )}
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
                  // [high] Match the vocabulary the user actually tapped (keen/depends/can't)
                  const statusBadge = level === 'in' ? 'keen' : level === 'probably' ? 'depends' : level === 'cant' ? "can't" : null
                  const ariaStatus = level === 'in' ? 'is keen' : level === 'probably' ? 'depends on timing' : level === 'cant' ? "can't make it" : 'has not responded yet'
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
                      transitionProperty: 'transform, box-shadow', transitionDuration: '150ms', transitionTimingFunction: 'ease',
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

      {/* Step 1: Availability — BLOCKS MODE (4 big pills per day).
          Hourly grid is thumb-hell on a 375px screen for a decision that's
          genuinely low-resolution ("evening" not "5:30-6:30"). Blocks mode
          collapses the 15 × N-day grid to 4 × N-day — one tap per block
          instead of drag-painting an hour ribbon. Underneath, slots are still
          stored hourly so synthesis and heatmap work unchanged. */}
      {step === 1 && hang.hang.time_granularity === 'blocks' && (() => {
        const iconProps = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
        const BLOCKS = [
          {
            key: 'morning',   label: 'Morning',   sub: '8am–12pm', hours: [8, 9, 10, 11],
            icon: (
              <svg {...iconProps}>
                <path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m17.66 6.34 1.41-1.41"/><path d="M22 18H2"/><path d="M8 18a4 4 0 0 1 8 0"/>
              </svg>
            ),
          },
          {
            key: 'afternoon', label: 'Afternoon', sub: '12–5pm', hours: [12, 13, 14, 15, 16],
            icon: (
              <svg {...iconProps}>
                <circle cx="12" cy="12" r="4"/>
                <path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>
              </svg>
            ),
          },
          {
            key: 'evening', label: 'Evening', sub: '5–9pm', hours: [17, 18, 19, 20],
            icon: (
              <svg {...iconProps}>
                <path d="M12 10V2"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m16 6-4 4-4-4"/><path d="M16 18a4 4 0 0 0-8 0"/>
              </svg>
            ),
          },
          {
            key: 'night', label: 'Night', sub: '9pm–12am', hours: [21, 22, 23],
            icon: (
              <svg {...iconProps}>
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            ),
          },
        ] as const
        // What status is this block currently in? If all its hours are the same,
        // that's the block status; if mixed, we treat it as "busy" so the next
        // tap flips the whole block to 'free'.
        const blockStatus = (date: string, block: typeof BLOCKS[number]) => {
          const statuses = block.hours.map(h => slots[`${date}|${h}`] || 'busy')
          const allSame = statuses.every(s => s === statuses[0])
          return allSame ? statuses[0] : 'busy'
        }
        const cycleBlock = (date: string, block: typeof BLOCKS[number]) => {
          const current = blockStatus(date, block)
          const next = current === 'busy' ? 'free' : current === 'free' ? 'maybe' : 'busy'
          setSlots(prev => {
            const copy = { ...prev }
            for (const h of block.hours) copy[`${date}|${h}`] = next
            return copy
          })
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try { navigator.vibrate(5) } catch {}
          }
        }
        return (
          <motion.div key="s1-blocks" {...stepAnim} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <h2 className="section-title" style={{ fontSize: 24 }}>When are you free?</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
                Tap the blocks that work. Tap again for &ldquo;maybe&rdquo;.
              </p>
              {/* [high] Always-visible legend */}
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--free-text, #1a7a3a)' }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--free)', display: 'inline-block' }} aria-hidden="true" />
                  free
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--maybe-text, #8a6d10)' }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--maybe)', display: 'inline-block' }} aria-hidden="true" />
                  maybe
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-muted)' }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--busy, #E8E3D9)', border: '1px solid var(--border)', display: 'inline-block' }} aria-hidden="true" />
                  busy
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {dates.map(d => {
                const date = new Date(d + 'T00:00:00')
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                return (
                  <div key={d}>
                    <div style={{
                      fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14,
                      color: 'var(--text-primary)', marginBottom: 8,
                    }}>
                      {dayNames[date.getDay()]} {date.getDate()} {months[date.getMonth()]}
                    </div>
                    <div role="group" aria-label={`Blocks for ${dayNames[date.getDay()]} ${date.getDate()}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                      {BLOCKS.map(b => {
                        const status = blockStatus(d, b)
                        const color = status === 'free' ? 'var(--free)' : status === 'maybe' ? 'var(--maybe)' : 'var(--border-light)'
                        const bg = status === 'free' ? 'var(--free-light)' : status === 'maybe' ? 'var(--maybe-light)' : 'var(--surface)'
                        const textColor = status === 'free' ? '#1a7a3a' : status === 'maybe' ? '#8a6d10' : 'var(--text-muted)'
                        const statusWord = status === 'busy' ? 'not free' : status
                        return (
                          <button
                            key={b.key}
                            onClick={() => cycleBlock(d, b)}
                            aria-label={`${b.label}, ${b.sub}, ${statusWord}`}
                            aria-pressed={status !== 'busy'}
                            style={{
                              padding: '10px 6px',
                              background: bg,
                              border: `2px solid ${color}`,
                              borderRadius: 'var(--radius-md)',
                              cursor: 'pointer',
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                              fontFamily: 'var(--font-display)',
                              transitionProperty: 'background-color, border-color, color, transform', transitionDuration: '120ms', transitionTimingFunction: 'ease',
                              minHeight: 68,
                            }}
                          >
                            <span style={{ lineHeight: 1, color: textColor, display: 'inline-flex' }}>{b.icon}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: textColor }}>{b.label}</span>
                            <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{b.sub}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
            {/* [P0] Soft-confirm if no blocks marked */}
            <button
              onClick={() => {
                if (freeSlotCount === 0) {
                  if (!window.confirm("You haven't marked any free time — continue anyway?\n\nTap Cancel to go back and mark when you're free.")) return
                }
                submitAvailability()
              }}
              className="btn-primary"
            >
              Next
            </button>
          </motion.div>
        )
      })()}

      {/* Step 1: Availability — RANGE MODE (original hourly grid) */}
      {step === 1 && hang.hang.time_granularity !== 'blocks' && hang.hang.date_mode !== 'specific' && (
        <motion.div key="s1-range" {...stepAnim} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h2 className="section-title" style={{ fontSize: 24 }}>When are you free?</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
              Tap a preset or drag to paint. Tap again to cycle free → maybe → busy.
            </p>
            {/* [high] Always-visible legend — never one-shot-dismissed */}
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--free-text, #1a7a3a)' }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--free)', display: 'inline-block' }} aria-hidden="true" />
                free
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--maybe-text, #8a6d10)' }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--maybe)', display: 'inline-block' }} aria-hidden="true" />
                maybe
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-muted)' }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--busy, #E8E3D9)', border: '1px solid var(--border)', display: 'inline-block' }} aria-hidden="true" />
                busy
              </span>
            </div>
          </div>

          {/* Quick-fill presets — 80% of responders never touch the grid */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {crewShape && Object.keys(crewShape).length > 0 && (
              <button
                onClick={applyCrewShape}
                aria-label="Use my crew availability shape"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '10px 14px', fontSize: 13, fontWeight: 700,
                  background: 'var(--accent)', color: 'var(--accent-text)',
                  border: '1px solid var(--accent)', borderRadius: 'var(--radius-md)',
                  cursor: 'pointer', fontFamily: 'var(--font-display)',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                ★ Use my usual
              </button>
            )}
            {!crewShape && hasLastShape && (
              <button
                onClick={applyLastHangShape}
                aria-label="Use same availability as my last hang"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '10px 14px', fontSize: 13, fontWeight: 700,
                  background: 'var(--accent)', color: 'var(--accent-text)',
                  border: '1px solid var(--accent)', borderRadius: 'var(--radius-md)',
                  cursor: 'pointer', fontFamily: 'var(--font-display)',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                ↩︎ Same as last time
              </button>
            )}
            {/* [P0] "I'm free anytime" shortcut — wires markAllFree and makes it visible */}
            <button
              onClick={markAllFree}
              aria-label="Mark all slots as free"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '10px 14px', fontSize: 13, fontWeight: 700,
                background: 'var(--free-light, #e9f7ee)', color: 'var(--free-text, #1a7a3a)',
                border: '1px solid var(--free)', borderRadius: 'var(--radius-md)',
                cursor: 'pointer', fontFamily: 'var(--font-display)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
              Free anytime
            </button>
            {PRESETS.map(p => (
              <button
                key={p.key}
                onClick={() => applyPreset(p.key)}
                aria-label={`Prefill availability: ${p.label}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '10px 14px', fontSize: 13, fontWeight: 600,
                  background: 'var(--surface)', color: 'var(--text-primary)',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                  cursor: 'pointer', fontFamily: 'var(--font-display)',
                  transitionProperty: 'background-color, border-color, color, transform', transitionDuration: '150ms', transitionTimingFunction: 'ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--maybe-light)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.borderColor = 'var(--border)' }}
              >
                <span style={{ display: 'inline-flex', lineHeight: 1 }}>{p.icon}</span> {p.label}
              </button>
            ))}
          </div>

          {/* Google Calendar busy-time import (blocks out conflicts automatically) */}
          {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && hang.hang.date_range_start && hang.hang.date_range_end && (
            <GoogleCalendarSync
              dateRangeStart={hang.hang.date_range_start}
              dateRangeEnd={hang.hang.date_range_end}
              hours={HOURS}
              onBusySlots={(keys) => setSlots(prev => {
                const next = { ...prev }
                for (const k of keys) next[k] = 'busy'
                return next
              })}
            />
          )}

          {/* When the date range is > 5 days, the classic days-as-columns layout
              blows past the viewport width. We transpose to rows-as-dates so
              the grid scales vertically (natural scroll) and hour cells stretch
              to fill the container. Threshold of 5 keeps short ranges in the
              compact side-by-side layout that fits 1-5 days perfectly on mobile. */}
          {(() => {
            const transposed = dates.length > 5
            const cellRenderer = (d: string, h: number) => {
              const key = `${d}|${h}`
              const status = slots[key] || "busy"
              const focusableKey = focusedSlot || `${dates[0]}|${HOURS[0]}`
              const isFocusable = key === focusableKey
              const dateObj = new Date(d + "T00:00:00")
              const fullDay = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dateObj.getDay()]
              const hourLabel = formatHour(h)
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
                  style={{ minWidth: 0, minHeight: transposed ? 26 : undefined }}
                />
              )
            }
            return (
              <div
                className="grid-scroll-container"
                style={{
                  margin: '0 -20px',
                  padding: '0 20px',
                  userSelect: 'none',
                  // In transposed (long-range) layout, painting happens horizontally
                  // across hours so we can let the browser handle vertical scroll —
                  // fixes the "stuck mid-grid" bug on mobile. In the compact layout
                  // painting is vertical (across hours as rows) so keep touch-none.
                  touchAction: transposed ? 'pan-y' : 'none',
                }}
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
                  // Arrow keys map to grid axes, which flip when transposed so
                  // "left/right" is always the horizontal axis as drawn.
                  if (transposed) {
                    if (e.key === 'ArrowLeft')  nHourIdx = Math.max(0, curHourIdx - 1)
                    if (e.key === 'ArrowRight') nHourIdx = Math.min(HOURS.length - 1, curHourIdx + 1)
                    if (e.key === 'ArrowUp')    nDateIdx = Math.max(0, curDateIdx - 1)
                    if (e.key === 'ArrowDown')  nDateIdx = Math.min(dates.length - 1, curDateIdx + 1)
                  } else {
                    if (e.key === 'ArrowLeft')  nDateIdx = Math.max(0, curDateIdx - 1)
                    if (e.key === 'ArrowRight') nDateIdx = Math.min(dates.length - 1, curDateIdx + 1)
                    if (e.key === 'ArrowUp')    nHourIdx = Math.max(0, curHourIdx - 1)
                    if (e.key === 'ArrowDown')  nHourIdx = Math.min(HOURS.length - 1, curHourIdx + 1)
                  }
                  if (e.key === 'Home')       { nDateIdx = 0; nHourIdx = 0 }
                  if (e.key === 'End')        { nDateIdx = dates.length - 1; nHourIdx = HOURS.length - 1 }
                  const newKey = `${dates[nDateIdx]}|${HOURS[nHourIdx]}`
                  setFocusedSlot(newKey)
                  cellRefs.current.get(newKey)?.focus()
                }}
              >
                {transposed ? (
                  // Rows-as-dates layout — scales vertically for long ranges.
                  // [high] Wrap in a horizontally-scrollable container so hour columns
                  // never crush below ~40px; grid itself is min-content wide.
                  <div style={{ overflowX: 'auto', width: '100%' }}>
                  <div
                    ref={gridRef}
                    role="grid"
                    aria-label="Availability grid — arrow keys to navigate, space to cycle free / maybe / busy"
                    aria-rowcount={dates.length + 1}
                    aria-colcount={HOURS.length + 1}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: `minmax(72px, max-content) repeat(${HOURS.length}, minmax(40px, 1fr))`,
                      gap: 2,
                      minWidth: 'max-content',
                    }}
                  >
                    <div role="row" style={{ display: 'contents' }}>
                      <div role="columnheader" aria-hidden="true" />
                      {HOURS.map(h => (
                        <div
                          key={h}
                          role="columnheader"
                          style={{
                            fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)',
                            textAlign: 'center', padding: '2px 0', fontWeight: 600,
                          }}
                        >
                          {/* Show hour labels only every 2 hours at the narrowest layouts
                              so they don't crash into each other. CSS handles the ellipsis. */}
                          {formatHour(h).replace(/am|pm/, m => m[0])}
                        </div>
                      ))}
                    </div>
                    {dates.map(d => {
                      const dateObj = new Date(d + "T00:00:00")
                      return (
                        <div key={d} role="row" style={{ display: 'contents' }}>
                          <div role="rowheader" style={{
                            fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
                            paddingRight: 8, color: 'var(--text-primary)',
                            whiteSpace: 'nowrap',
                          }}>
                            {formatDay(d)}
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 4 }}>
                              {dateObj.getDate()}
                            </span>
                          </div>
                          {HOURS.map(h => cellRenderer(d, h))}
                        </div>
                      )
                    })}
                  </div>
                  {/* close horizontal-scroll wrapper */}
                  </div>
                ) : (
                  // Classic columns-as-dates layout — compact for 1-5 days.
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
                          {dates.map(d => cellRenderer(d, h))}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })()}

          {/* [P0] Soft-confirm if no slots marked — surface the "Free anytime" shortcut */}
          <button
            onClick={() => {
              if (freeSlotCount === 0) {
                if (!window.confirm("You haven't marked any free time — continue anyway?\n\nTap Cancel to go back and mark when you're free.")) return
              }
              submitAvailability()
            }}
            className="btn-primary"
          >
            Next
          </button>
        </motion.div>
      )}

      {/* Step 1: Availability — SPECIFIC DAYS MODE (two-step: pick days, then hours) */}
      {step === 1 && hang.hang.time_granularity !== 'blocks' && hang.hang.date_mode === 'specific' && (
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
                        transitionProperty: 'background-color, border-color, transform', transitionDuration: '150ms', transitionTimingFunction: 'ease',
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
                  Tap a preset or pick hours per day.
                </p>
                {/* [high] Always-visible legend */}
                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--free-text, #1a7a3a)' }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--free)', display: 'inline-block' }} aria-hidden="true" />
                    free
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--maybe-text, #8a6d10)' }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--maybe)', display: 'inline-block' }} aria-hidden="true" />
                    maybe
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-muted)' }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--busy, #E8E3D9)', border: '1px solid var(--border)', display: 'inline-block' }} aria-hidden="true" />
                    busy
                  </span>
                </div>
              </div>

              {/* Same preset chips as range mode */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {hasLastShape && (
                  <button
                    onClick={applyLastHangShape}
                    aria-label="Use same availability as my last hang"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '10px 14px', fontSize: 13, fontWeight: 700,
                      background: 'var(--accent)', color: 'var(--accent-text)',
                      border: '1px solid var(--accent)', borderRadius: 'var(--radius-md)',
                      cursor: 'pointer', fontFamily: 'var(--font-display)',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    ↩︎ Same as last time
                  </button>
                )}
                {/* [P0] "Free anytime" shortcut in specific mode too */}
                <button
                  onClick={markAllFree}
                  aria-label="Mark all slots as free"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '10px 14px', fontSize: 13, fontWeight: 700,
                    background: 'var(--free-light, #e9f7ee)', color: 'var(--free-text, #1a7a3a)',
                    border: '1px solid var(--free)', borderRadius: 'var(--radius-md)',
                    cursor: 'pointer', fontFamily: 'var(--font-display)',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                  Free anytime
                </button>
                {PRESETS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => applyPreset(p.key)}
                    aria-label={`Prefill availability: ${p.label}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '10px 14px', fontSize: 13, fontWeight: 600,
                      background: 'var(--surface)', color: 'var(--text-primary)',
                      border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                      cursor: 'pointer', fontFamily: 'var(--font-display)',
                      transitionProperty: 'background-color, border-color, color, transform', transitionDuration: '150ms', transitionTimingFunction: 'ease',
                    }}
                  >
                    <span style={{ display: 'inline-flex', lineHeight: 1 }}>{p.icon}</span> {p.label}
                  </button>
                ))}
              </div>
              {[...freeDays].sort().map(d => {
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
                              transitionProperty: 'background-color, border-color, color, transform', transitionDuration: '100ms', transitionTimingFunction: 'ease',
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
              {/* [P0] Soft-confirm if no hours marked */}
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setSpecificStep('days')} className="btn-secondary" style={{ flex: 1 }}>Back</button>
                <button
                  onClick={() => {
                    if (freeSlotCount === 0) {
                      if (!window.confirm("You haven't marked any free time — continue anyway?\n\nTap Cancel to go back and mark when you're free.")) return
                    }
                    submitAvailability()
                  }}
                  className="btn-primary"
                  style={{ flex: 1 }}
                >
                  Next
                </button>
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
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'block', margin: '0 auto 8px', color: 'var(--text-muted)' }}>
                <circle cx="12" cy="12" r="9"/>
                <line x1="9" y1="9" x2="9.01" y2="9"/>
                <line x1="15" y1="9" x2="15.01" y2="9"/>
                <path d="M8 14h8"/>
              </svg>
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
            {['No restrictions', 'Vegetarian', 'Vegan', 'Gluten-free', 'Other'].map(opt => {
              // [P0] "selected" check: a button is selected if dietary === opt, OR if opt==='Other'
              // and dietary is the composed "Other: x" string (backwards compat with prefill).
              const isSelected = dietary === opt || (opt === 'Other' && (dietary === 'Other' || dietary.startsWith('Other:')))
              return (
                <button
                  key={opt}
                  onClick={() => setDietary(opt)}
                  style={{
                    padding: '14px 18px',
                    background: isSelected ? 'var(--accent)' : 'var(--surface)',
                    color: isSelected ? 'var(--accent-text)' : 'var(--text-primary)',
                    border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border-light)'}`,
                    borderRadius: 'var(--radius-md)', cursor: 'pointer',
                    fontSize: 15, fontWeight: 600, textAlign: 'left',
                  }}
                >
                  {opt}
                </button>
              )
            })}
            {/* [P0] Keep the text input mounted whenever dietary is 'Other' OR the composed
                value (so it survives the first keystroke). Value controlled by otherText. */}
            {(dietary === 'Other' || dietary.startsWith('Other:')) && (
              <input
                type="text"
                placeholder="Describe…"
                value={otherText}
                onChange={e => setOtherText(e.target.value.slice(0, 60))}
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

      {/* Step 5: Interest (Phase 1 of two-phase commitment).
          This is NOT the RSVP — it's "how keen are you?" before the time is
          even picked. You can't honestly commit to a plan that doesn't exist
          yet. When the creator locks the time, everyone gets asked again —
          that's Phase 2, the real weight-bearing decision. */}
      {step === 5 && (
        <motion.div key="s5" {...stepAnim} style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 8 }}>
          <div style={{ textAlign: 'center' }}>
            <div className="label" style={{ marginBottom: 10, color: 'var(--text-muted)' }}>Last step</div>
            <h2 className="section-title" style={{ fontSize: 28, lineHeight: 1.15 }}>
              How keen?
            </h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 10, maxWidth: 340, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.45 }}>
              Your interest helps <strong style={{ color: 'var(--text-primary)' }}>{hang.hang.creator_name}</strong> weigh each time slot. You'll get asked to RSVP for real once the time locks in.
            </p>
          </div>
          <div role="radiogroup" aria-label="Interest level" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              {
                key: 'in' as const, label: "Keen", desc: 'Count me in if the time works',
                color: 'var(--free)', bg: 'var(--free-light)', text: '#1a7a3a',
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9"/>
                    <polyline points="8.5 12.5 11 15 16 9"/>
                  </svg>
                ),
              },
              {
                key: 'probably' as const, label: 'Depends', desc: "I'll see when the time lands",
                color: 'var(--maybe)', bg: 'var(--maybe-light)', text: '#8a6d10',
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9"/>
                    <circle cx="8.5" cy="12" r="0.6" fill="currentColor"/>
                    <circle cx="12" cy="12" r="0.6" fill="currentColor"/>
                    <circle cx="15.5" cy="12" r="0.6" fill="currentColor"/>
                  </svg>
                ),
              },
              {
                key: 'cant' as const, label: "Can't", desc: "Just marked times to help",
                color: 'var(--error)', bg: '#fef2f2', text: 'var(--error)',
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9"/>
                    <line x1="9" y1="9" x2="15" y2="15"/>
                    <line x1="15" y1="9" x2="9" y2="15"/>
                  </svg>
                ),
              },
            ].map(opt => {
              const selected = commitment === opt.key
              return (
                <button
                  key={opt.key}
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${opt.label} — ${opt.desc}`}
                  onClick={() => {
                    setCommitment(opt.key)
                    // Soft haptic on mobile browsers that support it. 12ms is a
                    // "tick", not a buzz — matches iOS haptic-selection feel.
                    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                      try { navigator.vibrate(12) } catch {}
                    }
                  }}
                  className={`commit-pill ${selected ? 'commit-pill-selected' : ''}`}
                  style={{
                    background: selected ? opt.bg : undefined,
                    borderColor: selected ? opt.color : undefined,
                  }}
                >
                  <span
                    style={{
                      lineHeight: 1,
                      color: selected ? opt.text : 'var(--text-muted)',
                      transform: selected ? 'scale(1.08)' : 'scale(1)',
                      transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                      display: 'inline-flex',
                    }}
                  >
                    {opt.icon}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18,
                      color: selected ? opt.text : 'var(--text-primary)',
                      letterSpacing: '-0.01em',
                    }}>
                      {opt.label}
                    </div>
                    <div style={{ fontSize: 13, color: selected ? opt.text : 'var(--text-muted)', opacity: selected ? 0.82 : 1, marginTop: 3 }}>
                      {opt.desc}
                    </div>
                  </div>
                  {/* Selected-state check mark — subtle confirmation the choice "locked in" */}
                  <span
                    aria-hidden="true"
                    style={{
                      width: 22, height: 22, borderRadius: 11,
                      background: selected ? opt.color : 'transparent',
                      border: selected ? 'none' : '1.5px solid var(--border)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontWeight: 900, fontSize: 13,
                      transitionProperty: 'background-color, border-color, color, transform', transitionDuration: '200ms', transitionTimingFunction: 'ease',
                      flexShrink: 0,
                    }}
                  >
                    {selected ? '✓' : ''}
                  </span>
                </button>
              )
            })}
          </div>
          {/* [high] Branch CTA label: can't → "Done →", in/probably → "Save my interest →" */}
          <button
            onClick={submitCommitment}
            disabled={!commitment}
            className="btn-primary"
            style={{ padding: '18px 28px', fontSize: 17, marginTop: 4 }}
          >
            {!commitment ? 'Pick one to continue' : commitment === 'cant' ? 'Done →' : 'Save my interest →'}
          </button>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Step 3 no longer exists — user is redirected to /h/[id]/results */}
    </div>
  )
}
