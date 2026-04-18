// /crews/[id] — main crew page: upcoming hangs, members, past history.

"use client"
import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import NotificationBell from '@/components/NotificationBell'

type Member = {
  userId: string
  email: string
  displayName: string
  role: 'exec' | 'member'
  dietary: string | null
  transportPreference: string | null
  joinedAt: string
}

type HangRow = {
  id: string
  name: string
  status: string | null
  confirmed_date: string | null
  confirmed_hour: number | null
  confirmed_activity: string | null
  date_range_start: string
  date_range_end: string
  location: string | null
  created_at: string
}

type CrewState = {
  crew: {
    id: string; name: string; slug: string; description: string | null; createdBy: string
    recurringRule: string | null
    recurringTemplateHangId: string | null
    coverColor: string | null
    coverEmoji: string | null
    publicInviteToken: string | null
  }
  stats: {
    hangsThisMonth: number
    avgAttendance: number | null
    myStreak: number
  }
  myRole: 'exec' | 'member'
  myProfile: {
    userId: string
    displayName: string
    dietary: string | null
    transportPreference: string | null
    contactPhone: string | null
  } | null
  members: Member[]
  upcomingHangs: HangRow[]
  pastHangs: HangRow[]
}

export default function CrewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [state, setState] = useState<CrewState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteText, setInviteText] = useState('')
  const [inviteBusy, setInviteBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const res = await fetch(`/api/crews/${id}/state`)
      if (res.status === 401) { router.replace(`/login?redirect=/crews/${id}`); return }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(`HTTP ${res.status}: ${body.error || 'unknown error'}`)
        return
      }
      const data = await res.json()
      if (!cancelled) setState(data)
    }
    load()
    return () => { cancelled = true }
  }, [id, router])

  async function handleInvite() {
    const emails = inviteText
      .split(/[\s,;\n]+/)
      .map(s => s.trim().toLowerCase())
      .filter(s => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s))
    if (!emails.length) return
    setInviteBusy(true)
    try {
      const res = await fetch(`/api/crews/${id}/members`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ emails }),
      })
      if (!res.ok) throw new Error('invite failed')
      setInviteText('')
      setShowInvite(false)
      // refresh
      const r = await fetch(`/api/crews/${id}/state`)
      if (r.ok) setState(await r.json())
    } catch (e) {
      console.error(e)
    } finally {
      setInviteBusy(false)
    }
  }

  if (error) return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '64px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>·</div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
        {error.includes('404') ? 'Crew not found' : error.includes('403') ? 'Not in this crew' : 'Couldn\'t load'}
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 20 }}>
        {error.includes('404')
          ? 'This crew might have been renamed or deleted.'
          : error.includes('403')
            ? 'Ask an exec for an invite link, or sign in with the right account.'
            : 'Something went wrong — try again in a moment.'}
      </p>
      <Link href="/crews" className="btn-primary" style={{ padding: '12px 20px', fontSize: 14, display: 'inline-block' }}>
        ← All crews
      </Link>
    </div>
  )
  if (!state) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>

  const needsProfile = !state.myProfile?.dietary && !state.myProfile?.transportPreference

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 20px 48px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/crews" style={{ fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none' }}>← All crews</Link>
        <NotificationBell />
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {(state.crew.coverColor || state.crew.coverEmoji) && (
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: state.crew.coverColor || 'var(--maybe-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, flexShrink: 0,
              }}>
                {state.crew.coverEmoji || '·'}
              </div>
            )}
            <div>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', margin: 0 }}>
                {state.crew.name}
              </h1>
              {state.crew.description && (
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {state.crew.description}
                </div>
              )}
            </div>
          </div>
          <Link
            href={`/crews/${id}/profile`}
            style={{
              fontSize: 12, fontWeight: 600, padding: '6px 10px',
              borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border-light)',
              textDecoration: 'none', color: 'inherit', whiteSpace: 'nowrap',
            }}
          >
            Your profile
          </Link>
        </div>
      </motion.div>

      {needsProfile && (
        <Link
          href={`/crews/${id}/profile`}
          style={{
            display: 'block', marginTop: 20, padding: '12px 14px',
            background: 'var(--maybe-light)', borderRadius: 10,
            fontSize: 13, color: 'var(--text-primary)', textDecoration: 'none',
            border: '1px solid #F5C842',
          }}
        >
          <strong>Finish your profile →</strong> add dietary + transport so future hangs auto-fill for you.
        </Link>
      )}

      {/* New hang CTA */}
      <Link
        href={`/create?crewId=${id}&crewName=${encodeURIComponent(state.crew.name)}`}
        className="btn-primary"
        style={{ display: 'block', textAlign: 'center', padding: 14, fontSize: 15, marginTop: 20, textDecoration: 'none' }}
      >
        + Plan a new hang
      </Link>

      {/* Stats strip — visible proof the crew has momentum */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 20 }}>
        <StatTile label="This month" value={`${state.stats.hangsThisMonth}`} sub={state.stats.hangsThisMonth === 1 ? 'hang' : 'hangs'} />
        <StatTile
          label="Avg turnout"
          value={state.stats.avgAttendance == null ? '—' : `${Math.round(state.stats.avgAttendance * 100)}%`}
          sub="last 6 hangs"
        />
        <StatTile label="Your streak" value={`${state.stats.myStreak}`} sub={state.stats.myStreak === 1 ? 'in a row' : 'in a row'} />
      </div>

      {/* Upcoming */}
      <Section title="Upcoming">
        {state.upcomingHangs.length === 0 ? (
          <Empty>No hangs planned yet. Tap the button above to start one.</Empty>
        ) : (
          <List>
            {state.upcomingHangs.map(h => <HangItem key={h.id} hang={h} />)}
          </List>
        )}
      </Section>

      {/* Members */}
      <Section
        title={`Members (${state.members.length})`}
        cta={state.myRole === 'exec' ? (
          <button
            onClick={() => setShowInvite(v => !v)}
            style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            {showInvite ? 'Cancel' : '+ Invite'}
          </button>
        ) : null}
      >
        {showInvite && (
          <div style={{ marginBottom: 12, padding: 12, background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: 10 }}>
            <textarea
              value={inviteText}
              onChange={e => setInviteText(e.target.value)}
              placeholder="email addresses, one per line or comma-separated"
              rows={3}
              style={{
                width: '100%', padding: 10, fontSize: 13, borderRadius: 8,
                border: '1px solid var(--border-light)', resize: 'vertical',
                fontFamily: 'var(--font-mono), monospace',
              }}
            />
            <button
              onClick={handleInvite}
              disabled={inviteBusy}
              className="btn-primary"
              style={{ padding: '8px 14px', fontSize: 13, marginTop: 8 }}
            >
              {inviteBusy ? 'Sending…' : 'Send invites'}
            </button>
          </div>
        )}
        <List>
          {state.members.map(m => (
            <div key={m.userId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-light)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{m.displayName}</span>
                  {m.role === 'exec' && (
                    <span style={{ fontSize: 9, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--accent)', background: 'var(--maybe-light)', padding: '1px 5px', borderRadius: 3, textTransform: 'uppercase' }}>exec</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {[m.dietary, m.transportPreference].filter(Boolean).join(' · ') || m.email}
                </div>
              </div>
            </div>
          ))}
        </List>
      </Section>

      {/* Recurring schedule (exec-only) */}
      {state.myRole === 'exec' && (
        <RecurringSection
          crewId={id}
          currentRule={state.crew.recurringRule}
          currentTemplateId={state.crew.recurringTemplateHangId}
          candidateHangs={[...state.upcomingHangs, ...state.pastHangs].slice(0, 20)}
          onSaved={async () => {
            const r = await fetch(`/api/crews/${id}/state`)
            if (r.ok) setState(await r.json())
          }}
        />
      )}

      {/* Crew branding (exec-only) */}
      {state.myRole === 'exec' && (
        <BrandingSection
          crewId={id}
          color={state.crew.coverColor}
          emoji={state.crew.coverEmoji}
          onSaved={async () => {
            const r = await fetch(`/api/crews/${id}/state`)
            if (r.ok) setState(await r.json())
          }}
        />
      )}

      {/* Public invite link (exec-only) */}
      {state.myRole === 'exec' && (
        <InviteLinkSection
          crewId={id}
          slug={state.crew.slug}
          token={state.crew.publicInviteToken}
          onChange={async () => {
            const r = await fetch(`/api/crews/${id}/state`)
            if (r.ok) setState(await r.json())
          }}
        />
      )}

      {/* Past */}
      {state.pastHangs.length > 0 && (
        <Section title="Past">
          <List>
            {state.pastHangs.slice(0, 10).map(h => (
              <PastHangItem key={h.id} hang={h} onCloned={nid => router.push(`/h/${nid}`)} />
            ))}
          </List>
        </Section>
      )}
    </div>
  )
}

function RecurringSection({
  crewId, currentRule, currentTemplateId, candidateHangs, onSaved,
}: {
  crewId: string
  currentRule: string | null
  currentTemplateId: string | null
  candidateHangs: HangRow[]
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [cadence, setCadence] = useState<'weekly' | 'biweekly'>('weekly')
  const [dow, setDow] = useState<string>('thu')
  const [hour, setHour] = useState<number>(19)
  const [templateId, setTemplateId] = useState<string>(currentTemplateId || candidateHangs[0]?.id || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (currentRule) {
      const m = currentRule.match(/^(weekly|biweekly):([a-z]{3}):(\d{1,2})$/)
      if (m) { setCadence(m[1] as 'weekly' | 'biweekly'); setDow(m[2]); setHour(parseInt(m[3])) }
    }
    if (currentTemplateId) setTemplateId(currentTemplateId)
  }, [currentRule, currentTemplateId])

  async function save(clear: boolean) {
    setSaving(true)
    try {
      await fetch(`/api/crews/${crewId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(clear
          ? { recurringRule: '', recurringTemplateHangId: '' }
          : { recurringRule: `${cadence}:${dow}:${hour}`, recurringTemplateHangId: templateId }),
      })
      setEditing(false)
      onSaved()
    } finally { setSaving(false) }
  }

  const dowLabels: Record<string, string> = {
    mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
  }
  const fmtHour = (h: number) => h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`

  return (
    <div style={{ marginTop: 28 }}>
      <div className="label" style={{ marginBottom: 10 }}>Recurring schedule</div>
      {!editing && (
        <div style={{
          padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border-light)',
          borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ fontSize: 13, color: currentRule ? 'var(--text-primary)' : 'var(--text-muted)' }}>
            {currentRule
              ? <>📅 <strong>{cadence === 'weekly' ? 'Every' : 'Every other'} {dowLabels[dow] || dow}, {fmtHour(hour)}</strong> — auto-created 7 days ahead.</>
              : 'No recurring schedule. Set one to auto-generate hangs weekly/biweekly.'
            }
          </div>
          <button
            onClick={() => setEditing(true)}
            style={{ fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 6, background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', cursor: 'pointer' }}
          >
            {currentRule ? 'Edit' : 'Set up'}
          </button>
        </div>
      )}
      {editing && (
        <div style={{
          padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border-light)',
          borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {candidateHangs.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--error)' }}>
              Create at least one hang first — the cron clones it each week.
            </div>
          )}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Template hang</span>
            <select value={templateId} onChange={e => setTemplateId(e.target.value)} style={selectStyle} disabled={candidateHangs.length === 0}>
              {candidateHangs.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Cadence</span>
              <select value={cadence} onChange={e => setCadence(e.target.value as 'weekly' | 'biweekly')} style={selectStyle}>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
              </select>
            </label>
            <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Day</span>
              <select value={dow} onChange={e => setDow(e.target.value)} style={selectStyle}>
                {Object.entries(dowLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Hour</span>
              <select value={hour} onChange={e => setHour(parseInt(e.target.value))} style={selectStyle}>
                {Array.from({ length: 24 }, (_, h) => h).map(h => <option key={h} value={h}>{fmtHour(h)}</option>)}
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              style={{ flex: 1, padding: 10, background: 'none', border: '1.5px solid var(--border-light)', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
            >
              Cancel
            </button>
            {currentRule && (
              <button
                onClick={() => save(true)}
                disabled={saving}
                style={{ padding: 10, background: 'none', border: '1.5px solid var(--error)', borderRadius: 8, fontSize: 13, color: 'var(--error)', cursor: 'pointer' }}
              >
                Clear
              </button>
            )}
            <button
              onClick={() => save(false)}
              disabled={saving || !templateId}
              className="btn-primary"
              style={{ flex: 2, padding: 10, fontSize: 13, opacity: saving ? 0.6 : 1 }}
            >
              {saving ? 'Saving…' : 'Save schedule'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  padding: '8px 10px', fontSize: 13, borderRadius: 8,
  border: '1.5px solid var(--border-light)', background: 'var(--surface)',
  fontFamily: 'inherit',
}

function InviteLinkSection({
  crewId, slug, token, onChange,
}: {
  crewId: string
  slug: string
  token: string | null
  onChange: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const inviteUrl = token && typeof window !== 'undefined'
    ? `${window.location.origin}/c/${slug}/join?token=${token}`
    : null

  async function generate() {
    setBusy(true)
    try {
      await fetch(`/api/crews/${crewId}/invite-link`, { method: 'POST' })
      onChange()
    } finally { setBusy(false) }
  }
  async function revoke() {
    setBusy(true)
    try {
      await fetch(`/api/crews/${crewId}/invite-link`, { method: 'DELETE' })
      onChange()
    } finally { setBusy(false) }
  }
  async function copy() {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch { /* ignore */ }
  }

  return (
    <div style={{ marginTop: 20 }}>
      <div className="label" style={{ marginBottom: 10 }}>Public invite link</div>
      <div style={{
        padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border-light)',
        borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {!token && (
          <>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Generate a shareable link. Anyone with the link can join the crew.
              Rotate anytime to revoke old shares.
            </div>
            <button
              onClick={generate}
              disabled={busy}
              className="btn-primary"
              style={{ padding: 10, fontSize: 13, alignSelf: 'flex-start' }}
            >
              {busy ? 'Generating…' : '+ Generate invite link'}
            </button>
          </>
        )}
        {token && inviteUrl && (
          <>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, wordBreak: 'break-all',
              padding: '8px 10px', background: 'var(--surface-dim)', borderRadius: 6,
              color: 'var(--text-secondary)',
            }}>
              {inviteUrl}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={copy}
                style={{ flex: 1, padding: 10, background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                {copied ? '✓ Copied' : 'Copy link'}
              </button>
              <button
                onClick={generate}
                disabled={busy}
                style={{ padding: 10, background: 'none', border: '1.5px solid var(--border-light)', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
              >
                Rotate
              </button>
              <button
                onClick={revoke}
                disabled={busy}
                style={{ padding: 10, background: 'none', border: '1.5px solid var(--error)', borderRadius: 8, fontSize: 13, color: 'var(--error)', cursor: 'pointer' }}
              >
                Revoke
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const BRAND_COLORS = [
  '#F5C842', '#34C26A', '#6CBEF0', '#EF8A5B',
  '#C88AF0', '#F59FC2', '#7D8D9A', '#1A1A1A',
]

function BrandingSection({
  crewId, color, emoji, onSaved,
}: {
  crewId: string
  color: string | null
  emoji: string | null
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draftColor, setDraftColor] = useState(color || BRAND_COLORS[0])
  const [draftEmoji, setDraftEmoji] = useState(emoji || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraftColor(color || BRAND_COLORS[0])
    setDraftEmoji(emoji || '')
  }, [color, emoji])

  async function save() {
    setSaving(true)
    try {
      await fetch(`/api/crews/${crewId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          coverColor: draftColor,
          coverEmoji: draftEmoji.trim().slice(0, 4),
        }),
      })
      setEditing(false)
      onSaved()
    } finally { setSaving(false) }
  }

  return (
    <div style={{ marginTop: 20 }}>
      <div className="label" style={{ marginBottom: 10 }}>Crew branding</div>
      {!editing && (
        <div style={{
          padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border-light)',
          borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: color || '#F2EFE8',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16,
            }}>
              {emoji || '·'}
            </div>
            <span>Appears on crew pages, invites, and share cards.</span>
          </div>
          <button
            onClick={() => setEditing(true)}
            style={{ fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 6, background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', cursor: 'pointer' }}
          >
            Edit
          </button>
        </div>
      )}
      {editing && (
        <div style={{
          padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border-light)',
          borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Color</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {BRAND_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setDraftColor(c)}
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: c,
                    border: draftColor === c ? '3px solid var(--text-primary)' : '3px solid transparent',
                    cursor: 'pointer', padding: 0,
                  }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Emoji (optional, 1-2 chars)</span>
            <input
              value={draftEmoji}
              onChange={e => setDraftEmoji(e.target.value)}
              placeholder="🧗"
              maxLength={4}
              style={{
                padding: '10px 12px', fontSize: 24, borderRadius: 8,
                border: '1.5px solid var(--border-light)', background: 'var(--surface)',
                width: 80, textAlign: 'center',
              }}
            />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              style={{ flex: 1, padding: 10, background: 'none', border: '1.5px solid var(--border-light)', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="btn-primary"
              style={{ flex: 2, padding: 10, fontSize: 13, opacity: saving ? 0.6 : 1 }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function PastHangItem({ hang, onCloned }: { hang: HangRow; onCloned: (id: string) => void }) {
  const [cloning, setCloning] = useState(false)
  async function clone(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (cloning) return
    setCloning(true)
    try {
      const res = await fetch(`/api/hangs/${hang.id}/clone`, { method: 'POST' })
      if (!res.ok) throw new Error('clone failed')
      const { id, creatorId, creatorToken } = await res.json()
      // Save the creator token so the new hang's edit/share UX works
      if (creatorId) localStorage.setItem(`hangs_${id}`, creatorId)
      if (creatorToken) localStorage.setItem(`hangs_token_${id}`, creatorToken)
      if (creatorId) localStorage.setItem(`hangs_participant_${id}`, creatorId)
      onCloned(id)
    } catch (err) {
      console.error(err)
      setCloning(false)
    }
  }

  const when = hang.confirmed_date
    ? `${hang.confirmed_date}${hang.confirmed_hour != null ? `, ${fmtHour(hang.confirmed_hour)}` : ''}`
    : `${hang.date_range_start} → ${hang.date_range_end}`

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      padding: '12px 0', borderBottom: '1px solid var(--border-light)', opacity: 0.85,
    }}>
      <Link href={`/h/${hang.id}/results`} style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{hang.name}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{when}</div>
      </Link>
      <button
        onClick={clone}
        disabled={cloning}
        style={{
          fontSize: 11, fontWeight: 700, padding: '6px 10px', borderRadius: 6,
          background: 'var(--accent)', color: 'var(--accent-text)', border: 'none',
          cursor: cloning ? 'default' : 'pointer', whiteSpace: 'nowrap',
          opacity: cloning ? 0.6 : 1,
        }}
      >
        {cloning ? '…' : '↻ Plan again'}
      </button>
    </div>
  )
}

function StatTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{
      padding: '12px 10px',
      background: 'var(--surface)',
      border: '1px solid var(--border-light)',
      borderRadius: 12,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800, margin: '4px 0 2px' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>
    </div>
  )
}

function Section({ title, children, cta }: { title: string; children: React.ReactNode; cta?: React.ReactNode }) {
  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="label">{title}</div>
        {cta}
      </div>
      {children}
    </div>
  )
}

function List({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column' }}>{children}</div>
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '16px 14px', fontSize: 13, color: 'var(--text-muted)', background: 'var(--surface)', border: '1px dashed var(--border-light)', borderRadius: 10 }}>
      {children}
    </div>
  )
}

function HangItem({ hang, past }: { hang: HangRow; past?: boolean }) {
  const when = hang.confirmed_date
    ? `${hang.confirmed_date}${hang.confirmed_hour != null ? `, ${fmtHour(hang.confirmed_hour)}` : ''}`
    : `${hang.date_range_start} → ${hang.date_range_end}`
  return (
    <Link
      href={`/h/${hang.id}/results`}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 0', borderBottom: '1px solid var(--border-light)',
        textDecoration: 'none', color: 'inherit', opacity: past ? 0.7 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{hang.name}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{when}</div>
      </div>
      <div style={{
        fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
        padding: '3px 8px', borderRadius: 4,
        background: hang.status === 'confirmed' ? 'var(--free-light)' : 'var(--surface-dim)',
        color: hang.status === 'confirmed' ? 'var(--success, #1a7a3a)' : 'var(--text-muted)',
      }}>
        {hang.status === 'confirmed' ? 'Confirmed' : past ? 'Done' : 'Planning'}
      </div>
    </Link>
  )
}

function fmtHour(h: number): string {
  if (h === 0) return '12am'
  if (h < 12) return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
}
