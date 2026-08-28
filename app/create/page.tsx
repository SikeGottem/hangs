// Create-hang wizard. Steps: 0=template, 1=basics, 2=activities, 3=extras, 4=review, 5=done.
// Supports ?quick=1 for an express one-screen lane (tonight preset, name only).
"use client"
import { useState, useEffect, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import QRCode from "qrcode"
import { showToast } from "@/components/Toast"
import DatePicker, { type DatePickerValue } from "@/components/DatePicker"
import { format } from "date-fns"
import styles from "./create.module.css"

const stepTransition = {
  initial: { opacity: 0, x: 30 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -30 },
  transition: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
}

const TEMPLATES = [
  {
    id: 'casual',
    name: 'Casual Catch-up',
    activities: [
      { name: 'Dinner', costEstimate: '$20-35/person' },
      { name: 'Bar / Drinks', costEstimate: '$15-30/person' },
      { name: 'Bubble Tea', costEstimate: '$8-12/person' },
      { name: 'Board Games', costEstimate: 'Free' },
    ],
  },
  {
    id: 'birthday',
    name: 'Birthday',
    activities: [
      { name: 'Karaoke', costEstimate: '$15-25/person' },
      { name: 'Escape Room', costEstimate: '$30-40/person' },
      { name: 'Dinner', costEstimate: '$25-50/person' },
      { name: 'Bowling', costEstimate: '$15-25/person' },
      { name: 'Bar / Drinks', costEstimate: '$20-40/person' },
    ],
  },
  {
    id: 'active',
    name: 'Active Day Out',
    activities: [
      { name: 'Hiking', costEstimate: 'Free' },
      { name: 'Mini Golf', costEstimate: '$15-20/person' },
      { name: 'Beach', costEstimate: 'Free' },
      { name: 'Bowling', costEstimate: '$15-25/person' },
      { name: 'Arcade', costEstimate: '$10-20/person' },
    ],
  },
  {
    id: 'chill',
    name: 'Chill Vibes',
    activities: [
      { name: 'Movies', costEstimate: '$15-22/person' },
      { name: 'Picnic', costEstimate: '$5-15/person' },
      { name: 'Board Games', costEstimate: 'Free' },
      { name: 'Bubble Tea', costEstimate: '$8-12/person' },
    ],
  },
]

const SUGGESTIONS = [
  "Bowling", "Movies", "Dinner", "Beach", "Karaoke", "Escape Room",
  "Mini Golf", "Board Games", "Picnic", "Bar / Drinks", "Hiking",
  "Shopping", "Arcade", "Bubble Tea", "Trivia Night", "Museum",
]

type Activity = { name: string; costEstimate: string }

// Format a Date → YYYY-MM-DD in LOCAL timezone (matches DatePicker's iso()).
const isoLocal = (d: Date) => format(d, 'yyyy-MM-dd')

// Compute default date range using local timezone to avoid Friday-evening-AEST
// appearing as Saturday (the UTC bug). Matches DatePicker's local formatter.
function computeDefaultRange() {
  const today = new Date()
  const day = today.getDay() // 0 = Sun, 6 = Sat
  // Sunday evening: skip ahead to next Friday
  if (day === 0 && today.getHours() >= 18) {
    const fri = new Date(today); fri.setDate(today.getDate() + 5)
    const sun = new Date(today); sun.setDate(today.getDate() + 7)
    return { start: isoLocal(fri), end: isoLocal(sun) }
  }
  // Otherwise: today → next Sunday (gives at least 2 days, up to 7)
  const daysToSunday = day === 0 ? 7 : 7 - day
  const end = new Date(today); end.setDate(today.getDate() + daysToSunday)
  return { start: isoLocal(today), end: isoLocal(end) }
}

function CreatePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // ?quick=1: express lane — tonight preset, single screen (name + creator + Create)
  const isQuick = searchParams.get('quick') === '1'

  // Crew context: when ?crewId=... is in the URL, the hang is being planned
  // for a specific saved crew. We fetch the creator's crew display_name so the
  // name field pre-fills, and we pass crewId to POST /api/hangs.
  const [crewCtx, setCrewCtx] = useState<{ id: string; name: string } | null>(null)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const sp = new URLSearchParams(window.location.search)
    const cid = sp.get('crewId')
    const cname = sp.get('crewName')
    if (cid) setCrewCtx({ id: cid, name: cname || 'Crew' })
  }, [])

  const [step, setStep] = useState(0) // 0=template, 1=basics, 2=activities, 3=extras, 4=review, 5=done
  const [template, setTemplate] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [creatorName, setCreatorName] = useState("")

  // Pre-fill creator name from crew membership when planning for a crew.
  useEffect(() => {
    if (!crewCtx) return
    fetch(`/api/crews/${crewCtx.id}/state`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.myProfile?.displayName) setCreatorName(d.myProfile.displayName)
      })
      .catch(err => console.warn('[hangs] crew prefill failed:', err))
  }, [crewCtx])

  const [dateMode, setDateMode] = useState<'range' | 'specific'>('range')
  // Default range uses local timezone (not UTC) to avoid off-by-one on
  // Friday evening AEST (which UTC would call Saturday).
  const defaultRange = computeDefaultRange()
  const [dateStart, setDateStart] = useState(defaultRange.start)
  const [dateEnd, setDateEnd] = useState(defaultRange.end)
  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [customActivity, setCustomActivity] = useState("")
  const [customCost, setCustomCost] = useState("")
  const [location, setLocation] = useState("")
  const [duration, setDuration] = useState(2)
  // Default to 'blocks' — the research-backed choice. 80% of hangs land on
  // "Friday evening" resolution, not "5:30-6:30". Power users can switch to
  // hourly if they genuinely need per-hour precision.
  const [timeGranularity, setTimeGranularity] = useState<'blocks' | 'hourly'>('blocks')
  // Phase 2: creator-seeded extras (all optional)
  const [description, setDescription] = useState("")
  const [theme, setTheme] = useState("")
  const [dressCode, setDressCode] = useState("")
  const [responseDeadline, setResponseDeadline] = useState("")
  const [askDietary, setAskDietary] = useState(false)
  const [customQuestion, setCustomQuestion] = useState("")
  const [bringListSeed, setBringListSeed] = useState<string[]>([])
  const [newBringItem, setNewBringItem] = useState("")
  const [showAllSuggestions, setShowAllSuggestions] = useState(false)
  // Extras step defaults to collapsed — description is behind a disclosure.
  // Everything reads as a genuine one-tap pass-through.
  const [extrasExpanded, setExtrasExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [shareUrl, setShareUrl] = useState("")
  const [hangId, setHangId] = useState("")
  const [qrDataUrl, setQrDataUrl] = useState("")
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)

  // Generate QR whenever shareUrl changes
  useEffect(() => {
    if (!shareUrl) return
    QRCode.toDataURL(shareUrl, { width: 240, margin: 1, color: { dark: '#1A1A1A', light: '#FAF8F3' } })
      .then(setQrDataUrl)
      .catch(err => console.warn('[hangs] QR code generation failed:', err))
  }, [shareUrl])

  const selectTemplate = (tpl: typeof TEMPLATES[0] | null) => {
    if (tpl) {
      setTemplate(tpl.id)
      setActivities(tpl.activities)
    } else {
      setTemplate(null)
      setActivities([])
    }
    setStep(1)
  }

  const toggleActivity = (actName: string) => {
    const exists = activities.find(a => a.name === actName)
    if (exists) {
      setActivities(prev => prev.filter(a => a.name !== actName))
    } else {
      setActivities(prev => [...prev, { name: actName, costEstimate: '' }])
    }
  }

  const updateCost = (actName: string, cost: string) => {
    setActivities(prev => prev.map(a => a.name === actName ? { ...a, costEstimate: cost } : a))
  }

  const addCustom = () => {
    const trimmed = customActivity.trim()
    if (trimmed && !activities.find(a => a.name === trimmed)) {
      setActivities(prev => [...prev, { name: trimmed, costEstimate: customCost.trim() }])
      setCustomActivity("")
      setCustomCost("")
    }
  }

  const handleCreate = async () => {
    if (loading) return // defensive: prevent accidental double-submit
    setLoading(true)
    try {
      const res = await fetch("/api/hangs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          creatorName,
          dateMode,
          dateRangeStart: dateMode === 'range' ? dateStart : undefined,
          dateRangeEnd: dateMode === 'range' ? dateEnd : undefined,
          selectedDates: dateMode === 'specific' ? selectedDates.sort() : undefined,
          activities,
          template,
          location: location || undefined,
          duration,
          description: description || undefined,
          theme: theme || undefined,
          dressCode: dressCode || undefined,
          responseDeadline: responseDeadline || undefined,
          askDietary: askDietary || undefined,
          customQuestion: customQuestion || undefined,
          bringListSeed: bringListSeed.length > 0 ? bringListSeed : undefined,
          crewId: crewCtx?.id,
          timeGranularity,
        }),
      })
      if (!res.ok) throw new Error(`Create failed: ${res.status}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setHangId(data.id)
      setShareUrl(`${window.location.origin}/h/${data.id}`)
      if (data.creatorId) localStorage.setItem(`hangs_${data.id}`, data.creatorId)
      if (data.creatorToken) localStorage.setItem(`hangs_token_${data.id}`, data.creatorToken)
      // The creator is also a participant of their own hang — so results page fetches work
      if (data.creatorId) localStorage.setItem(`hangs_participant_${data.id}`, data.creatorId)
      // Persist the creator's name globally so their next respond flow prefills.
      if (creatorName.trim()) localStorage.setItem('hangs_last_name', creatorName.trim())
      setStep(5)
      // NOTE: navigator.share auto-fire removed intentionally (Task 3).
      // The Done launchpad shows first with OG preview + explicit share buttons.
      // The creator taps "Share to group chat" when ready.
    } catch (err) {
      console.warn('[hangs] create failed:', err)
      showToast('Could not create — check your connection and try again', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Handle quick-lane create: applies "Tonight" preset then calls handleCreate.
  const handleQuickCreate = async () => {
    // Ensure tonight dates are set before creating
    const todayStr = isoLocal(new Date())
    setDateMode('range')
    setDateStart(todayStr)
    setDateEnd(todayStr)
    // We need to POST with the correct tonight dates, so inline the values here
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch("/api/hangs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          creatorName,
          dateMode: 'range',
          dateRangeStart: todayStr,
          dateRangeEnd: todayStr,
          activities,
          template,
          duration,
          crewId: crewCtx?.id,
          timeGranularity,
        }),
      })
      if (!res.ok) throw new Error(`Create failed: ${res.status}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setHangId(data.id)
      setShareUrl(`${window.location.origin}/h/${data.id}`)
      if (data.creatorId) localStorage.setItem(`hangs_${data.id}`, data.creatorId)
      if (data.creatorToken) localStorage.setItem(`hangs_token_${data.id}`, data.creatorToken)
      if (data.creatorId) localStorage.setItem(`hangs_participant_${data.id}`, data.creatorId)
      if (creatorName.trim()) localStorage.setItem('hangs_last_name', creatorName.trim())
      setStep(5)
    } catch (err) {
      console.warn('[hangs] create failed:', err)
      showToast('Could not create — check your connection and try again', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Friendly text to paste into Messenger / WhatsApp. The URL itself will
  // fetch the OG card from /api/hangs/[id]/og so Messenger/WA render the big
  // preview — all we need here is the lead-in line + the URL.
  const copyShareText = async () => {
    const text = `help me plan ${name} — drag when you're free, vote what to do: ${shareUrl}`
    await navigator.clipboard.writeText(text)
    showToast('Copied — paste in your group chat', 'success')
  }

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareUrl)
  }

  const share = async () => {
    if (navigator.share) {
      await navigator.share({ title: name, text: `Help plan: ${name}`, url: shareUrl })
    } else {
      copyLink()
    }
  }

  // Progress indicator: show "Step N of 5 · Label" — always the non-done steps.
  // The "name step" (template, step 0) is skipped for crew/edit users who pre-fill.
  // We only show up to step 4 (review); step 5 (done) hides the bar.
  const totalSteps = 5 // Template, Basics, Activities, Extras, Review
  const stepLabels = ['Template', 'Basics', 'Activities', 'Extras', 'Review']
  // For crew users who skip template (step 0), we start counting from Basics
  const progressStep = Math.min(step, totalSteps - 1)

  // ── EXPRESS LANE (quick=1) ──────────────────────────────────────────────
  if (isQuick) {
    return (
      <div className={`${styles.page} ${styles.quick}`}>
        {/* Crew context banner */}
        {crewCtx && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            marginBottom: 20,
            background: 'var(--maybe-light)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            fontSize: 13,
          }}>
            <div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>For crew</span>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{crewCtx.name}</div>
            </div>
            <a href={`/crews/${crewCtx.id}`} style={{ fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 600 }}>
              Back
            </a>
          </div>
        )}

        {step < 5 && (
          <AnimatePresence mode="wait">
            <motion.div key="quick" {...stepTransition} className={styles.step}>
              <div className={styles.stepIntro}>
                <span className={styles.eyebrow}>Tonight</span>
                <h2 className="section-title">Quick hang</h2>
                <p>
                  We&apos;ll set it for tonight. Fill in the details later.
                </p>
              </div>

              <div className={styles.field}>
                <label>What&apos;s the hangout?</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Weekend vibes, Jake&apos;s birthday..."
                  className="input"
                />
              </div>
              <div className={styles.field}>
                <label>Your name</label>
                <input
                  type="text"
                  value={creatorName}
                  onChange={e => setCreatorName(e.target.value)}
                  placeholder="Ethan"
                  className="input"
                />
              </div>

              <button
                onClick={handleQuickCreate}
                disabled={loading || !name || !creatorName}
                className="btn-primary"
                style={{ marginTop: 8 }}
              >
                {loading ? 'Creating...' : 'Create hang'}
              </button>

              <a className={styles.quietLink}
                href="/create"
                style={{ alignSelf: 'center' }}
              >
                Set dates + activities instead
              </a>
            </motion.div>
          </AnimatePresence>
        )}

        {/* Done screen — shared with normal flow */}
        {step === 5 && (
          <AnimatePresence mode="wait">
            <DoneStep
              hangId={hangId}
              name={name}
              shareUrl={shareUrl}
              qrDataUrl={qrDataUrl}
              share={share}
              copyShareText={copyShareText}
              copyLink={copyLink}
              onViewResponses={() => router.push(`/h/${hangId}/results`)}
            />
          </AnimatePresence>
        )}
      </div>
    )
  }

  // ── NORMAL FLOW ──────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      {/* Crew context banner — shown when planning for a specific saved crew */}
      {crewCtx && step < 5 && (
        <div className={styles.crewNote}>
          <div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>For crew</span>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{crewCtx.name}</div>
          </div>
          <a href={`/crews/${crewCtx.id}`}>
            Back
          </a>
        </div>
      )}

      {/* Progress — labelled step text; hidden on Done screen */}
      {step < 5 && (
        <div className={styles.progress}>
          {/* Dot track — skip dot 0 for crew users who never see the template step */}
          <div className={styles.progressTrack} aria-hidden="true">
            {stepLabels.map((_, s) => {
              // Crew users start at step 1 so dot 0 (template) is irrelevant — dim it
              const isSkipped = crewCtx && s === 0
              const isActive = s <= progressStep && !isSkipped
              return (
                <i key={s} data-active={isActive} style={isSkipped ? { opacity: 0.25 } : {}} />
              )
            })}
          </div>
          <div className={styles.progressMeta}>
            <span>Step {progressStep + 1} of {totalSteps}</span><span>{stepLabels[progressStep]}</span>
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
      {/* Step 0: Template picker */}
      {step === 0 && (
        <motion.div key="step0" {...stepTransition} className={styles.step}>
          <div className={styles.stepIntro}>
            <span className={styles.eyebrow}>A small plan, well made</span>
            <h2 className="section-title">Start with a template</h2>
            <p>
              Or skip and build from scratch.
            </p>
          </div>
          <div className={styles.templateList}>
            {TEMPLATES.map(tpl => (
              <button
                key={tpl.id}
                onClick={() => selectTemplate(tpl)}
                className={styles.template}
              >
                <strong>{tpl.name}</strong>
                <span>
                  {tpl.activities.map(a => a.name).join(' / ')}
                </span>
              </button>
            ))}
          </div>
          <button
            onClick={() => selectTemplate(null)}
            className="btn-secondary"
          >
            Start from scratch
          </button>

          {/* Express lane affordance — the single most important UX shortcut */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            paddingTop: 4,
          }}>
            <a
              href="/create?quick=1"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                textDecoration: 'none',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.02em',
              }}
            >
              {/* Lightning bolt SVG — no emoji */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
              Just find a time — quick hang
            </a>
          </div>
        </motion.div>
      )}

      {/* Step 1: Basics */}
      {step === 1 && (
        <motion.div key="step1" {...stepTransition} className={styles.step}>
          <div className={styles.stepIntro}><span className={styles.eyebrow}>Set the shape</span><h2 className="section-title">The basics</h2><p>Give your crew a name, a window, and just enough context to say yes.</p></div>
          <div className={styles.field}>
            <label>What&apos;s the hangout?</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Weekend vibes, Jake's birthday..."
              className="input"
            />
          </div>
          <div className={styles.field}>
            <label>Your name</label>
            <input
              type="text"
              value={creatorName}
              onChange={e => setCreatorName(e.target.value)}
              placeholder="Ethan"
              className="input"
            />
          </div>
          <div className={styles.field}><label>When?</label><span className={styles.fieldHelp}>Pick a flexible range, or only the days that work.</span></div>

          {/* Unified calendar picker (mode toggle + presets + calendar all in one) */}
          <DatePicker
            value={{ mode: dateMode, start: dateStart || undefined, end: dateEnd || undefined, dates: selectedDates }}
            onChange={(v: DatePickerValue) => {
              setDateMode(v.mode)
              setDateStart(v.start || '')
              setDateEnd(v.end || '')
              setSelectedDates(v.dates || [])
            }}
          />
          <div className={styles.field}>
            <label>Location <span aria-hidden="true">(optional)</span></label>
            <input
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Address, venue, or Google Maps link"
              className="input"
            />
          </div>
          <div className={styles.field}>
            <label>Duration</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { value: 1, label: '1 hour' },
                { value: 2, label: '2 hours' },
                { value: 4, label: 'Half day' },
                { value: 8, label: 'Full day' },
              ].map(d => (
                <button
                  key={d.value}
                  onClick={() => setDuration(d.value)}
                  className={`chip ${duration === d.value ? 'chip-active' : ''}`}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          {/* How precise do we ask responders to be. Blocks is the 80% default;
              hourly is for power users with real precision requirements. */}
          <div className={styles.field}>
            <label>How precise should availability be?</label>
            <div className={styles.choiceGrid}>
              {[
                {
                  value: 'blocks' as const, title: 'Quick blocks', sub: '4 taps per day',
                  icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="3" width="7" height="7" rx="1"/>
                      <rect x="14" y="3" width="7" height="7" rx="1"/>
                      <rect x="3" y="14" width="7" height="7" rx="1"/>
                      <rect x="14" y="14" width="7" height="7" rx="1"/>
                    </svg>
                  ),
                },
                {
                  value: 'hourly' as const, title: 'Hourly grid', sub: 'The classic drag-paint',
                  icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="9"/>
                      <polyline points="12 7 12 12 15 14"/>
                    </svg>
                  ),
                },
              ].map(g => {
                const selected = timeGranularity === g.value
                return (
                  <button
                    key={g.value}
                    onClick={() => setTimeGranularity(g.value)}
                    aria-pressed={selected}
                    className={styles.choice}
                  >
                    {g.icon}<strong>{g.title}</strong><small>{g.sub}</small>
                  </button>
                )
              })}
            </div>
          </div>
          <div className={styles.actionRow}>
            <button onClick={() => setStep(0)} className="btn-secondary" style={{ flex: 1 }}>Back</button>
            <button
              onClick={() => setStep(2)}
              disabled={!name || !creatorName || (dateMode === 'range' ? (!dateStart || !dateEnd) : selectedDates.length === 0)}
              className="btn-primary"
              style={{ flex: 1 }}
            >
              Next
            </button>
          </div>
        </motion.div>
      )}

      {/* Step 2: Activities + cost */}
      {step === 2 && (
        <motion.div key="step2" {...stepTransition} className={styles.step}>
          <div className={styles.stepIntro}>
            <span className={styles.eyebrow}>Give them a say</span>
            <h2 className="section-title">What could you do?</h2>
            <p>
              Pick options for your group to vote on.
            </p>
          </div>

          {/* Suggestion chips — progressive disclosure (Hick's Law) */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(showAllSuggestions ? SUGGESTIONS : SUGGESTIONS.slice(0, 6)).map(s => {
              const isActive = activities.find(a => a.name === s)
              return (
                <button
                  key={s}
                  onClick={() => toggleActivity(s)}
                  className={`chip ${isActive ? 'chip-active' : ''}`}
                >
                  {isActive && (
                    // Checkmark SVG instead of HTML entity
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }} aria-hidden="true">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                  {s}
                </button>
              )
            })}
            {!showAllSuggestions && (
              <button
                onClick={() => setShowAllSuggestions(true)}
                style={{
                  padding: '10px 18px',
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  background: 'none',
                  border: '1px dashed var(--border)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                }}
              >
                +{SUGGESTIONS.length - 6} more
              </button>
            )}
          </div>

          {/* Custom activity */}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={customActivity}
              onChange={e => setCustomActivity(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addCustom()}
              placeholder="Add your own..."
              className="input"
              style={{ flex: 1 }}
            />
            <button onClick={addCustom} className="btn-secondary" style={{ padding: '14px 20px' }}>Add</button>
          </div>

          {/* Selected activities with cost estimates */}
          {activities.length > 0 && (
            <div>
              <div className="label" style={{ marginBottom: 10 }}>Cost estimates (optional)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activities.map(act => (
                  <div key={act.name} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 14px',
                    background: 'var(--surface)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-light)',
                  }}>
                    <span style={{ flex: 1, fontWeight: 600, fontSize: 14, minWidth: 0 }}>{act.name}</span>
                    <input
                      type="text"
                      value={act.costEstimate}
                      onChange={e => updateCost(act.name, e.target.value)}
                      placeholder="$15-20/person"
                      style={{
                        flex: '0 1 110px',
                        minWidth: 0,
                        padding: '8px 10px',
                        fontSize: 16,  // 16px prevents iOS auto-zoom on focus
                        fontFamily: 'var(--font-mono)',
                        background: 'var(--surface-dim)',
                        border: '1px solid var(--border-light)',
                        borderRadius: 'var(--radius-sm)',
                        outline: 'none',
                        color: 'var(--text-secondary)',
                      }}
                    />
                    <button
                      onClick={() => setActivities(prev => prev.filter(a => a.name !== act.name))}
                      aria-label={`Remove ${act.name}`}
                      style={{
                        width: 28,
                        height: 28,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-muted)',
                        flexShrink: 0,
                      }}
                    >
                      {/* Close icon SVG instead of &times; */}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.actionRow}>
            <button onClick={() => setStep(1)} className="btn-secondary" style={{ flex: 1 }}>Back</button>
            <button
              onClick={() => setStep(3)}
              className="btn-primary"
              style={{ flex: 1 }}
            >
              Next
            </button>
          </div>
          {/* Skip link — mirrors the Extras step pattern; 0 activities is fine */}
          <div style={{ textAlign: 'center' }}>
            <button
              onClick={() => setStep(3)}
            className={styles.skip}
            >
              Skip — just find a time
            </button>
          </div>
        </motion.div>
      )}

      {/* Step 3: Extras (creator-seeded) */}
      {step === 3 && (() => {
        // Count of filled extras — used to surface "3 details added" when
        // collapsed so the creator can confirm at a glance.
        const extrasFilled = [
          description,
          theme, dressCode, responseDeadline, customQuestion,
          bringListSeed.length > 0 ? 'x' : '',
          askDietary ? 'x' : '',
        ].filter(Boolean).length

        return (
        <motion.div key="step3" {...stepTransition} className={styles.step}>
          <div className={styles.stepIntro}>
            <span className={styles.eyebrow}>Optional, but nice</span>
            <h2 className="section-title">Add a vibe</h2>
            <p>
              Totally optional. Hit Skip to move on.
            </p>
          </div>

          {/* Disclosure trigger — one tap unfurls all extras including description */}
          <button
            type="button"
            onClick={() => setExtrasExpanded(v => !v)}
            aria-expanded={extrasExpanded}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', padding: '12px 14px',
              background: 'transparent',
              border: '1px dashed var(--border)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              color: 'var(--text-secondary)',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {extrasExpanded ? 'Hide details' : 'Add vibe details'}
              </span>
              {!extrasExpanded && extrasFilled > 0 && (
                <span style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                  background: 'var(--surface-dim)', padding: '2px 8px', borderRadius: 10,
                }}>
                  {extrasFilled} added
                </span>
              )}
            </span>
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true"
              style={{
                transform: extrasExpanded ? 'rotate(180deg)' : 'rotate(0)',
                transition: 'transform 0.2s ease',
                color: 'var(--text-muted)',
                flexShrink: 0,
              }}
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          <AnimatePresence initial={false}>
            {extrasExpanded && (
              <motion.div
                key="extras-body"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 4 }}>

                  {/* Description / vibe */}
                  <div>
                    <label className="label" style={{ display: 'block', marginBottom: 8 }}>Description</label>
                    <textarea
                      value={description}
                      onChange={e => setDescription(e.target.value.slice(0, 300))}
                      placeholder="What's the vibe? (optional)"
                      rows={3}
                      className="input"
                      style={{ resize: 'vertical', fontFamily: 'var(--font-body)' }}
                    />
                    <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      {description.length}/300
                    </div>
                  </div>

                  {/* Theme + dress code */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label className="label" style={{ display: 'block', marginBottom: 8 }}>Theme</label>
                      <input
                        type="text"
                        value={theme}
                        onChange={e => setTheme(e.target.value)}
                        placeholder="e.g. '80s night"
                        maxLength={60}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label" style={{ display: 'block', marginBottom: 8 }}>Dress code</label>
                      <input
                        type="text"
                        value={dressCode}
                        onChange={e => setDressCode(e.target.value)}
                        placeholder="e.g. casual"
                        maxLength={60}
                        className="input"
                      />
                    </div>
                  </div>

                  {/* Bring list seed */}
                  <div>
                    <label className="label" style={{ display: 'block', marginBottom: 8 }}>Bring list</label>
                    {bringListSeed.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                        {bringListSeed.map((item, i) => (
                          <div key={i} style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '6px 12px', background: 'var(--surface-dim)', color: 'var(--text-secondary)',
                            borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600,
                          }}>
                            {item}
                            <button
                              onClick={() => setBringListSeed(prev => prev.filter((_, j) => j !== i))}
                              aria-label={`Remove ${item}`}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text-muted)', padding: 0, lineHeight: 1 }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="text"
                        value={newBringItem}
                        onChange={e => setNewBringItem(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && newBringItem.trim()) {
                            setBringListSeed(prev => [...prev, newBringItem.trim()])
                            setNewBringItem("")
                          }
                        }}
                        placeholder="Speakers, snacks, drinks..."
                        maxLength={100}
                        className="input"
                        style={{ flex: 1 }}
                      />
                      <button
                        onClick={() => {
                          if (newBringItem.trim()) {
                            setBringListSeed(prev => [...prev, newBringItem.trim()])
                            setNewBringItem("")
                          }
                        }}
                        className="btn-secondary"
                        style={{ padding: '14px 20px' }}
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  {/* Response deadline */}
                  <div>
                    <label className="label" style={{ display: 'block', marginBottom: 8 }}>Response deadline</label>
                    <input
                      type="date"
                      value={responseDeadline}
                      onChange={e => setResponseDeadline(e.target.value)}
                      className="input"
                    />
                  </div>

                  {/* Dietary toggle */}
                  <div>
                    <label style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)', cursor: 'pointer',
                    }}>
                      <div>
                        <div className="label" style={{ marginBottom: 2 }}>Ask about dietary restrictions</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Guests pick from a dropdown on response</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={askDietary}
                        onChange={e => setAskDietary(e.target.checked)}
                        style={{ width: 18, height: 18, cursor: 'pointer' }}
                      />
                    </label>
                  </div>

                  {/* Custom question */}
                  <div>
                    <label className="label" style={{ display: 'block', marginBottom: 8 }}>One thing to ask guests</label>
                    <input
                      type="text"
                      value={customQuestion}
                      onChange={e => setCustomQuestion(e.target.value)}
                      placeholder="e.g. Are you bringing a +1?"
                      maxLength={200}
                      className="input"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className={styles.actionRow}>
            <button onClick={() => setStep(2)} className="btn-secondary" style={{ flex: 1 }}>Back</button>
            {/* Label is always "Skip" or "Continue" based on fill — never "Next" */}
            <button onClick={() => setStep(4)} className="btn-primary" style={{ flex: 1 }}>
              {extrasFilled > 0 ? 'Continue' : 'Skip'}
            </button>
          </div>
        </motion.div>
        )
      })()}

      {/* Step 4: Review */}
      {step === 4 && (
        <motion.div key="step4" {...stepTransition} className={styles.step}>
          <div className={styles.stepIntro}><span className={styles.eyebrow}>One last look</span><h2 className="section-title">Ready to ask the group?</h2><p>They’ll choose a time and vote on the plan from one link.</p></div>
          <div className={styles.review}>
            <div className="label">Hangout</div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              fontWeight: 800,
              marginTop: 4,
              marginBottom: 16,
            }}>{name}</div>

            <div className="label">{dateMode === 'range' ? 'Date range' : 'Dates'}</div>
            <div style={{ fontWeight: 600, fontSize: 15, marginTop: 4, marginBottom: 16 }}>
              {dateMode === 'range' ? (
                <>{dateStart} &rarr; {dateEnd}</>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selectedDates.map(d => {
                    const date = new Date(d + 'T00:00:00')
                    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
                    return (
                      <span key={d} style={{ padding: '4px 10px', background: 'var(--surface-dim)', borderRadius: 6, fontSize: 13 }}>
                        {days[date.getDay()]} {date.getDate()}/{date.getMonth()+1}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>

            {location && (
              <>
                <div className="label">Location</div>
                <div style={{ fontSize: 14, marginTop: 4, marginBottom: 16, color: 'var(--text-secondary)' }}>
                  {location}
                </div>
              </>
            )}

            {template && (
              <>
                <div className="label">Template</div>
                <div style={{ fontSize: 14, marginTop: 4, marginBottom: 16, color: 'var(--text-secondary)' }}>
                  {TEMPLATES.find(t => t.id === template)?.name}
                </div>
              </>
            )}

            <div className="label">Activities ({activities.length})</div>
            {activities.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6, marginBottom: 8 }}>
                None — group will vote on the day
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {activities.map(a => (
                  <div key={a.name} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    background: 'var(--surface-dim)',
                    borderRadius: 'var(--radius-sm)',
                  }}>
                    <span style={{ fontWeight: 500, fontSize: 14 }}>{a.name}</span>
                    {a.costEstimate && (
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        color: 'var(--text-muted)',
                      }}>{a.costEstimate}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.actionRow}>
            <button onClick={() => setStep(3)} className="btn-secondary" style={{ flex: 1 }}>Back</button>
            <button
              onClick={handleCreate}
              disabled={loading}
              className="btn-primary"
              style={{ flex: 1 }}
            >
              {loading ? "Creating..." : "Create hang"}
            </button>
          </div>
        </motion.div>
      )}

      {/* Step 5: Done — the launchpad.
          Most people bounce off a Done screen because they don't know what
          the thing they're pasting will look like. Show them the real OG
          card (the image Messenger/WhatsApp will render) so sharing feels
          inevitable rather than risky. */}
      {step === 5 && (
        <DoneStep
          hangId={hangId}
          name={name}
          shareUrl={shareUrl}
          qrDataUrl={qrDataUrl}
          share={share}
          copyShareText={copyShareText}
          copyLink={copyLink}
          onViewResponses={() => router.push(`/h/${hangId}/results`)}
        />
      )}
      </AnimatePresence>

      {/* Canvas used by QRCode lib — kept off-screen */}
      <canvas ref={qrCanvasRef} style={{ display: 'none' }} />
    </div>
  )
}

