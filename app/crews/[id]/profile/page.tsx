// /crews/[id]/profile — self-edit my profile within a crew.
// Fields: displayName, dietary, transportPreference, contactPhone.
// These are the fields that save time on every future hang.

"use client"
import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'

const TRANSPORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'none', label: 'No preference' },
  { value: 'driving', label: "I drive, can take others" },
  { value: 'need_ride', label: 'Need a ride' },
  { value: 'own_way', label: 'Making my own way' },
  { value: 'passenger', label: 'Happy to be a passenger' },
]

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const GRID_HOURS = Array.from({ length: 14 }, (_, i) => i + 8) // 8am → 9pm

export default function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: crewId } = use(params)
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [crewName, setCrewName] = useState('')
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [dietary, setDietary] = useState('')
  const [transport, setTransport] = useState('none')
  const [phone, setPhone] = useState('')
  const [shape, setShape] = useState<Record<string, 'free' | 'maybe' | 'busy'>>({})
  const [status, setStatus] = useState<null | 'saved' | 'error'>(null)

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/crews/${crewId}/state`)
      if (res.status === 401) { router.replace(`/login?redirect=/crews/${crewId}/profile`); return }
      if (!res.ok) { setLoading(false); return }
      const d = await res.json()
      setCrewName(d.crew.name)
      setMyUserId(d.myProfile?.userId || null)
      setDisplayName(d.myProfile?.displayName || '')
      setDietary(d.myProfile?.dietary || '')
      setTransport(d.myProfile?.transportPreference || 'none')
      setPhone(d.myProfile?.contactPhone || '')
      setShape(d.myProfile?.availabilityShape || {})
      setLoading(false)
    })()
  }, [crewId, router])

  function toggleShapeCell(day: string, hour: number) {
    const key = `${day}|${hour}`
    setShape(prev => {
      const cur = prev[key] || 'busy'
      const next = cur === 'busy' ? 'free' : cur === 'free' ? 'maybe' : 'busy'
      const updated = { ...prev }
      if (next === 'busy') delete updated[key]
      else updated[key] = next
      return updated
    })
  }

  async function handleSave() {
    if (!myUserId) return
    setSaving(true)
    setStatus(null)
    try {
      const res = await fetch(`/api/crews/${crewId}/members/${myUserId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim() || undefined,
          dietary,
          transportPreference: transport,
          contactPhone: phone,
          availabilityShape: shape,
        }),
      })
      if (!res.ok) throw new Error('save failed')
      setStatus('saved')
    } catch {
      setStatus('error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 20px 48px' }}>
      <Link href={`/crews/${crewId}`} style={{ fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none' }}>
        ← {crewName}
      </Link>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 8 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, letterSpacing: '-0.04em', margin: '8px 0 6px' }}>
          Your profile
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 24px' }}>
          Fill this once — every future {crewName} hang will pre-fill from it.
        </p>
      </motion.div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Display name">
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="How you appear to the crew"
            style={inputStyle}
          />
        </Field>

        <Field label="Dietary (optional)">
          <input
            value={dietary}
            onChange={e => setDietary(e.target.value)}
            placeholder="e.g. vegetarian, no nuts, lactose-free"
            style={inputStyle}
          />
        </Field>

        <Field label="Transport preference">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {TRANSPORT_OPTIONS.map(opt => (
              <label key={opt.value} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                borderRadius: 8, cursor: 'pointer',
                background: transport === opt.value ? 'var(--maybe-light)' : 'var(--surface)',
                border: `1.5px solid ${transport === opt.value ? '#F5C842' : 'var(--border-light)'}`,
              }}>
                <input
                  type="radio"
                  name="transport"
                  value={opt.value}
                  checked={transport === opt.value}
                  onChange={() => setTransport(opt.value)}
                />
                <span style={{ fontSize: 14 }}>{opt.label}</span>
              </label>
            ))}
          </div>
        </Field>

        <Field label="Phone (optional, shared with crew)">
          <input
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+61 4…"
            style={inputStyle}
          />
        </Field>

        <Field label="My typical availability (tap to paint free / maybe)">
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.4 }}>
            When are you usually free? On a new hang, tap &quot;Use my usual&quot; and this pattern is applied to the hang dates.
          </div>
          <ShapeGrid shape={shape} onToggle={toggleShapeCell} />
        </Field>

        {status === 'saved' && (
          <div style={{ fontSize: 13, color: 'var(--success, #1a7a3a)', padding: '4px 2px' }}>Saved ✓</div>
        )}
        {status === 'error' && (
          <div style={{ fontSize: 13, color: 'var(--error)', padding: '4px 2px' }}>Couldn&apos;t save — try again</div>
        )}

        <button
          onClick={handleSave}
          disabled={saving || !myUserId}
          className="btn-primary"
          style={{ padding: 14, fontSize: 15, opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '12px 14px',
  fontSize: 15,
  borderRadius: 10,
  border: '1.5px solid var(--border-light)',
  background: 'var(--surface)',
  width: '100%',
  boxSizing: 'border-box',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
      {children}
    </label>
  )
}

function ShapeGrid({ shape, onToggle }: {
  shape: Record<string, 'free' | 'maybe' | 'busy'>
  onToggle: (day: string, hour: number) => void
}) {
  function cellColor(status: string | undefined) {
    if (status === 'free') return { bg: '#34C26A', border: '#2AA359' }
    if (status === 'maybe') return { bg: '#F5C842', border: '#DAA816' }
    return { bg: '#F2EFE8', border: '#E8E3D9' }
  }
  const fmtHour = (h: number) => h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`
  return (
    <div style={{ display: 'inline-grid', gridTemplateColumns: `28px repeat(${DAYS.length}, 1fr)`, gap: 2, width: '100%' }}>
      <div />
      {DAYS.map(d => (
        <div key={d} style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', textAlign: 'center', color: 'var(--text-muted)', padding: '2px 0' }}>
          {d}
        </div>
      ))}
      {GRID_HOURS.map(h => (
        <div key={h} style={{ display: 'contents' }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 3 }}>
            {fmtHour(h)}
          </div>
          {DAYS.map(d => {
            const key = `${d}|${h}`
            const c = cellColor(shape[key])
            return (
              <button
                key={key}
                type="button"
                onClick={() => onToggle(d, h)}
                style={{
                  height: 22, padding: 0,
                  background: c.bg, border: `1px solid ${c.border}`,
                  borderRadius: 4, cursor: 'pointer',
                  minWidth: 0,
                }}
                aria-label={`${d} ${h}:00 ${shape[key] || 'busy'}`}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}
