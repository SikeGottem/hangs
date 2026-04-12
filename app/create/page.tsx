"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"

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

export default function CreatePage() {
  const router = useRouter()
  const [step, setStep] = useState(0) // 0=template, 1=basics, 2=activities, 3=review, 4=done
  const [template, setTemplate] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [creatorName, setCreatorName] = useState("")
  const [dateStart, setDateStart] = useState("")
  const [dateEnd, setDateEnd] = useState("")
  const [activities, setActivities] = useState<Activity[]>([])
  const [customActivity, setCustomActivity] = useState("")
  const [customCost, setCustomCost] = useState("")
  const [location, setLocation] = useState("")
  const [duration, setDuration] = useState(2)
  const [showAllSuggestions, setShowAllSuggestions] = useState(false)
  const [loading, setLoading] = useState(false)
  const [shareUrl, setShareUrl] = useState("")
  const [hangId, setHangId] = useState("")

  const steps = ['Template', 'Basics', 'Activities', 'Review', 'Done']

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
    setLoading(true)
    const res = await fetch("/api/hangs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        creatorName,
        dateRangeStart: dateStart,
        dateRangeEnd: dateEnd,
        activities,
        template,
        location: location || undefined,
        duration,
      }),
    })
    const data = await res.json()
    setHangId(data.id)
    setShareUrl(`${window.location.origin}/h/${data.id}`)
    if (data.creatorId) localStorage.setItem(`hangs_${data.id}`, data.creatorId)
    setLoading(false)
    setStep(4)
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

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 24px 48px' }}>
      {/* Progress */}
      {step < 4 && (
        <div className="progress-bar" style={{ marginBottom: 32 }}>
          {[0,1,2,3].map(s => (
            <div key={s} className={`progress-dot ${s <= step ? 'progress-dot-active' : ''}`} />
          ))}
        </div>
      )}

      <AnimatePresence mode="wait">
      {/* Step 0: Template picker */}
      {step === 0 && (
        <motion.div key="step0" {...stepTransition} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h2 className="section-title">Start with a template</h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 8 }}>
              Or skip and build from scratch.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {TEMPLATES.map(tpl => (
              <button
                key={tpl.id}
                onClick={() => selectTemplate(tpl)}
                className="card"
                style={{
                  padding: '18px 20px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  border: '1px solid var(--border-light)',
                  background: 'var(--surface)',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--accent)'
                  e.currentTarget.style.boxShadow = 'var(--shadow-md)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border-light)'
                  e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
                }}
              >
                <div style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: 16,
                  color: 'var(--text-primary)',
                  marginBottom: 6,
                }}>{tpl.name}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {tpl.activities.map(a => a.name).join(' / ')}
                </div>
              </button>
            ))}
          </div>
          <button
            onClick={() => selectTemplate(null)}
            className="btn-secondary"
          >
            Start from scratch
          </button>
        </motion.div>
      )}

      {/* Step 1: Basics */}
      {step === 1 && (
        <motion.div key="step1" {...stepTransition} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <h2 className="section-title">The basics</h2>
          <div>
            <label className="label" style={{ display: 'block', marginBottom: 8 }}>What's the hangout?</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Weekend vibes, Jake's birthday..."
              className="input"
            />
          </div>
          <div>
            <label className="label" style={{ display: 'block', marginBottom: 8 }}>Your name</label>
            <input
              type="text"
              value={creatorName}
              onChange={e => setCreatorName(e.target.value)}
              placeholder="Ethan"
              className="input"
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="label" style={{ display: 'block', marginBottom: 8 }}>From</label>
              <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label" style={{ display: 'block', marginBottom: 8 }}>To</label>
              <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} className="input" />
            </div>
          </div>
          <div>
            <label className="label" style={{ display: 'block', marginBottom: 8 }}>Location (optional)</label>
            <input
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Address, venue, or Google Maps link"
              className="input"
            />
          </div>
          <div>
            <label className="label" style={{ display: 'block', marginBottom: 8 }}>Duration</label>
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
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setStep(0)} className="btn-secondary" style={{ flex: 1 }}>Back</button>
            <button
              onClick={() => setStep(2)}
              disabled={!name || !creatorName || !dateStart || !dateEnd}
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
        <motion.div key="step2" {...stepTransition} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h2 className="section-title">What could you do?</h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 8 }}>
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
                  {isActive && <span style={{ marginRight: 4 }}>&#10003;</span>}{s}
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
                  color: 'var(--accent)',
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
                    <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{act.name}</span>
                    <input
                      type="text"
                      value={act.costEstimate}
                      onChange={e => updateCost(act.name, e.target.value)}
                      placeholder="$15-20/person"
                      style={{
                        width: 140,
                        padding: '8px 10px',
                        fontSize: 13,
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
                        fontSize: 18,
                      }}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setStep(1)} className="btn-secondary" style={{ flex: 1 }}>Back</button>
            <button
              onClick={() => setStep(3)}
              disabled={activities.length < 2}
              className="btn-primary"
              style={{ flex: 1 }}
            >
              Next
            </button>
          </div>
        </motion.div>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <motion.div key="step3" {...stepTransition} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <h2 className="section-title">Ready to share</h2>
          <div className="card" style={{ padding: 24 }}>
            <div className="label">Hangout</div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              fontWeight: 800,
              marginTop: 4,
              marginBottom: 16,
            }}>{name}</div>

            <div className="label">Date range</div>
            <div style={{ fontWeight: 600, fontSize: 15, marginTop: 4, marginBottom: 16 }}>
              {dateStart} &rarr; {dateEnd}
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
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setStep(2)} className="btn-secondary" style={{ flex: 1 }}>Back</button>
            <button
              onClick={handleCreate}
              disabled={loading}
              className="btn-primary"
              style={{ flex: 1 }}
            >
              {loading ? "Creating..." : "Create Hang"}
            </button>
          </div>
        </motion.div>
      )}

      {/* Step 4: Done */}
      {step === 4 && (
        <motion.div key="step4" {...stepTransition} style={{ display: 'flex', flexDirection: 'column', gap: 24, textAlign: 'center', paddingTop: 24 }}>
          <div>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'var(--free-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--free)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className="section-title">You're all set!</h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 8 }}>
              Share this link with your group.
            </p>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            background: 'var(--surface-dim)',
            borderRadius: 'var(--radius-md)',
          }}>
            <code style={{
              flex: 1,
              fontSize: 13,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-secondary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>{shareUrl}</code>
            <button onClick={copyLink} className="btn-secondary" style={{ padding: '8px 16px', fontSize: 13 }}>
              Copy
            </button>
          </div>

          <button onClick={share} className="btn-primary">
            Share with friends
          </button>
          <button
            onClick={() => router.push(`/h/${hangId}/results`)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 14,
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-body)',
            }}
          >
            View responses &rarr;
          </button>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  )
}