// ── DONE STEP (extracted component so it's reused by both quick + normal flows)
type DoneStepProps = {
  hangId: string
  name: string
  shareUrl: string
  qrDataUrl: string
  share: () => void
  copyShareText: () => void
  copyLink: () => void
  onViewResponses: () => void
}

function DoneStep({ hangId, name, shareUrl, qrDataUrl, share, copyShareText, copyLink, onViewResponses }: DoneStepProps) {
  const [recoverEmail, setRecoverEmail] = useState("")
  const [emailState, setEmailState] = useState<'idle' | 'sending' | 'sent'>('idle')

  async function emailMeLink() {
    const email = recoverEmail.trim()
    if (!email || emailState === 'sending') return
    setEmailState('sending')
    try {
      const res = await fetch(`/api/hangs/${hangId}/send-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) throw new Error('send failed')
      setEmailState('sent')
      showToast("Sent — check your inbox", 'success')
    } catch {
      setEmailState('idle')
      showToast("Couldn't send — try copying the link instead", 'error')
    }
  }

  return (
    <motion.div key="step5" {...stepTransition} style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 8 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--free-light)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 14px',
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--free)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 className="section-title">Your hang is live</h2>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 8 }}>
          Here&apos;s how it&apos;ll look in the group chat.
        </p>
      </div>

      {/* Link preview card — mocks the visual frame Messenger/iMessage
          render around a shared URL, with the real OG card inside. Gives
          creators confidence that the thing they're pasting looks good. */}
      {hangId && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-sm)',
          overflow: 'hidden',
        }}>
          <div style={{ position: 'relative', aspectRatio: '1200 / 630', background: 'var(--surface-dim)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/hangs/${hangId}/og?v=${hangId}`}
              alt={`Preview of ${name} link card`}
              style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
          </div>
          <div style={{
            padding: '10px 14px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 10, borderTop: '1px solid var(--border-light)',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase',
              }}>Link preview</div>
              <div style={{
                fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)',
                marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {shareUrl.replace(/^https?:\/\//, '')}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Primary share actions — the accent button is the ONE yellow element here */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button onClick={share} className="btn-primary" style={{ padding: '16px 24px', fontSize: 16 }}>
          Share to group chat
        </button>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={copyShareText} className="btn-secondary" style={{ flex: 1, fontSize: 13 }}>
            Copy message
          </button>
          <button onClick={copyLink} className="btn-secondary" style={{ flex: 1, fontSize: 13 }}>
            Copy link
          </button>
        </div>
      </div>

      {/* QR code — secondary channel for when the group is in the same
          room. Collapsed by default to keep the share moment uncluttered. */}
      <details style={{
        borderTop: '1px dashed var(--border)',
        paddingTop: 16,
      }}>
        <summary style={{
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          listStyle: 'none',
        }}>
          In person? Show a QR
        </summary>
        {qrDataUrl && (
          <div style={{
            display: 'flex', justifyContent: 'center', padding: 20, marginTop: 14,
            background: 'var(--surface)', border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius-lg)',
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="QR code for hang link" width={200} height={200} style={{ display: 'block' }} />
          </div>
        )}
      </details>

      {/* Recovery: email yourself the link so you can find this hang from any
          device later — the no-signup safety net for the creator. */}
      <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 16 }}>
        {emailState === 'sent' ? (
          <div style={{ fontSize: 13, color: 'var(--free-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Link sent — keep that email so you never lose this hang.
          </div>
        ) : (
          <>
            <label htmlFor="recover-email" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
              Email yourself the link so you can find it later — no account needed.
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="recover-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={recoverEmail}
                onChange={e => setRecoverEmail(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') emailMeLink() }}
                placeholder="you@email.com"
                className="input"
                style={{ flex: 1, fontSize: 16 }}
              />
              <button
                onClick={emailMeLink}
                disabled={!recoverEmail.trim() || emailState === 'sending'}
                className="btn-secondary"
                style={{ padding: '14px 18px', whiteSpace: 'nowrap', opacity: (!recoverEmail.trim() || emailState === 'sending') ? 0.5 : 1 }}
              >
                {emailState === 'sending' ? 'Sending…' : 'Email me'}
              </button>
            </div>
          </>
        )}
      </div>

      <button
        onClick={onViewResponses}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: 14,
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-body)',
          padding: 4,
        }}
      >
        View responses &rarr;
      </button>
    </motion.div>
  )
}

// useSearchParams() must be inside a Suspense boundary for static prerender (Next 16).
export default function CreatePage() {
  return (
    <Suspense fallback={null}>
      <CreatePageInner />
    </Suspense>
  )
}
