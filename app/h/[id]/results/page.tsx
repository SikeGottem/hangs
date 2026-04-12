"use client"
import { useState, useEffect, useRef, use } from "react"

// ── Section group component (Miller's Law — chunk into ~3 groups) ──
function SectionGroup({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="section-group">
      <div className="section-group-header" onClick={() => setOpen(!open)}>
        <span className="section-group-title">{title}</span>
        <svg className={`section-group-chevron ${open ? 'section-group-chevron-open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div className={`section-group-body ${open ? '' : 'section-group-collapsed'}`} style={open ? { maxHeight: 5000, opacity: 1 } : undefined}>
        {children}
      </div>
    </div>
  )
}

// ── Outdoor activities for weather warnings ──
const OUTDOOR_ACTIVITIES = ['beach', 'hiking', 'picnic', 'mini golf', 'bbq', 'park', 'cycling', 'surfing', 'kayaking', 'camping']

function isOutdoor(name: string) {
  return OUTDOOR_ACTIVITIES.some(a => name.toLowerCase().includes(a))
}

function formatHour(h: number) {
  if (h < 12) return h + "am"
  if (h === 12) return "12pm"
  return (h - 12) + "pm"
}

function formatDay(d: string) {
  const date = new Date(d + "T00:00:00")
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  return `${days[date.getDay()]} ${date.getDate()}`
}

export default function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data, setData] = useState<any>(null)
  const [comments, setComments] = useState<any[]>([])
  const [weather, setWeather] = useState<any>(null)
  const [transport, setTransport] = useState<any[]>([])
  const [photos, setPhotos] = useState<any[]>([])
  const [bringList, setBringList] = useState<any[]>([])
  const [expenseData, setExpenseData] = useState<any>(null)
  const [polls, setPolls] = useState<any[]>([])
  const [rsvps, setRsvps] = useState<any[]>([])
  const [reactions, setReactions] = useState<any[]>([])
  const [heatmap, setHeatmap] = useState<any>(null)

  // Form state
  const [newComment, setNewComment] = useState("")
  const [transportMode, setTransportMode] = useState("")
  const [transportSeats, setTransportSeats] = useState(0)
  const [nudgeCopied, setNudgeCopied] = useState(false)
  const [newBringItem, setNewBringItem] = useState("")
  const [subItemInputs, setSubItemInputs] = useState<Record<number, string>>({})
  const [showSubInput, setShowSubInput] = useState<number | null>(null)
  const [hoverSlot, setHoverSlot] = useState<string | null>(null)
  const [confirmVotes, setConfirmVotes] = useState<any>(null)
  const [expenseDesc, setExpenseDesc] = useState("")
  const [expenseAmount, setExpenseAmount] = useState("")
  const [pollQuestion, setPollQuestion] = useState("")
  const [pollOptions, setPollOptions] = useState(["", ""])
  const [showPollForm, setShowPollForm] = useState(false)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const creatorPid = typeof window !== 'undefined' ? localStorage.getItem(`hangs_${id}`) || '' : ''
  const myPid = typeof window !== 'undefined' ? (
    localStorage.getItem(`hangs_participant_${id}`) || creatorPid
  ) : ''
  const isCreator = !!creatorPid

  const fetchAll = () => {
    fetch(`/api/hangs/${id}`).then(r => r.json()).then(setData)
    fetch(`/api/hangs/${id}/comments`).then(r => r.json()).then(setComments).catch(() => {})
    fetch(`/api/hangs/${id}/weather`).then(r => r.json()).then(d => { if (!d.error) setWeather(d) }).catch(() => {})
    fetch(`/api/hangs/${id}/transport`).then(r => r.json()).then(setTransport).catch(() => {})
    fetch(`/api/hangs/${id}/photos`).then(r => r.json()).then(setPhotos).catch(() => {})
    fetch(`/api/hangs/${id}/bring-list`).then(r => r.json()).then(setBringList).catch(() => {})
    fetch(`/api/hangs/${id}/expenses`).then(r => r.json()).then(setExpenseData).catch(() => {})
    fetch(`/api/hangs/${id}/polls`).then(r => r.json()).then(setPolls).catch(() => {})
    fetch(`/api/hangs/${id}/rsvp`).then(r => r.json()).then(setRsvps).catch(() => {})
    fetch(`/api/hangs/${id}/reactions`).then(r => r.json()).then(setReactions).catch(() => {})
    fetch(`/api/hangs/${id}/heatmap`).then(r => r.json()).then(setHeatmap).catch(() => {})
    fetch(`/api/hangs/${id}/confirm`).then(r => r.json()).then(setConfirmVotes).catch(() => {})
  }

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 5000)
    return () => clearInterval(interval)
  }, [id])

  if (!data) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 12 }}>
      <div style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  const { hang, participants, activities, synthesis } = data
  const sortedActivities = [...(activities || [])].sort((a: any, b: any) => ((b.ups || 0) - (b.downs || 0)) - ((a.ups || 0) - (a.downs || 0)))
  const topActivityId = sortedActivities.length > 0 && (sortedActivities[0].ups || 0) > 0 ? sortedActivities[0].id : null
  const responded = participants.filter((p: any) => p.hasResponded)
  const missing = participants.filter((p: any) => !p.hasResponded)
  const recommendedActivity = sortedActivities.find((a: any) => synthesis?.recommendedActivity?.name === a.name)
  const hangDate = hang.confirmed_date || hang.date_range_end
  const isPast = hangDate && new Date(hangDate + 'T23:59:59') < new Date()
  const mapsUrl = hang.location ? (hang.location.startsWith('http') ? hang.location : `https://maps.google.com/?q=${encodeURIComponent(hang.location)}`) : null

  // Countdown
  let countdown = ''
  if (hang.confirmed_date && !isPast) {
    const target = new Date(`${hang.confirmed_date}T${String(hang.confirmed_hour || 12).padStart(2, '0')}:00:00`)
    const now = new Date()
    const diff = target.getTime() - now.getTime()
    if (diff > 0) {
      const days = Math.floor(diff / 86400000)
      const hours = Math.floor((diff % 86400000) / 3600000)
      countdown = days > 0 ? `${days}d ${hours}h` : `${hours}h`
    }
  }

  // Weather rain warning for outdoor activities
  const rainWarning = weather && weather.precipChance > 40 && sortedActivities.some((a: any) => isOutdoor(a.name))

  // ── Actions ──
  const voteConfirm = async (vote: string) => {
    if (!synthesis || !myPid) return
    const res = await fetch(`/api/hangs/${id}/confirm`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participantId: myPid,
        vote,
        date: synthesis.recommendedTime.date,
        hour: synthesis.recommendedTime.hour,
        activityName: synthesis.recommendedActivity?.name || "",
      }),
    })
    const result = await res.json()
    if (result.status === 'confirmed') {
      setShowConfetti(true)
      setTimeout(() => setShowConfetti(false), 3000)
    }
    fetchAll()
  }

  const postComment = async () => {
    if (!newComment.trim() || !myPid) return
    await fetch(`/api/hangs/${id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participantId: myPid, text: newComment }) })
    setNewComment("")
    fetch(`/api/hangs/${id}/comments`).then(r => r.json()).then(setComments)
  }

  const nudge = () => {
    const names = missing.map((p: any) => p.name).join(', ')
    navigator.clipboard.writeText(`Hey ${names}! We're planning "${hang.name}" — fill in your availability: ${window.location.origin}/h/${id}`)
    setNudgeCopied(true)
    setTimeout(() => setNudgeCopied(false), 2000)
  }

  const removeParticipant = async (participantId: string) => {
    if (!confirm('Remove this person? Their availability, votes, and comments will be deleted.')) return
    await fetch(`/api/hangs/${id}/participants`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participantId }) })
    fetchAll()
  }

  const downloadCalendar = async () => {
    const res = await fetch(`/api/hangs/${id}/calendar`)
    const cal = await res.json()
    if (cal.error) return
    const blob = new Blob([cal.ics], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = cal.filename; a.click()
    URL.revokeObjectURL(url)
  }

  const openGoogleCal = async () => {
    const res = await fetch(`/api/hangs/${id}/calendar`)
    const cal = await res.json()
    if (cal.gcalUrl) window.open(cal.gcalUrl, '_blank')
  }

  const submitTransport = async () => {
    if (!transportMode || !myPid) return
    await fetch(`/api/hangs/${id}/transport`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participantId: myPid, mode: transportMode, seats: transportSeats }) })
    fetch(`/api/hangs/${id}/transport`).then(r => r.json()).then(setTransport)
  }

  const addBringItem = async () => {
    if (!newBringItem.trim()) return
    await fetch(`/api/hangs/${id}/bring-list`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: 'add', item: newBringItem }) })
    setNewBringItem("")
    fetch(`/api/hangs/${id}/bring-list`).then(r => r.json()).then(setBringList)
  }

  const claimItem = async (itemId: number) => {
    if (!myPid) return
    await fetch(`/api/hangs/${id}/bring-list`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: 'claim', itemId, participantId: myPid }) })
    fetch(`/api/hangs/${id}/bring-list`).then(r => r.json()).then(setBringList)
  }

  const unclaimItem = async (itemId: number) => {
    if (!myPid) return
    await fetch(`/api/hangs/${id}/bring-list`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: 'unclaim', itemId, participantId: myPid }) })
    fetch(`/api/hangs/${id}/bring-list`).then(r => r.json()).then(setBringList)
  }

  const removeBringItem = async (itemId: number) => {
    await fetch(`/api/hangs/${id}/bring-list`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: 'remove', itemId }) })
    fetch(`/api/hangs/${id}/bring-list`).then(r => r.json()).then(setBringList)
  }

  const addSubItem = async (parentId: number, item: string) => {
    if (!item.trim()) return
    await fetch(`/api/hangs/${id}/bring-list`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: 'add', item, parentId }) })
    fetch(`/api/hangs/${id}/bring-list`).then(r => r.json()).then(setBringList)
  }

  const addExpense = async () => {
    if (!expenseDesc || !expenseAmount || !myPid) return
    await fetch(`/api/hangs/${id}/expenses`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: expenseDesc, amount: parseFloat(expenseAmount), paidBy: myPid }) })
    setExpenseDesc(""); setExpenseAmount(""); setShowExpenseForm(false)
    fetch(`/api/hangs/${id}/expenses`).then(r => r.json()).then(setExpenseData)
  }

  const createPoll = async () => {
    if (!pollQuestion || pollOptions.filter(o => o.trim()).length < 2 || !myPid) return
    await fetch(`/api/hangs/${id}/polls`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: 'create', question: pollQuestion, options: pollOptions.filter(o => o.trim()), participantId: myPid }) })
    setPollQuestion(""); setPollOptions(["", ""]); setShowPollForm(false)
    fetch(`/api/hangs/${id}/polls`).then(r => r.json()).then(setPolls)
  }

  const votePoll = async (optionId: number) => {
    if (!myPid) return
    await fetch(`/api/hangs/${id}/polls`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: 'vote', optionId, participantId: myPid }) })
    fetch(`/api/hangs/${id}/polls`).then(r => r.json()).then(setPolls)
  }

  const sendReaction = async (emoji: string) => {
    if (!myPid) return
    await fetch(`/api/hangs/${id}/reactions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participantId: myPid, emoji }) })
    fetch(`/api/hangs/${id}/reactions`).then(r => r.json()).then(setReactions)
  }

  const submitRsvp = async (status: string) => {
    if (!myPid) return
    await fetch(`/api/hangs/${id}/rsvp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participantId: myPid, status }) })
    fetch(`/api/hangs/${id}/rsvp`).then(r => r.json()).then(setRsvps)
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !myPid) return
    const reader = new FileReader()
    reader.onload = async () => {
      await fetch(`/api/hangs/${id}/photos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participantId: myPid, data: reader.result }) })
      fetch(`/api/hangs/${id}/photos`).then(r => r.json()).then(setPhotos)
    }
    reader.readAsDataURL(file)
  }

  // Heatmap helpers
  // Use selected_dates for specific mode, generated range for range mode
  const isSpecificMode = hang?.date_mode === 'specific'
  const dates = hang
    ? (isSpecificMode && hang.selected_dates
      ? (JSON.parse(hang.selected_dates) as string[]).sort()
      : generateDateRange(hang.date_range_start, hang.date_range_end))
    : []
  const HOURS = Array.from({ length: 15 }, (_, i) => i + 8)

  // Check if current user has filled in availability
  const myParticipant = participants.find((p: any) => p.id === myPid)
  const hasFilledAvailability = myParticipant?.hasResponded

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '16px 20px 100px' }}>
      {/* Confetti */}
      {showConfetti && <Confetti />}

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em' }}>{hang.name}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
          <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>
            {participants.length} joined / {responded.length} responded
          </span>
          {countdown && (
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent)', background: 'var(--maybe-light)', padding: '2px 10px', borderRadius: 6 }}>
              {countdown} to go
            </span>
          )}
        </div>
      </div>

      {/* Availability prompt — for users who haven't filled in yet or want to edit */}
      {myPid && (
        <button
          onClick={() => {
            // Navigate to friend page in edit mode — keeps existing participant, skips name step
            window.location.href = `/h/${id}?edit=${myPid}`
          }}
          style={{
            width: '100%', padding: '14px 20px', marginBottom: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: hasFilledAvailability ? 'var(--surface)' : 'var(--maybe-light)',
            border: `1.5px solid ${hasFilledAvailability ? 'var(--border)' : 'var(--maybe)'}`,
            borderRadius: 'var(--radius-md)', cursor: 'pointer',
            fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600,
            color: hasFilledAvailability ? 'var(--text-secondary)' : '#8a6d10',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {hasFilledAvailability
              ? <><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></>
              : <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>
            }
          </svg>
          {hasFilledAvailability ? 'Edit your availability' : 'Add your availability'}
        </button>
      )}

      {/* Synthesis card */}
      {synthesis ? (
        <div className="synthesis-card" style={{ marginBottom: 24 }}>
          <div className="label" style={{ color: 'var(--accent)', marginBottom: 12 }}>Best time — most people free</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            {synthesis.recommendedTime.display}
          </div>
          {synthesis.recommendedActivity && (
            <div style={{ fontSize: 18, color: 'var(--text-secondary)', fontWeight: 600, marginTop: 4 }}>
              {synthesis.recommendedActivity.name}
            </div>
          )}

          {/* Cost estimate */}
          {recommendedActivity?.cost_estimate && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, padding: '6px 12px', background: 'var(--maybe-light)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)', fontSize: 13, color: '#8a6d10' }}>
              {recommendedActivity.cost_estimate}
            </div>
          )}

          {/* Location */}
          {hang.location && (
            <div style={{ marginTop: 10 }}>
              <a href={mapsUrl!} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--surface-dim)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', textDecoration: 'none' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                {hang.location.length > 40 ? hang.location.slice(0, 40) + '...' : hang.location}
              </a>
            </div>
          )}

          {/* Weather */}
          {weather && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, padding: '10px 14px', background: 'var(--surface-dim)', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: 20 }}>{weatherIcon(weather.weatherCode)}</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{weather.description} / {weather.tempMin}&deg;-{weather.tempMax}&deg;C</div>
                {weather.precipChance > 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{weather.precipChance}% chance of rain</div>}
              </div>
            </div>
          )}

          {/* Rain warning for outdoor activities */}
          {rainWarning && (
            <div style={{ marginTop: 8, padding: '8px 12px', background: '#FEF2F2', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--error)', fontWeight: 500 }}>
              Heads up: rain expected. Some outdoor activities might not work.
            </div>
          )}

          {/* Conflict: who can't make it */}
          {synthesis.recommendedTime.absentNames?.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-muted)' }}>
              Can't make it: {synthesis.recommendedTime.absentNames.join(', ')}
            </div>
          )}

          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 12 }}>
            {synthesis.recommendedTime.freeCount} free
            {synthesis.recommendedTime.maybeCount > 0 && ` / ${synthesis.recommendedTime.maybeCount} maybe`}
            {' / '}{synthesis.recommendedTime.attendeeCount} of {synthesis.totalParticipants} can make it
          </div>

          {/* Confidence */}
          <div style={{ marginTop: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Confidence: </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: synthesis.confidence === 'high' ? 'var(--success)' : synthesis.confidence === 'medium' ? '#B8940F' : 'var(--text-muted)' }}>{synthesis.confidence}</span>
          </div>

          {/* Reactions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
            {['fire', 'heart', 'party', 'thumbsup'].map(e => {
              const emoji = e === 'fire' ? '\uD83D\uDD25' : e === 'heart' ? '\u2764\uFE0F' : e === 'party' ? '\uD83C\uDF89' : '\uD83D\uDC4D'
              const count = reactions.filter(r => r.emoji === e).length
              const myReaction = reactions.find(r => r.emoji === e && r.name === participants.find((p: any) => p.id === myPid)?.name)
              return (
                <button key={e} onClick={() => sendReaction(e)} style={{
                  padding: '4px 10px', borderRadius: 20, border: myReaction ? '2px solid var(--accent)' : '1px solid var(--border-light)',
                  background: myReaction ? 'var(--maybe-light)' : 'var(--surface)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  {emoji}{count > 0 && <span style={{ fontSize: 12, fontWeight: 600 }}>{count}</span>}
                </button>
              )
            })}
          </div>

          {hang.status !== "confirmed" && (() => {
            const myVote = confirmVotes?.votes?.find((v: any) => v.name === myParticipant?.name)?.vote
            const yesCount = confirmVotes?.yesCount || 0
            const threshold = confirmVotes?.threshold || 1
            const pct = threshold > 0 ? Math.round((yesCount / threshold) * 100) : 0
            return (
              <div style={{ marginTop: 16 }}>
                {/* Progress bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1, height: 6, background: 'var(--border-light)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: yesCount >= threshold ? 'var(--success)' : 'var(--accent)', borderRadius: 3, transition: 'width 0.3s ease' }} />
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {yesCount}/{threshold}
                  </span>
                </div>

                {/* Vote buttons */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => voteConfirm('yes')}
                    className={myVote === 'yes' ? 'btn-primary' : 'btn-secondary'}
                    style={{ flex: 1 }}
                  >
                    {myVote === 'yes' ? 'Voted yes' : 'Lock it in'}
                  </button>
                  <button
                    onClick={() => voteConfirm('no')}
                    style={{
                      flex: 'none', padding: '14px 20px',
                      background: myVote === 'no' ? '#fef2f2' : 'transparent',
                      border: `1px solid ${myVote === 'no' ? 'var(--error)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius-md)', cursor: 'pointer',
                      fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-display)',
                      color: myVote === 'no' ? 'var(--error)' : 'var(--text-muted)',
                    }}
                  >
                    Not sure
                  </button>
                </div>

                {/* Who's voted */}
                {confirmVotes?.votes?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                    {confirmVotes.votes.map((v: any, i: number) => (
                      <span key={i} style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
                        background: v.vote === 'yes' ? 'var(--free-light)' : '#fef2f2',
                        color: v.vote === 'yes' ? '#1a7a3a' : 'var(--error)',
                      }}>
                        {v.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}
          {hang.status === "confirmed" && (
            <>
              <div style={{ marginTop: 16, padding: 12, textAlign: 'center', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--success)', background: 'var(--free-light)', borderRadius: 'var(--radius-md)' }}>
                Plan confirmed!
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={downloadCalendar} className="btn-secondary" style={{ flex: 1, padding: '10px 12px', fontSize: 13 }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    .ics
                  </span>
                </button>
                <button onClick={openGoogleCal} className="btn-secondary" style={{ flex: 1, padding: '10px 12px', fontSize: 13 }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    Google Cal
                  </span>
                </button>
              </div>
              <button
                onClick={async () => {
                  await fetch(`/api/hangs/${id}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: 'unconfirm' }) })
                  fetchAll()
                }}
                style={{ marginTop: 8, width: '100%', padding: 8, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
              >
                Unconfirm plan
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="card" style={{ padding: 24, textAlign: 'center', marginBottom: 24 }}>
          <p style={{ color: 'var(--text-muted)' }}>Waiting for responses...</p>
        </div>
      )}

      {/* ════════════ PLANNING ════════════ */}
      <SectionGroup title="Planning" defaultOpen={true}>

      {/* Alternative times */}
      {synthesis?.alternativeTimes?.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 24 }}>
          <div className="label" style={{ marginBottom: 10 }}>Other good times</div>
          {synthesis.alternativeTimes.map((alt: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < synthesis.alternativeTimes.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{alt.display}</div>
                {alt.absentNames.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Without: {alt.absentNames.join(', ')}</div>
                )}
              </div>
              <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                {alt.freeCount}+{alt.maybeCount}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* RSVP (after confirmed) */}
      {hang.status === 'confirmed' && myPid && (
        <div className="card" style={{ padding: 16, marginBottom: 24 }}>
          <div className="label" style={{ marginBottom: 10 }}>Are you coming?</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: rsvps.length > 0 ? 12 : 0 }}>
            {[
              { status: 'going', label: 'Definitely', color: 'var(--success)' },
              { status: 'maybe', label: 'Maybe', color: '#B8940F' },
              { status: 'cant', label: "Can't make it", color: 'var(--error)' },
            ].map(r => (
              <button key={r.status} onClick={() => submitRsvp(r.status)} className="chip" style={{
                flex: 1, justifyContent: 'center',
                ...(rsvps.find(rv => rv.name === participants.find((p: any) => p.id === myPid)?.name)?.status === r.status ? { background: r.color, color: '#fff', borderColor: r.color } : {}),
              }}>
                {r.label}
              </button>
            ))}
          </div>
          {rsvps.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {rsvps.map((r: any, i: number) => (
                <span key={i} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, background: r.status === 'going' ? 'var(--free-light)' : r.status === 'maybe' ? 'var(--maybe-light)' : '#fef2f2', color: r.status === 'going' ? '#1a7a3a' : r.status === 'maybe' ? '#8a6d10' : 'var(--error)' }}>
                  {r.name}: {r.status === 'going' ? 'Going' : r.status === 'maybe' ? 'Maybe' : "Can't"}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Who's in + nudge */}
      <div style={{ marginBottom: 24 }}>
        <div className="label" style={{ marginBottom: 10 }}>
          Who's in ({responded.length} responded{missing.length > 0 ? ` / ${missing.length} waiting` : ''})
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {participants.map((p: any) => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
              background: p.hasResponded ? 'var(--surface)' : 'var(--surface-dim)',
              borderRadius: 'var(--radius-md)', border: `1px solid ${p.hasResponded ? 'var(--border-light)' : 'var(--border)'}`,
              opacity: p.hasResponded ? 1 : 0.6,
            }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: p.hasResponded ? 'var(--accent)' : 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: p.hasResponded ? 'var(--accent-text)' : 'var(--text-muted)' }}>
                {p.name.charAt(0).toUpperCase()}
              </div>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</span>
              {!p.hasResponded && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>pending</span>}
              {isCreator && p.id !== creatorPid && (
                <button
                  onClick={(e) => { e.stopPropagation(); removeParticipant(p.id) }}
                  style={{ fontSize: 14, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', lineHeight: 1, marginLeft: 2 }}
                >&times;</button>
              )}
            </div>
          ))}
        </div>
        {missing.length > 0 && (
          <button onClick={nudge} style={{ marginTop: 10, width: '100%', padding: 10, fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-display)', color: 'var(--celebrate)', background: '#FFF3EC', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
            {nudgeCopied ? 'Nudge message copied!' : `Nudge ${missing.map((p: any) => p.name).join(', ')}`}
          </button>
        )}
      </div>

      {/* Availability heatmap */}
      {heatmap && dates.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 24, overflowX: 'auto', position: 'relative' }}>
          <div className="label" style={{ marginBottom: 10 }}>Availability heatmap</div>
          <div style={{ display: 'inline-grid', gridTemplateColumns: `54px repeat(${dates.length}, 48px)`, gap: 2 }}>
            <div />
            {dates.map(d => <div key={d} className="grid-header">{formatDay(d)}</div>)}
            {HOURS.map(h => (
              <div key={h} style={{ display: 'contents' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6 }}>{formatHour(h)}</div>
                {dates.map(d => {
                  const key = `${d}|${h}`
                  const cell = heatmap.heatmap[key]
                  const ratio = cell?.ratio || 0
                  const bg = ratio === 0 ? 'var(--surface-dim)' : ratio >= 0.8 ? '#22A85280' : ratio >= 0.5 ? '#34C26A40' : ratio >= 0.25 ? '#F5C84240' : '#E8E3D920'
                  const isHovered = hoverSlot === key
                  return (
                    <div
                      key={key}
                      onMouseEnter={() => setHoverSlot(key)}
                      onMouseLeave={() => setHoverSlot(null)}
                      onClick={() => setHoverSlot(hoverSlot === key ? null : key)}
                      style={{
                        width: 48, height: 36, borderRadius: 6, background: bg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 600, color: ratio >= 0.5 ? '#1a7a3a' : 'var(--text-muted)',
                        cursor: cell?.total ? 'pointer' : 'default',
                        position: 'relative',
                        outline: isHovered && cell?.total ? '2px solid var(--accent)' : 'none',
                        outlineOffset: -1,
                        transition: 'outline 0.1s ease',
                      }}
                    >
                      {cell && cell.total > 0 ? cell.total : ''}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Tooltip */}
          {hoverSlot && heatmap.heatmap[hoverSlot]?.total > 0 && (() => {
            const cell = heatmap.heatmap[hoverSlot]
            const [date, hourStr] = hoverSlot.split('|')
            return (
              <div style={{
                marginTop: 12, padding: '12px 16px',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)',
              }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
                  {formatDay(date)} {formatHour(parseInt(hourStr))}
                </div>
                {cell.freeNames?.length > 0 && (
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--success)' }}>Free: </span>
                    <span style={{ fontSize: 13 }}>{cell.freeNames.join(', ')}</span>
                  </div>
                )}
                {cell.maybeNames?.length > 0 && (
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#B8940F' }}>Maybe: </span>
                    <span style={{ fontSize: 13 }}>{cell.maybeNames.join(', ')}</span>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* Activity results */}
      <div style={{ marginBottom: 24 }}>
        <div className="label" style={{ marginBottom: 10 }}>Activity votes</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sortedActivities.map((a: any) => {
            const isTopPick = a.id === topActivityId
            const outdoor = isOutdoor(a.name)
            return (
              <div key={a.id} className="card" style={{ padding: '14px 18px', border: isTopPick ? '2px solid var(--accent)' : '1px solid var(--border-light)', position: 'relative' }}>
                {isTopPick && (
                  <div style={{ position: 'absolute', top: -10, right: 14, display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: 'var(--accent)', borderRadius: 6, fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--accent-text)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z"/></svg>
                    Most Popular
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15 }}>
                    {a.name}
                    {outdoor && rainWarning && <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--error)' }} title="Rain expected">&#9748;</span>}
                  </span>
                  {a.cost_estimate && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{a.cost_estimate}</span>}
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 13, marginTop: 2 }}>
                  <span style={{ color: 'var(--success)', fontWeight: 600 }}>{a.ups || 0} keen</span>
                  <span style={{ color: '#B8940F' }}>{a.mehs || 0} meh</span>
                  <span style={{ color: 'var(--error)' }}>{a.downs || 0} nah</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      </SectionGroup>

      {/* ════════════ LOGISTICS ════════════ */}
      <SectionGroup title="Logistics" defaultOpen={true}>

      {/* Bring list — supports sub-items + multi-claim */}
      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <div className="label" style={{ marginBottom: 12 }}>Bring list</div>
        {bringList.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            {bringList.map((item: any) => {
              const iClaimedThis = item.claims?.some((c: any) => c.participantId === myPid)
              return (
                <div key={item.id}>
                  {/* Parent item */}
                  <div style={{ padding: '10px 14px', background: 'var(--surface-dim)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: item.claims?.length > 0 || item.subItems?.length > 0 ? 8 : 0 }}>
                      <span style={{ fontSize: 15, fontWeight: 600 }}>{item.item}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {myPid && !iClaimedThis && (
                          <button onClick={() => claimItem(item.id)} style={{ fontSize: 12, fontWeight: 600, color: 'var(--free)', background: 'var(--free-light)', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>I'll bring this</button>
                        )}
                        {myPid && iClaimedThis && (
                          <button onClick={() => unclaimItem(item.id)} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>Undo</button>
                        )}
                        {myPid && (
                          <button onClick={() => setShowSubInput(showSubInput === item.id ? null : item.id)} style={{ fontSize: 12, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>+sub</button>
                        )}
                        {myPid && (
                          <button onClick={() => removeBringItem(item.id)} style={{ fontSize: 16, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>&times;</button>
                        )}
                      </span>
                    </div>

                    {/* Claimers */}
                    {item.claims?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: item.subItems?.length > 0 ? 8 : 0 }}>
                        {item.claims.map((c: any, ci: number) => (
                          <span key={ci} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, background: 'var(--free-light)', color: '#1a7a3a', fontWeight: 600 }}>
                            {c.name}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Sub-items */}
                    {item.subItems?.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 16, borderLeft: '2px solid var(--border-light)' }}>
                        {item.subItems.map((sub: any) => {
                          const iClaimedSub = sub.claims?.some((c: any) => c.participantId === myPid)
                          return (
                            <div key={sub.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div>
                                <span style={{ fontSize: 13, fontWeight: 500 }}>{sub.item}</span>
                                {sub.claims?.length > 0 && (
                                  <span style={{ marginLeft: 6 }}>
                                    {sub.claims.map((c: any, ci: number) => (
                                      <span key={ci} style={{ fontSize: 11, padding: '1px 6px', borderRadius: 3, background: 'var(--free-light)', color: '#1a7a3a', fontWeight: 600, marginRight: 3 }}>{c.name}</span>
                                    ))}
                                  </span>
                                )}
                              </div>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                {myPid && !iClaimedSub && (
                                  <button onClick={() => claimItem(sub.id)} style={{ fontSize: 11, color: 'var(--free)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>+me</button>
                                )}
                                {myPid && iClaimedSub && (
                                  <button onClick={() => unclaimItem(sub.id)} style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>undo</button>
                                )}
                                {myPid && (
                                  <button onClick={() => removeBringItem(sub.id)} style={{ fontSize: 14, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>&times;</button>
                                )}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Add sub-item input */}
                    {showSubInput === item.id && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <input
                          type="text"
                          value={subItemInputs[item.id] || ''}
                          onChange={e => setSubItemInputs(prev => ({ ...prev, [item.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') { addSubItem(item.id, subItemInputs[item.id] || ''); setSubItemInputs(prev => ({ ...prev, [item.id]: '' })) } }}
                          placeholder="Sub-item..."
                          className="input"
                          style={{ flex: 1, padding: '8px 12px', fontSize: 13 }}
                        />
                        <button onClick={() => { addSubItem(item.id, subItemInputs[item.id] || ''); setSubItemInputs(prev => ({ ...prev, [item.id]: '' })) }} className="btn-primary" style={{ width: 'auto', padding: '8px 14px', fontSize: 13 }}>Add</button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="text" value={newBringItem} onChange={e => setNewBringItem(e.target.value)} onKeyDown={e => e.key === 'Enter' && addBringItem()} placeholder="Add item (speakers, snacks...)" className="input" style={{ flex: 1, padding: '10px 14px', fontSize: 14 }} />
          <button onClick={addBringItem} className="btn-primary" style={{ width: 'auto', padding: '10px 18px', fontSize: 14 }}>Add</button>
        </div>
      </div>

      {/* Polls */}
      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="label">Polls {polls.length > 0 && `(${polls.length})`}</div>
          {myPid && <button onClick={() => setShowPollForm(!showPollForm)} style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>{showPollForm ? 'Cancel' : '+ New poll'}</button>}
        </div>

        {showPollForm && (
          <div style={{ padding: 14, background: 'var(--surface-dim)', borderRadius: 'var(--radius-md)', marginBottom: 14 }}>
            <input type="text" value={pollQuestion} onChange={e => setPollQuestion(e.target.value)} placeholder="What's the question?" className="input" style={{ marginBottom: 8, padding: '10px 14px', fontSize: 14 }} />
            {pollOptions.map((opt, i) => (
              <input key={i} type="text" value={opt} onChange={e => { const o = [...pollOptions]; o[i] = e.target.value; setPollOptions(o) }} placeholder={`Option ${i + 1}`} className="input" style={{ marginBottom: 6, padding: '8px 14px', fontSize: 13 }} />
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => setPollOptions([...pollOptions, ""])} className="btn-secondary" style={{ flex: 1, padding: '8px', fontSize: 13 }}>+ Option</button>
              <button onClick={createPoll} className="btn-primary" style={{ flex: 1, padding: '8px', fontSize: 13 }}>Create</button>
            </div>
          </div>
        )}

        {polls.map((poll: any) => {
          const totalVotes = poll.options.reduce((s: number, o: any) => s + (o.votes || 0), 0)
          return (
            <div key={poll.id} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border-light)' }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{poll.question}</div>
              {poll.options.map((opt: any) => {
                const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0
                const voted = poll.voters?.some((v: any) => v.poll_option_id === opt.id && v.name === participants.find((p: any) => p.id === myPid)?.name)
                return (
                  <button key={opt.id} onClick={() => votePoll(opt.id)} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 12px',
                    marginBottom: 4, borderRadius: 'var(--radius-sm)', border: voted ? '2px solid var(--accent)' : '1px solid var(--border-light)',
                    background: `linear-gradient(to right, ${voted ? 'var(--maybe-light)' : 'var(--surface-dim)'} ${pct}%, var(--surface) ${pct}%)`,
                    cursor: 'pointer', textAlign: 'left',
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{opt.text}</span>
                    <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{opt.votes || 0}</span>
                  </button>
                )
              })}
            </div>
          )
        })}

        {polls.length === 0 && !showPollForm && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No polls yet. Create one to ask the group.</p>
        )}
      </div>

      {/* Transport (after confirmed) */}
      {hang.status === 'confirmed' && (
        <div className="card" style={{ padding: 20, marginBottom: 24 }}>
          <div className="label" style={{ marginBottom: 12 }}>Transport</div>
          {transport.length > 0 && (
            <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {transport.map((t: any, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--surface-dim)', borderRadius: 'var(--radius-sm)' }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{t.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: t.mode === 'driving' ? 'var(--success)' : t.mode === 'need_ride' ? 'var(--celebrate)' : 'var(--text-muted)' }}>
                    {t.mode === 'driving' ? `Driving${t.seats > 0 ? ` (${t.seats} seats)` : ''}` : t.mode === 'need_ride' ? 'Needs a ride' : 'Own way'}
                  </span>
                </div>
              ))}
            </div>
          )}
          {myPid && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[{ mode: 'driving', label: 'Driving' }, { mode: 'need_ride', label: 'Need a ride' }, { mode: 'own_way', label: 'Own way' }].map(opt => (
                <button key={opt.mode} onClick={() => setTransportMode(opt.mode)} className={`chip ${transportMode === opt.mode ? 'chip-active' : ''}`}>{opt.label}</button>
              ))}
              {transportMode === 'driving' && (
                <input type="number" min="1" max="8" placeholder="Seats" value={transportSeats || ''} onChange={e => setTransportSeats(parseInt(e.target.value) || 0)} style={{ width: 70, padding: '8px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', outline: 'none', fontFamily: 'var(--font-mono)' }} />
              )}
              {transportMode && <button onClick={submitTransport} className="btn-primary" style={{ padding: '8px 20px', fontSize: 13, width: 'auto' }}>Save</button>}
            </div>
          )}
        </div>
      )}

      {/* Expenses (after confirmed) */}
      {hang.status === 'confirmed' && (
        <div className="card" style={{ padding: 20, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div className="label">Expenses</div>
            {myPid && <button onClick={() => setShowExpenseForm(!showExpenseForm)} style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>{showExpenseForm ? 'Cancel' : '+ Add expense'}</button>}
          </div>

          {showExpenseForm && (
            <div style={{ padding: 14, background: 'var(--surface-dim)', borderRadius: 'var(--radius-md)', marginBottom: 14 }}>
              <input type="text" value={expenseDesc} onChange={e => setExpenseDesc(e.target.value)} placeholder="What was it?" className="input" style={{ marginBottom: 8, padding: '10px 14px', fontSize: 14 }} />
              <input type="number" value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)} placeholder="Amount ($)" className="input" style={{ marginBottom: 8, padding: '10px 14px', fontSize: 14 }} />
              <button onClick={addExpense} className="btn-primary" style={{ fontSize: 13 }}>Add expense</button>
            </div>
          )}

          {expenseData?.expenses?.length > 0 ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                {expenseData.expenses.map((e: any) => (
                  <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--surface-dim)', borderRadius: 'var(--radius-sm)' }}>
                    <span style={{ fontSize: 14 }}>{e.description} <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>by {e.paid_by_name}</span></span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600 }}>${e.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: '12px 14px', background: 'var(--maybe-light)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>Total</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>${expenseData.totalSpent.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Per person</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>${expenseData.perPerson.toFixed(2)}</span>
                </div>
                {Object.entries(expenseData.balances || {}).some(([, v]) => Math.abs(v as number) > 0.01) && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Balances</div>
                    {Object.entries(expenseData.balances).map(([name, amount]) => {
                      const val = amount as number
                      if (Math.abs(val) < 0.01) return null
                      return (
                        <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 2 }}>
                          <span>{name}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', color: val > 0 ? 'var(--success)' : 'var(--error)', fontWeight: 600 }}>
                            {val > 0 ? `+$${val.toFixed(2)}` : `-$${Math.abs(val).toFixed(2)}`}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          ) : !showExpenseForm && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No expenses logged yet.</p>
          )}
        </div>
      )}

      </SectionGroup>

      {/* ════════════ SOCIAL ════════════ */}
      <SectionGroup title="Social" defaultOpen={true}>

      {/* Comments thread */}
      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <div className="label" style={{ marginBottom: 12 }}>Comments {comments.length > 0 && `(${comments.length})`}</div>
        {comments.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14, maxHeight: 300, overflowY: 'auto' }}>
            {comments.map((c: any) => (
              <div key={c.id} style={{ display: 'flex', gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--accent-text)' }}>
                  {c.author.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 13 }}>
                    <span style={{ fontWeight: 700 }}>{c.author}</span>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 8, fontSize: 11, fontFamily: 'var(--font-mono)' }}>{new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 2 }}>{c.text}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>No comments yet.</p>
        )}
        {myPid && (
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="text" value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && postComment()} placeholder="Say something..." className="input" style={{ flex: 1, padding: '10px 14px', fontSize: 14 }} />
            <button onClick={postComment} className="btn-primary" style={{ width: 'auto', padding: '10px 18px', fontSize: 14 }}>Send</button>
          </div>
        )}
      </div>

      {/* Post-hang photos */}
      {isPast && (
        <div className="card" style={{ padding: 20, marginBottom: 24 }}>
          <div className="label" style={{ marginBottom: 12 }}>Recap {photos.length > 0 && `(${photos.length} photos)`}</div>
          {photos.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
              {photos.map((ph: any) => (
                <div key={ph.id} style={{ position: 'relative' }}>
                  <img src={ph.data} alt={ph.caption || 'Hangout photo'} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} />
                  <div style={{ position: 'absolute', bottom: 4, left: 4, right: 4, fontSize: 10, fontWeight: 600, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.6)', padding: '2px 4px' }}>{ph.author}</div>
                </div>
              ))}
            </div>
          )}
          {myPid && (
            <>
              <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: 'none' }} />
              <button onClick={() => photoInputRef.current?.click()} className="btn-secondary" style={{ width: '100%', fontSize: 13 }}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  Add a photo
                </span>
              </button>
            </>
          )}
        </div>
      )}

      </SectionGroup>

      {/* Share + change response */}
      <button
        onClick={() => {
          const url = `${window.location.origin}/h/${id}`
          if (navigator.share) navigator.share({ title: hang.name, url })
          else navigator.clipboard.writeText(url)
        }}
        className="btn-secondary" style={{ width: '100%', marginBottom: 12 }}
      >
        Share link with more friends
      </button>

      {myPid && (
        <button
          onClick={() => { localStorage.removeItem(`hangs_participant_${id}`); localStorage.removeItem(`hangs_${id}`); window.location.href = `/h/${id}` }}
          style={{ display: 'block', width: '100%', textAlign: 'center', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-body)', marginBottom: 16 }}
        >
          Change your response
        </button>
      )}

      <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        Auto-refreshing every 5s
      </div>

      {/* ── Sticky CTA bar (Fitts's Law — always reachable) ── */}
      {synthesis && (
        <div className="sticky-bar">
          {hang.status !== 'confirmed' ? (
            (() => {
              const myVote = confirmVotes?.votes?.find((v: any) => v.name === myParticipant?.name)?.vote
              const yesCount = confirmVotes?.yesCount || 0
              const threshold = confirmVotes?.threshold || 1
              return (
                <button onClick={() => voteConfirm(myVote === 'yes' ? 'no' : 'yes')} className="btn-primary" style={{ position: 'relative', overflow: 'hidden' }}>
                  <span style={{ position: 'relative', zIndex: 1 }}>
                    {myVote === 'yes' ? `Voted — ${yesCount}/${threshold}` : `Lock it in (${yesCount}/${threshold})`}
                  </span>
                </button>
              )
            })()
          ) : (
            <>
              <button onClick={() => {
                const url = `${window.location.origin}/h/${id}`
                if (navigator.share) navigator.share({ title: hang.name, url })
                else navigator.clipboard.writeText(url)
              }} className="btn-secondary" style={{ flex: 1 }}>
                Share
              </button>
              <button onClick={downloadCalendar} className="btn-primary" style={{ flex: 1 }}>
                Add to calendar
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Helpers ──

function generateDateRange(start: string, end: string): string[] {
  const dates: string[] = []
  const d = new Date(start + "T00:00:00")
  const e = new Date(end + "T00:00:00")
  while (d <= e) { dates.push(d.toISOString().split("T")[0]); d.setDate(d.getDate() + 1) }
  return dates.slice(0, 7)
}

function weatherIcon(code: number): string {
  if (code === 0) return '\u2600\uFE0F'
  if (code <= 3) return '\u26C5'
  if (code <= 48) return '\uD83C\uDF2B\uFE0F'
  if (code <= 55) return '\uD83C\uDF26\uFE0F'
  if (code <= 65) return '\uD83C\uDF27\uFE0F'
  if (code <= 75) return '\u2744\uFE0F'
  if (code <= 82) return '\uD83C\uDF26\uFE0F'
  return '\u26C8\uFE0F'
}

function Confetti() {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 1000, overflow: 'hidden' }}>
      {Array.from({ length: 40 }).map((_, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: `${Math.random() * 100}%`,
          top: -20,
          width: 8 + Math.random() * 8,
          height: 8 + Math.random() * 8,
          background: ['#F5C842', '#34C26A', '#FF6B2B', '#E05252', '#4A90D9'][Math.floor(Math.random() * 5)],
          borderRadius: Math.random() > 0.5 ? '50%' : '2px',
          animation: `confetti-fall ${1.5 + Math.random() * 2}s ease-in forwards`,
          animationDelay: `${Math.random() * 0.5}s`,
        }} />
      ))}
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(${360 + Math.random() * 360}deg); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
