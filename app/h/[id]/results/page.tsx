"use client"
import { useState, useEffect, useRef, use } from "react"
import { showToast } from "@/components/Toast"
import { showConfirm } from "@/components/ui/ConfirmModal"
import { formatDeadline } from "@/lib/time"

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
  const [commitment, setCommitment] = useState<{
    aggregate: { in: number; probably: number; cant: number; unknown: number }
    byParticipant: Record<string, 'in' | 'probably' | 'cant'>
  } | null>(null)

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

  // ── Creator admin state ──
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [showPendingList, setShowPendingList] = useState(false)
  const [newActivityName, setNewActivityName] = useState('')
  const [newActivityCost, setNewActivityCost] = useState('')

  const creatorPid = typeof window !== 'undefined' ? localStorage.getItem(`hangs_${id}`) || '' : ''
  const myPid = typeof window !== 'undefined' ? (
    localStorage.getItem(`hangs_participant_${id}`) || creatorPid
  ) : ''
  const isCreator = !!creatorPid

  // Authorization header for every mutation request. Token is issued by /join
  // or the create endpoint and stored in localStorage as hangs_token_{id}.
  const authHeaders = (): HeadersInit => {
    const token = typeof window !== 'undefined' ? localStorage.getItem(`hangs_token_${id}`) || '' : ''
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
  }

  // Single fetch hitting /state — one batched DB round-trip instead of 12 parallel endpoints.
  const fetchState = async () => {
    try {
      const res = await fetch(`/api/hangs/${id}/state`)
      if (!res.ok) {
        if (res.status !== 404) showToast('Failed to refresh — retrying…', 'error')
        return
      }
      const d = await res.json()
      if (d.error) return
      setData({
        hang: d.hang,
        participants: d.participants,
        activities: d.activities,
        availability: d.availability,
        synthesis: d.synthesis,
      })
      setComments(d.comments || [])
      setTransport(d.transport || [])
      setBringList(d.bringList || [])
      setExpenseData(d.expenseData)
      setPolls(d.polls || [])
      setRsvps(d.rsvps || [])
      setReactions(d.reactions || [])
      setHeatmap(d.heatmap)
      setConfirmVotes(d.confirmVotes)
      setCommitment(d.commitment || null)
    } catch {
      showToast('Network error — check your connection', 'error')
    }
  }

  // Weather and photos live outside the hot-path poll — they change slowly.
  const fetchWeather = () => fetch(`/api/hangs/${id}/weather`)
    .then(r => r.json())
    .then(d => { if (!d.error) setWeather(d) })
    .catch(err => console.warn('[hangs] weather fetch failed:', err))
  const fetchPhotos = () => fetch(`/api/hangs/${id}/photos`)
    .then(r => r.json())
    .then(setPhotos)
    .catch(err => console.warn('[hangs] photos fetch failed:', err))

  // Kept for child actions that need to trigger a refresh (kept name for minimal diff below).
  const fetchAll = fetchState

  useEffect(() => {
    // Initial paint
    fetchState()
    fetchWeather()
    fetchPhotos()

    // Self-scheduling loop — never stacks requests, pauses when tab is hidden.
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const tick = async () => {
      if (cancelled) return
      if (document.visibilityState === 'visible') {
        await fetchState()
      }
      if (!cancelled) timer = setTimeout(tick, 5000)
    }
    timer = setTimeout(tick, 5000)

    const onVis = () => {
      if (document.visibilityState === 'visible') fetchState()
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [id])

  if (!data) return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 20px 48px' }}>
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
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div className="hangs-skel" style={{ height: 28, width: '55%' }} />
        <div className="hangs-skel" style={{ height: 28, width: 72 }} />
      </div>
      {/* Synthesis card */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="hangs-skel" style={{ height: 14, width: 90, marginBottom: 12 }} />
        <div className="hangs-skel" style={{ height: 28, width: '70%', marginBottom: 8 }} />
        <div className="hangs-skel" style={{ height: 14, width: '40%' }} />
      </div>
      {/* Heatmap placeholder */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="hangs-skel" style={{ height: 14, width: 70, marginBottom: 14 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {Array.from({ length: 28 }).map((_, i) => (
            <div key={i} className="hangs-skel" style={{ height: 22, opacity: 0.6 + (Math.sin(i) * 0.2) }} />
          ))}
        </div>
      </div>
      {/* Who's in */}
      <div className="card" style={{ padding: 20 }}>
        <div className="hangs-skel" style={{ height: 14, width: 80, marginBottom: 14 }} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="hangs-skel" style={{ height: 32, width: 72 + (i * 8), borderRadius: 16 }} />
          ))}
        </div>
      </div>
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
      method: "POST", headers: authHeaders(),
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
    await fetch(`/api/hangs/${id}/comments`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ participantId: myPid, text: newComment }) })
    setNewComment("")
    fetch(`/api/hangs/${id}/comments`).then(r => r.json()).then(setComments)
  }

  const nudge = () => {
    const names = missing.map((p: any) => p.name).join(', ')
    navigator.clipboard.writeText(`Hey ${names}! We're planning "${hang.name}" — fill in your availability: ${window.location.origin}/h/${id}`)
    setNudgeCopied(true)
    setTimeout(() => setNudgeCopied(false), 2000)
  }

  // Build a plain-text summary for pasting into Messenger / WhatsApp / iMessage.
  // Shape changes based on whether the hang is confirmed (final plan) or still
  // being decided (call-to-action for pending responders).
  const copySummary = async () => {
    if (!hang) return
    const url = `${window.location.origin}/h/${id}`
    const lines: string[] = []

    if (hang.status === 'confirmed' && hang.confirmed_date) {
      const d = new Date(hang.confirmed_date + 'T00:00:00')
      const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
      const monthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]
      const hour = hang.confirmed_hour || 12
      const timeStr = hour === 0 ? '12am' : hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour - 12}pm`
      lines.push(`📅 ${hang.name}`)
      lines.push(`🕒 ${dayName} ${d.getDate()} ${monthName}, ${timeStr}`)
      if (hang.location) {
        const loc = hang.location.startsWith('http') ? hang.location : hang.location
        lines.push(`📍 ${loc.length > 80 ? loc.slice(0, 80) + '…' : loc}`)
      }
      const byP = commitment?.byParticipant || {}
      const inNames = participants.filter((p: any) => byP[p.id] === 'in').map((p: any) => p.name)
      const probablyNames = participants.filter((p: any) => byP[p.id] === 'probably').map((p: any) => p.name)
      if (inNames.length > 0) lines.push(`✅ In: ${inNames.join(', ')}`)
      if (probablyNames.length > 0) lines.push(`🤔 Probably: ${probablyNames.join(', ')}`)
      const claimedBring = bringList.filter((b: any) => b.claimedBy && b.claimedBy.length > 0)
      if (claimedBring.length > 0) {
        const bringStr = claimedBring.slice(0, 5).map((b: any) => `${b.item} (${b.claimedBy.map((c: any) => c.name).join(', ')})`).join(' · ')
        lines.push(`🎒 ${bringStr}${claimedBring.length > 5 ? ' …' : ''}`)
      }
      lines.push(`🔗 ${url}`)
    } else {
      lines.push(`📅 ${hang.name} — help pick a time`)
      if (synthesis?.recommendedTime?.date) {
        const { date, hour } = synthesis.recommendedTime
        const d = new Date(date + 'T00:00:00')
        const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
        const timeStr = hour === 0 ? '12am' : hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour - 12}pm`
        lines.push(`✨ Best so far: ${dayName} ${d.getDate()}, ${timeStr}`)
      }
      if (hang.location) lines.push(`📍 ${hang.location.length > 80 ? hang.location.slice(0, 80) + '…' : hang.location}`)
      const respondedCount = responded.length
      const missingCount = missing.length
      if (respondedCount > 0 || missingCount > 0) {
        const parts: string[] = []
        if (respondedCount > 0) parts.push(`${respondedCount} in so far`)
        if (missingCount > 0) parts.push(`${missingCount} haven't replied`)
        lines.push(`👋 ${parts.join(' · ')}`)
      }
      lines.push(`🔗 Fill in when you're free: ${url}`)
    }

    const summary = lines.join('\n')
    try {
      // Prefer native share sheet on mobile (iOS share → Messages, Messenger, WhatsApp, etc.)
      if (navigator.share) {
        await navigator.share({ title: hang.name, text: summary })
      } else {
        await navigator.clipboard.writeText(summary)
        showToast('Summary copied — paste into your group chat', 'success')
      }
    } catch (err) {
      // User cancelled share sheet OR clipboard blocked — fall back to manual copy.
      if ((err as Error)?.name !== 'AbortError') {
        try {
          await navigator.clipboard.writeText(summary)
          showToast('Summary copied', 'success')
        } catch {
          showToast('Could not copy summary', 'error')
        }
      }
    }
  }

  const removeParticipant = async (participantId: string) => {
    const ok = await showConfirm({
      title: 'Remove this person?',
      message: 'Their availability, votes, and comments will be deleted.',
      confirmLabel: 'Remove',
      danger: true,
    })
    if (!ok) return
    await fetch(`/api/hangs/${id}/participants`, { method: "DELETE", headers: authHeaders(), body: JSON.stringify({ participantId }) })
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
    await fetch(`/api/hangs/${id}/transport`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ participantId: myPid, mode: transportMode, seats: transportSeats }) })
    fetch(`/api/hangs/${id}/transport`).then(r => r.json()).then(setTransport)
  }

  const addBringItem = async () => {
    const itemText = newBringItem.trim()
    if (!itemText) return
    const prev = bringList
    // Optimistic: show the new item immediately with a negative tempId so we
    // can swap it out when the real row comes back from the server.
    const tempId = -Date.now()
    setBringList(curr => [...curr, { id: tempId, item: itemText, claimedBy: [], parent_id: null }])
    setNewBringItem("")
    try {
      const res = await fetch(`/api/hangs/${id}/bring-list`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ action: 'add', item: itemText }) })
      if (!res.ok) throw new Error('add failed')
      const next = await fetch(`/api/hangs/${id}/bring-list`).then(r => r.json())
      if (Array.isArray(next)) setBringList(next)
    } catch {
      setBringList(prev)
      setNewBringItem(itemText)
      showToast('Could not add item', 'error')
    }
  }

  const claimItem = async (itemId: number) => {
    if (!myPid) return
    const myName = participants.find((p: any) => p.id === myPid)?.name || 'You'
    const prev = bringList
    // Optimistic: add me to claimedBy immediately so the tap feels instant.
    setBringList(curr => curr.map((it: any) => it.id === itemId
      ? { ...it, claimedBy: [...(it.claimedBy || []), { id: myPid, name: myName }] }
      : it))
    try {
      const res = await fetch(`/api/hangs/${id}/bring-list`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ action: 'claim', itemId, participantId: myPid }) })
      if (!res.ok) throw new Error('claim failed')
      const next = await fetch(`/api/hangs/${id}/bring-list`).then(r => r.json())
      if (Array.isArray(next)) setBringList(next)
    } catch {
      setBringList(prev)
      showToast('Could not claim item', 'error')
    }
  }

  const unclaimItem = async (itemId: number) => {
    if (!myPid) return
    const prev = bringList
    // Optimistic: remove me from claimedBy immediately.
    setBringList(curr => curr.map((it: any) => it.id === itemId
      ? { ...it, claimedBy: (it.claimedBy || []).filter((c: any) => c.id !== myPid) }
      : it))
    try {
      const res = await fetch(`/api/hangs/${id}/bring-list`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ action: 'unclaim', itemId, participantId: myPid }) })
      if (!res.ok) throw new Error('unclaim failed')
      const next = await fetch(`/api/hangs/${id}/bring-list`).then(r => r.json())
      if (Array.isArray(next)) setBringList(next)
    } catch {
      setBringList(prev)
      showToast('Could not unclaim item', 'error')
    }
  }

  const removeBringItem = async (itemId: number) => {
    const prev = bringList
    // Optimistic: drop the item (and any children) from local state immediately.
    setBringList(curr => curr.filter((it: any) => it.id !== itemId && it.parent_id !== itemId))
    try {
      const res = await fetch(`/api/hangs/${id}/bring-list`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ action: 'remove', itemId }) })
      if (!res.ok) throw new Error('remove failed')
      const next = await fetch(`/api/hangs/${id}/bring-list`).then(r => r.json())
      if (Array.isArray(next)) setBringList(next)
    } catch {
      setBringList(prev)
      showToast('Could not remove item', 'error')
    }
  }

  const addSubItem = async (parentId: number, item: string) => {
    if (!item.trim()) return
    await fetch(`/api/hangs/${id}/bring-list`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ action: 'add', item, parentId }) })
    fetch(`/api/hangs/${id}/bring-list`).then(r => r.json()).then(setBringList)
  }

  const addExpense = async () => {
    if (!expenseDesc || !expenseAmount || !myPid) return
    await fetch(`/api/hangs/${id}/expenses`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ description: expenseDesc, amount: parseFloat(expenseAmount), paidBy: myPid }) })
    setExpenseDesc(""); setExpenseAmount(""); setShowExpenseForm(false)
    fetch(`/api/hangs/${id}/expenses`).then(r => r.json()).then(setExpenseData)
  }

  const createPoll = async () => {
    if (!pollQuestion || pollOptions.filter(o => o.trim()).length < 2 || !myPid) return
    await fetch(`/api/hangs/${id}/polls`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ action: 'create', question: pollQuestion, options: pollOptions.filter(o => o.trim()), participantId: myPid }) })
    setPollQuestion(""); setPollOptions(["", ""]); setShowPollForm(false)
    fetch(`/api/hangs/${id}/polls`).then(r => r.json()).then(setPolls)
  }

  const votePoll = async (optionId: number) => {
    if (!myPid) return
    const prev = polls
    // Optimistic: bump the chosen option's vote count and flip myVote so the
    // UI reacts instantly. Server returns the authoritative totals after.
    setPolls(curr => curr.map((poll: any) => {
      if (!poll.options?.some((o: any) => o.id === optionId)) return poll
      const prevVote = poll.myVote
      return {
        ...poll,
        myVote: optionId,
        options: poll.options.map((o: any) => {
          let count = o.votes || 0
          if (o.id === optionId && prevVote !== optionId) count += 1
          if (o.id === prevVote && prevVote !== optionId) count = Math.max(0, count - 1)
          return { ...o, votes: count }
        }),
      }
    }))
    try {
      const res = await fetch(`/api/hangs/${id}/polls`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ action: 'vote', optionId, participantId: myPid }) })
      if (!res.ok) throw new Error('vote failed')
      const next = await fetch(`/api/hangs/${id}/polls`).then(r => r.json())
      if (Array.isArray(next)) setPolls(next)
    } catch {
      setPolls(prev)
      showToast('Could not save vote', 'error')
    }
  }

  const sendReaction = async (emoji: string) => {
    if (!myPid) return
    const prev = reactions
    // Optimistic: append the reaction immediately so the emoji fly-in feels live.
    setReactions(curr => [...curr, { participantId: myPid, participant_id: myPid, emoji, createdAt: Date.now() }])
    try {
      const res = await fetch(`/api/hangs/${id}/reactions`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ participantId: myPid, emoji }) })
      if (!res.ok) throw new Error('reaction failed')
      const next = await fetch(`/api/hangs/${id}/reactions`).then(r => r.json())
      if (Array.isArray(next)) setReactions(next)
    } catch {
      setReactions(prev)
      // Reactions are low-stakes; keep the toast quiet here.
    }
  }

  const submitRsvp = async (status: string) => {
    if (!myPid) return
    const prev = rsvps
    // Optimistic: bump my RSVP in the local list so the pill feels instant.
    setRsvps(curr => {
      const filtered = curr.filter((r: any) => r.participantId !== myPid && r.participant_id !== myPid)
      return [...filtered, { participantId: myPid, participant_id: myPid, status }]
    })
    try {
      const res = await fetch(`/api/hangs/${id}/rsvp`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ participantId: myPid, status }) })
      if (!res.ok) throw new Error('rsvp failed')
      const next = await fetch(`/api/hangs/${id}/rsvp`).then(r => r.json())
      if (Array.isArray(next)) setRsvps(next)
    } catch {
      setRsvps(prev)
      showToast('Could not save RSVP', 'error')
    }
  }

  // ── Creator admin handlers ──
  const patchField = async (field: string, value: string | boolean) => {
    const res = await fetch(`/api/hangs/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ [field]: value }),
    })
    if (res.ok) {
      setEditingField(null)
      setEditValue('')
      fetchState()
    } else {
      showToast('Failed to save change', 'error')
    }
  }

  const addActivity = async () => {
    if (!newActivityName.trim()) return
    const res = await fetch(`/api/hangs/${id}/activities`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name: newActivityName.trim(), costEstimate: newActivityCost.trim() }),
    })
    if (res.ok) {
      setNewActivityName('')
      setNewActivityCost('')
      fetchState()
    } else {
      showToast('Failed to add activity', 'error')
    }
  }

  const removeActivity = async (activityId: number, activityName: string, hasVotes: boolean) => {
    const ok = await showConfirm({
      title: `Remove "${activityName}"?`,
      message: hasVotes ? 'Existing votes will be deleted.' : 'This will take it off the board.',
      confirmLabel: 'Remove',
      danger: true,
    })
    if (!ok) return
    const res = await fetch(`/api/hangs/${id}/activities`, {
      method: 'DELETE',
      headers: authHeaders(),
      body: JSON.stringify({ activityId }),
    })
    if (res.ok) fetchState()
    else showToast('Failed to remove activity', 'error')
  }

  const settingsAction = async (action: 'lock' | 'unlock' | 'cancel' | 'uncancel') => {
    const res = await fetch(`/api/hangs/${id}/settings`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ action }),
    })
    if (res.ok) {
      fetchState()
      showToast(`Hang ${action}ed`, 'success')
    } else {
      showToast(`Failed to ${action}`, 'error')
    }
  }

  const forceConfirmSlot = async (date: string, hour: number) => {
    const ok = await showConfirm({
      title: 'Lock this slot in as host?',
      message: 'This bypasses the majority vote and locks the plan for everyone.',
      confirmLabel: 'Lock it in',
    })
    if (!ok) return
    const recActivity = synthesis?.recommendedActivity?.name || ''
    const res = await fetch(`/api/hangs/${id}/confirm`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ action: 'force', date, hour, activityName: recActivity }),
    })
    if (res.ok) {
      setShowConfetti(true)
      setTimeout(() => setShowConfetti(false), 3000)
      fetchState()
    } else {
      showToast('Failed to confirm', 'error')
    }
  }

  const copyNudgeMessage = () => {
    const names = missing.map((p: any) => p.name).join(', ')
    navigator.clipboard.writeText(`Hey ${names}! We're planning "${hang.name}" — fill in your availability: ${window.location.origin}/h/${id}`)
    setNudgeCopied(true)
    setTimeout(() => setNudgeCopied(false), 2000)
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !myPid) return
    const reader = new FileReader()
    reader.onload = async () => {
      let data = reader.result as string
      // Strip EXIF (including GPS) from JPEGs before upload. Partiful had this
      // exact leak in Oct 2025 — do not skip.
      try {
        if (data.startsWith('data:image/jpeg')) {
          const piexif = (await import('piexifjs')).default
          data = piexif.remove(data)
        }
      } catch (err) {
        console.warn('EXIF strip failed, continuing:', err)
      }
      await fetch(`/api/hangs/${id}/photos`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ data }) })
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

  const firmlyIn = commitment?.aggregate?.in || 0
  const isLocked = !!hang.locked_at
  const isCancelled = !!hang.cancelled_at

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '16px 20px 100px' }}>
      {/* Confetti */}
      {showConfetti && <Confetti />}

      {/* ═══════════ Admin header band (creator only) ═══════════ */}
      {isCreator && (
        <div style={{
          margin: '-16px -20px 20px',
          padding: '14px 20px',
          background: 'var(--maybe-light)',
          borderBottom: '2px solid var(--accent)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 10px', background: 'var(--accent)', color: 'var(--accent-text)',
                borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-display)',
                textTransform: 'uppercase', letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
              }}>
                Hosting
              </span>
              <span style={{ fontSize: 12, color: '#8a6d10', fontWeight: 600, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                {responded.length}/{participants.length} responded
                {firmlyIn > 0 && ` · ${firmlyIn} firmly in`}
              </span>
              {isLocked && (
                <span style={{ padding: '2px 8px', background: 'var(--surface-dim)', borderRadius: 4, fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>
                  LOCKED
                </span>
              )}
              {isCancelled && (
                <span style={{ padding: '2px 8px', background: '#fef2f2', borderRadius: 4, fontSize: 10, fontWeight: 700, color: 'var(--error)' }}>
                  CANCELLED
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => {
                  const url = `${window.location.origin}/h/${id}`
                  if (navigator.share) navigator.share({ title: hang.name, url })
                  else { navigator.clipboard.writeText(url); showToast('Link copied', 'success') }
                }}
                title="Share link"
                style={{
                  padding: '6px 10px', background: 'var(--surface)',
                  border: '1px solid var(--border-light)', borderRadius: 6,
                  cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
                }}
              >
                Share
              </button>
              <button
                onClick={copySummary}
                title="Copy a plain-text summary for Messenger, WhatsApp, or iMessage"
                style={{
                  padding: '6px 10px', background: 'var(--accent-light, var(--surface))',
                  border: '1px solid var(--accent)', borderRadius: 6,
                  cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--accent-text, var(--text-primary))',
                }}
              >
                Copy for chat
              </button>
              {missing.length > 0 && (
                <button
                  onClick={() => setShowPendingList(v => !v)}
                  style={{
                    padding: '6px 10px', background: 'var(--surface)',
                    border: '1px solid var(--border-light)', borderRadius: 6,
                    cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--celebrate)',
                  }}
                >
                  Nudge ({missing.length})
                </button>
              )}
              <button
                onClick={() => setShowSettings(true)}
                title="Settings"
                style={{
                  padding: '6px 10px', background: 'var(--surface)',
                  border: '1px solid var(--border-light)', borderRadius: 6,
                  cursor: 'pointer', fontSize: 14,
                }}
              >
                ⚙
              </button>
            </div>
          </div>

          {/* Inline pending list expand */}
          {showPendingList && missing.length > 0 && (
            <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Still waiting on
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {missing.map((p: any) => (
                  <span key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'var(--surface-dim)', borderRadius: 16, fontSize: 12, fontWeight: 600 }}>
                    {p.name}
                    <button
                      onClick={() => removeParticipant(p.id)}
                      title="Mark as not coming"
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', padding: 0, marginLeft: 2, lineHeight: 1 }}
                    >×</button>
                  </span>
                ))}
              </div>
              <button
                onClick={copyNudgeMessage}
                style={{
                  width: '100%', padding: 8, fontSize: 12, fontWeight: 600,
                  color: 'var(--celebrate)', background: '#FFF3EC', border: 'none',
                  borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-display)',
                }}
              >
                {nudgeCopied ? '✓ Copied — paste into your group chat' : 'Copy nudge message'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Guest → crew conversion CTA. Shown when the hang belongs to a crew
          with a public invite link — gives responders a frictionless path to
          "save this crew for next time" after their first hang.
          Hidden for users who are already crew members. */}
      {data.crew && data.crew.publicInviteToken && data.crew.slug && !data.viewerIsCrewMember && (
        <GuestCrewConvertCTA
          crewName={data.crew.name}
          crewEmoji={data.crew.coverEmoji}
          joinHref={`/c/${data.crew.slug}/join?token=${data.crew.publicInviteToken}`}
        />
      )}

      {/* Post-hang recap sharing (only after confirmed_date passed) */}
      {isPast && hang.status === 'confirmed' && (
        <div style={{
          padding: '12px 14px', marginBottom: 20,
          background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>This hang wrapped — share the recap</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Downloads a story-sized image (1080×1920)
            </div>
          </div>
          <a
            href={`/api/hangs/${id}/recap`}
            target="_blank"
            rel="noopener noreferrer"
            download={`hangs-${id}-recap.png`}
            style={{
              fontSize: 12, fontWeight: 700, padding: '8px 14px', borderRadius: 8,
              background: 'var(--accent)', color: 'var(--accent-text)', textDecoration: 'none', whiteSpace: 'nowrap',
            }}
          >
            ↓ Share recap
          </a>
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        {isCreator && editingField === 'name' ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') patchField('name', editValue)
                if (e.key === 'Escape') setEditingField(null)
              }}
              autoFocus
              maxLength={120}
              className="input"
              style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)' }}
            />
            <button onClick={() => patchField('name', editValue)} className="btn-primary" style={{ width: 'auto', padding: '10px 16px', fontSize: 13 }}>Save</button>
            <button onClick={() => setEditingField(null)} style={{ padding: '10px 14px', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          </div>
        ) : (
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', display: 'flex', alignItems: 'center', gap: 8 }}>
            {hang.name}
            {isCreator && (
              <button
                onClick={() => { setEditingField('name'); setEditValue(hang.name) }}
                title="Edit name"
                style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', opacity: 0.4, fontSize: 14 }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '0.4' }}
              >
                ✎
              </button>
            )}
          </h1>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>
            {participants.length} joined / {responded.length} responded
          </span>
          {countdown && (
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent)', background: 'var(--maybe-light)', padding: '2px 10px', borderRadius: 6 }}>
              {countdown} to go
            </span>
          )}
          {(() => {
            const d = formatDeadline(hang.response_deadline)
            if (!d) return null
            const bg = d.closed ? 'var(--surface-dim)' : d.urgent ? '#fef2f2' : 'var(--surface-dim)'
            const color = d.closed ? 'var(--text-muted)' : d.urgent ? 'var(--error)' : 'var(--text-secondary)'
            const border = d.closed ? 'var(--border-light)' : d.urgent ? 'var(--error)' : 'var(--border-light)'
            return (
              <span style={{
                fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)',
                color, background: bg, border: `1px solid ${border}`,
                padding: '2px 10px', borderRadius: 6,
              }}>
                ⏰ {d.text}
              </span>
            )
          })()}
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

          {/* Weather — compact inline badge (rain warning inlined as color) */}
          {weather && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              marginTop: 10, padding: '4px 10px',
              background: rainWarning ? '#FEF2F2' : 'var(--surface-dim)',
              borderRadius: 999,
              fontSize: 12, color: rainWarning ? 'var(--error)' : 'var(--text-secondary)',
              fontWeight: 500,
            }}
            title={rainWarning ? `Rain expected — ${weather.precipChance}% chance` : `${weather.tempMin}°-${weather.tempMax}°C`}
            >
              <span>{weatherIcon(weather.weatherCode)}</span>
              <span>{weather.tempMin}°-{weather.tempMax}°C</span>
              {weather.precipChance > 20 && <span>· {weather.precipChance}% rain</span>}
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
                  await fetch(`/api/hangs/${id}/confirm`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ action: 'unconfirm' }) })
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
        <div className="label" style={{ marginBottom: 8 }}>
          Who's in ({responded.length} responded{missing.length > 0 ? ` / ${missing.length} waiting` : ''})
        </div>

        {/* Response progress bar — visual signal for how complete the hang is */}
        {participants.length > 0 && (
          <div
            role="progressbar"
            aria-label={`${responded.length} of ${participants.length} responded`}
            aria-valuenow={responded.length}
            aria-valuemin={0}
            aria-valuemax={participants.length}
            style={{
              height: 6, width: '100%', background: 'var(--surface-dim)',
              borderRadius: 4, marginBottom: 14, overflow: 'hidden',
            }}
          >
            <div style={{
              height: '100%',
              width: `${Math.round((responded.length / Math.max(1, participants.length)) * 100)}%`,
              background: responded.length === participants.length ? 'var(--free)' : 'var(--accent)',
              borderRadius: 4,
              transition: 'width 0.35s cubic-bezier(0.25, 0.1, 0.25, 1)',
            }} />
          </div>
        )}

        {/* Commitment breakdown */}
        {commitment && (commitment.aggregate.in + commitment.aggregate.probably + commitment.aggregate.cant) > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {commitment.aggregate.in > 0 && (
              <div style={{ padding: '6px 12px', background: 'var(--free-light)', color: '#1a7a3a', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 700 }}>
                🔥 {commitment.aggregate.in} in
              </div>
            )}
            {commitment.aggregate.probably > 0 && (
              <div style={{ padding: '6px 12px', background: 'var(--maybe-light)', color: '#8a6d10', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 700 }}>
                👀 {commitment.aggregate.probably} probably
              </div>
            )}
            {commitment.aggregate.cant > 0 && (
              <div style={{ padding: '6px 12px', background: '#fef2f2', color: 'var(--error)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 700 }}>
                😔 {commitment.aggregate.cant} can't
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {participants.map((p: any) => {
            const level = commitment?.byParticipant?.[p.id]
            const levelMark = level === 'in' ? '🔥' : level === 'probably' ? '👀' : level === 'cant' ? '😔' : ''
            return (
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
                {levelMark && <span style={{ fontSize: 14 }} title={level}>{levelMark}</span>}
                {p.dietary && <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--surface-dim)', borderRadius: 4, color: 'var(--text-muted)' }}>{p.dietary}</span>}
                {!p.hasResponded && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>pending</span>}
                {isCreator && p.id !== creatorPid && (
                  <button
                    onClick={(e) => { e.stopPropagation(); removeParticipant(p.id) }}
                    style={{ fontSize: 14, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', lineHeight: 1, marginLeft: 2 }}
                  >&times;</button>
                )}
              </div>
            )
          })}
        </div>
        {missing.length > 0 && (
          <button onClick={nudge} style={{ marginTop: 10, width: '100%', padding: 10, fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-display)', color: 'var(--celebrate)', background: '#FFF3EC', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
            {nudgeCopied ? 'Nudge message copied!' : `Nudge ${missing.map((p: any) => p.name).join(', ')}`}
          </button>
        )}

        {/* Soft warning on confirm if fewer than 3 "in" commitments */}
        {commitment && hang.status !== 'confirmed' && commitment.aggregate.in < 3 && responded.length >= 3 && (
          <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--maybe-light)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: '#8a6d10', fontWeight: 500 }}>
            Heads up: only {commitment.aggregate.in} {commitment.aggregate.in === 1 ? 'person is' : 'people are'} a hard yes. You might want to wait for firmer commitments before locking in.
          </div>
        )}
      </div>

      {/* Availability heatmap */}
      {heatmap && dates.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 24, overflowX: 'auto', position: 'relative' }}>
          <div className="label" id={`heatmap-label-${id}`} style={{ marginBottom: 10 }}>Availability heatmap</div>
          <div role="table" aria-labelledby={`heatmap-label-${id}`} style={{ display: 'inline-grid', gridTemplateColumns: `54px repeat(${dates.length}, 48px)`, gap: 2 }}>
            <div role="row" style={{ display: 'contents' }}>
              <div role="columnheader" aria-hidden="true" />
              {dates.map(d => <div key={d} role="columnheader" className="grid-header">{formatDay(d)}</div>)}
            </div>
            {HOURS.map(h => {
              const hourLabel = formatHour(h)
              return (
              <div key={h} role="row" style={{ display: 'contents' }}>
                <div role="rowheader" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6 }}>{hourLabel}</div>
                {dates.map(d => {
                  const key = `${d}|${h}`
                  const cell = heatmap.heatmap[key]
                  const ratio = cell?.ratio || 0
                  const bg = ratio === 0 ? 'var(--surface-dim)' : ratio >= 0.8 ? '#22A85280' : ratio >= 0.5 ? '#34C26A40' : ratio >= 0.25 ? '#F5C84240' : '#E8E3D920'
                  const isHovered = hoverSlot === key
                  const dayObj = new Date(d + 'T00:00:00')
                  const fullDay = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dayObj.getDay()]
                  const cellLabel = cell && cell.total > 0
                    ? `${fullDay} ${hourLabel}: ${cell.total} of ${cell.maxTotal || cell.total} people available`
                    : `${fullDay} ${hourLabel}: no one yet`
                  return (
                    <div
                      key={key}
                      role="cell"
                      aria-label={cellLabel}
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
            )})}
          </div>

          {/* Tooltip */}
          {hoverSlot && heatmap.heatmap[hoverSlot]?.total > 0 && (() => {
            const cell = heatmap.heatmap[hoverSlot]
            const [date, hourStr] = hoverSlot.split('|')
            const hourNum = parseInt(hourStr)
            return (
              <div style={{
                marginTop: 12, padding: '12px 16px',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)',
              }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
                  {formatDay(date)} {formatHour(hourNum)}
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
                {/* Creator force-confirm */}
                {isCreator && hang.status !== 'confirmed' && !isLocked && !isCancelled && (
                  <button
                    onClick={() => forceConfirmSlot(date, hourNum)}
                    style={{
                      marginTop: 10, width: '100%', padding: '8px 12px',
                      background: 'var(--accent)', color: 'var(--accent-text)',
                      border: 'none', borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer', fontSize: 12, fontWeight: 700,
                      fontFamily: 'var(--font-display)',
                    }}
                  >
                    Confirm this slot as host
                  </button>
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
            const hasVotes = (a.ups || 0) + (a.mehs || 0) + (a.downs || 0) > 0
            return (
              <div key={a.id} className="card" style={{ padding: '14px 18px', border: isTopPick ? '2px solid var(--accent)' : '1px solid var(--border-light)', position: 'relative' }}>
                {isTopPick && (
                  <div style={{ position: 'absolute', top: -10, right: 14, display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: 'var(--accent)', borderRadius: 6, fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--accent-text)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z"/></svg>
                    Most Popular
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {a.name}
                    {outdoor && rainWarning && <span style={{ fontSize: 12, color: 'var(--error)' }} title="Rain expected">&#9748;</span>}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {a.cost_estimate && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{a.cost_estimate}</span>}
                    {isCreator && (
                      <button
                        onClick={() => removeActivity(a.id, a.name, hasVotes)}
                        title="Remove activity"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: 0, lineHeight: 1 }}
                      >×</button>
                    )}
                  </span>
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
        {/* Creator: add activity mid-flight */}
        {isCreator && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input
              type="text"
              value={newActivityName}
              onChange={e => setNewActivityName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addActivity()}
              placeholder="Add an activity…"
              maxLength={60}
              className="input"
              style={{ flex: 1, padding: '10px 14px', fontSize: 14 }}
            />
            <input
              type="text"
              value={newActivityCost}
              onChange={e => setNewActivityCost(e.target.value)}
              placeholder="$/person"
              maxLength={40}
              className="input"
              style={{ width: 100, padding: '10px 14px', fontSize: 13, fontFamily: 'var(--font-mono)' }}
            />
            <button onClick={addActivity} className="btn-primary" style={{ width: 'auto', padding: '10px 16px', fontSize: 13 }}>Add</button>
          </div>
        )}
      </div>

      </SectionGroup>

      {/* ════════════ LOGISTICS ════════════ */}
      <SectionGroup title="Logistics" defaultOpen={true}>

      {/* Bring list — supports sub-items + multi-claim */}
      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <div className="label" style={{ marginBottom: 12 }}>Bring list</div>
        {bringList.length === 0 && (
          <div style={{
            padding: '16px 14px', marginBottom: 14, textAlign: 'center',
            background: 'var(--surface-dim)', borderRadius: 'var(--radius-sm)',
            border: '1px dashed var(--border-light)',
            fontSize: 13, color: 'var(--text-muted)',
          }}>
            Nothing on the bring list yet. Add the first thing below.
          </div>
        )}
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

      {/* Transport — visible during planning and after */}
      {true && (
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
          <div style={{
            padding: '14px', marginBottom: 14, textAlign: 'center',
            background: 'var(--surface-dim)', borderRadius: 'var(--radius-sm)',
            border: '1px dashed var(--border-light)',
            fontSize: 13, color: 'var(--text-muted)',
          }}>
            {myPid ? 'Be the first to say something.' : 'No comments yet.'}
          </div>
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
          {photos.length === 0 && (
            <div style={{
              padding: '20px 14px', marginBottom: 14, textAlign: 'center',
              background: 'var(--surface-dim)', borderRadius: 'var(--radius-sm)',
              border: '1px dashed var(--border-light)',
            }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>📸</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                No photos yet. Drop the first one to kick off the recap.
              </div>
            </div>
          )}
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
          onClick={() => { localStorage.removeItem(`hangs_participant_${id}`); localStorage.removeItem(`hangs_${id}`); localStorage.removeItem(`hangs_token_${id}`); window.location.href = `/h/${id}` }}
          style={{ display: 'block', width: '100%', textAlign: 'center', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-body)', marginBottom: 16 }}
        >
          Change your response
        </button>
      )}

      {/* Participant self-leave (only for non-creators who have a token) */}
      {myPid && !isCreator && (
        <button
          onClick={async () => {
            const ok = await showConfirm({
              title: 'Remove yourself from this hang?',
              message: 'Your availability, votes, and comments will be deleted.',
              confirmLabel: 'Remove me',
              danger: true,
            })
            if (!ok) return
            await fetch(`/api/hangs/${id}/participants`, { method: 'DELETE', headers: authHeaders(), body: JSON.stringify({}) })
            localStorage.removeItem(`hangs_participant_${id}`)
            localStorage.removeItem(`hangs_token_${id}`)
            window.location.href = '/'
          }}
          style={{ display: 'block', width: '100%', textAlign: 'center', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-body)', marginBottom: 16 }}
        >
          Remove me from this hang
        </button>
      )}

      {/* Creator delete-hang (permanent) */}
      {isCreator && (
        <button
          onClick={async () => {
            const ok = await showConfirm({
              title: `Delete "${hang.name}"?`,
              message: "Everything — responses, votes, bring list, photos — will be deleted. This can't be undone.",
              confirmLabel: 'Delete forever',
              danger: true,
            })
            if (!ok) return
            const res = await fetch(`/api/hangs/${id}`, { method: 'DELETE', headers: authHeaders() })
            if (res.ok) {
              localStorage.removeItem(`hangs_${id}`)
              localStorage.removeItem(`hangs_participant_${id}`)
              localStorage.removeItem(`hangs_token_${id}`)
              window.location.href = '/'
            }
          }}
          style={{ display: 'block', width: '100%', textAlign: 'center', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--error)', fontFamily: 'var(--font-body)', marginBottom: 16 }}
        >
          Delete this hang
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

      {/* ═══════════ Settings modal (creator only) ═══════════ */}
      {showSettings && isCreator && (
        <div
          onClick={() => setShowSettings(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1001, padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-lg)', padding: 24, maxWidth: 420, width: '100%',
              maxHeight: '85vh', overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800 }}>Host controls</h3>
              <button onClick={() => setShowSettings(false)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--text-muted)', padding: 0, lineHeight: 1 }}>×</button>
            </div>

            {/* Description */}
            <div style={{ marginBottom: 16 }}>
              <label className="label" style={{ display: 'block', marginBottom: 6 }}>Description</label>
              <textarea
                value={editingField === 'description' ? editValue : (hang.description || '')}
                onChange={e => { setEditingField('description'); setEditValue(e.target.value.slice(0, 300)) }}
                onBlur={() => { if (editingField === 'description') patchField('description', editValue) }}
                placeholder="What's the vibe?"
                rows={2}
                className="input"
                style={{ resize: 'vertical', fontSize: 14 }}
              />
            </div>

            {/* Theme + dress code */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label className="label" style={{ display: 'block', marginBottom: 6 }}>Theme</label>
                <input
                  type="text"
                  defaultValue={hang.theme || ''}
                  onBlur={e => { if (e.target.value !== (hang.theme || '')) patchField('theme', e.target.value) }}
                  maxLength={60}
                  className="input"
                  style={{ fontSize: 14 }}
                />
              </div>
              <div>
                <label className="label" style={{ display: 'block', marginBottom: 6 }}>Dress code</label>
                <input
                  type="text"
                  defaultValue={hang.dress_code || ''}
                  onBlur={e => { if (e.target.value !== (hang.dress_code || '')) patchField('dressCode', e.target.value) }}
                  maxLength={60}
                  className="input"
                  style={{ fontSize: 14 }}
                />
              </div>
            </div>

            {/* Location */}
            <div style={{ marginBottom: 16 }}>
              <label className="label" style={{ display: 'block', marginBottom: 6 }}>Location</label>
              <input
                type="text"
                defaultValue={hang.location || ''}
                onBlur={e => { if (e.target.value !== (hang.location || '')) patchField('location', e.target.value) }}
                maxLength={200}
                className="input"
                style={{ fontSize: 14 }}
              />
            </div>

            {/* Response deadline */}
            <div style={{ marginBottom: 16 }}>
              <label className="label" style={{ display: 'block', marginBottom: 6 }}>Response deadline</label>
              <input
                type="date"
                defaultValue={hang.response_deadline || ''}
                onBlur={e => { if (e.target.value !== (hang.response_deadline || '')) patchField('responseDeadline', e.target.value) }}
                className="input"
                style={{ fontSize: 14 }}
              />
            </div>

            {/* Lock/unlock toggle */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16, paddingTop: 16, borderTop: '1px solid var(--border-light)' }}>
              <div className="label" style={{ marginBottom: 4 }}>Response state</div>
              {!isLocked ? (
                <button
                  onClick={() => settingsAction('lock')}
                  className="btn-secondary"
                  style={{ width: '100%', fontSize: 13 }}
                >
                  Lock responses (freeze the grid)
                </button>
              ) : (
                <button
                  onClick={() => settingsAction('unlock')}
                  className="btn-secondary"
                  style={{ width: '100%', fontSize: 13, color: 'var(--success)', borderColor: 'var(--success)' }}
                >
                  Unlock responses
                </button>
              )}
              {!isCancelled ? (
                <button
                  onClick={async () => {
                    const ok = await showConfirm({
                      title: 'Cancel this hang?',
                      message: 'Data stays but no one can respond. You can uncancel later.',
                      confirmLabel: 'Cancel hang',
                      danger: true,
                    })
                    if (ok) settingsAction('cancel')
                  }}
                  style={{ width: '100%', padding: 12, fontSize: 13, fontWeight: 600, color: 'var(--error)', background: '#fef2f2', border: '1px solid var(--error)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'var(--font-display)' }}
                >
                  Cancel hang
                </button>
              ) : (
                <button
                  onClick={() => settingsAction('uncancel')}
                  className="btn-secondary"
                  style={{ width: '100%', fontSize: 13, color: 'var(--success)', borderColor: 'var(--success)' }}
                >
                  Uncancel
                </button>
              )}
            </div>

            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
              Changes save automatically when you tap out of each field.
            </div>
          </div>
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
  return dates.slice(0, 31) // allow up to 31 days; was capped at 7
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

// Dismissible CTA shown to responders on crew hangs with a public invite link.
// "Liked this crew? Save it and your next response is 10 seconds."
// Uses localStorage to not re-show once dismissed for this crew.
function GuestCrewConvertCTA({ crewName, crewEmoji, joinHref }: {
  crewName: string
  crewEmoji: string | null
  joinHref: string
}) {
  const [hidden, setHidden] = useState(true)
  const [crewSlug] = useState(() => {
    try { return joinHref.split('/c/')[1]?.split('/')[0] || '' } catch { return '' }
  })
  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(`hangs_crew_cta_dismissed_${crewSlug}`)
      if (!dismissed) setHidden(false)
    } catch { setHidden(false) }
  }, [crewSlug])
  const dismiss = () => {
    try { localStorage.setItem(`hangs_crew_cta_dismissed_${crewSlug}`, '1') } catch { /* ignore */ }
    setHidden(true)
  }
  if (hidden) return null
  return (
    <div style={{
      padding: '14px 16px', marginBottom: 16,
      background: 'var(--surface)', border: '1.5px solid var(--accent)', borderRadius: 12,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        {crewEmoji && <div style={{ fontSize: 22 }}>{crewEmoji}</div>}
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Liked planning with {crewName}?</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Join the crew — next time is 10 seconds.
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <a
          href={joinHref}
          style={{
            fontSize: 12, fontWeight: 700, padding: '8px 12px', borderRadius: 6,
            background: 'var(--accent)', color: 'var(--accent-text)', textDecoration: 'none', whiteSpace: 'nowrap',
          }}
        >
          Join →
        </a>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          style={{
            fontSize: 18, padding: '4px 8px', background: 'none', border: 'none',
            color: 'var(--text-muted)', cursor: 'pointer',
          }}
        >
          ×
        </button>
      </div>
    </div>
  )
}
