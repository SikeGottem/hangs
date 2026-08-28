// Crew profile defaults — reusable member details and weekly availability.
'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import product from '@/app/product.module.css'
import styles from './profile.module.css'

const TRANSPORT_OPTIONS = [
  { value: 'none', label: 'No preference' }, { value: 'driving', label: 'I drive, can take others' }, { value: 'need_ride', label: 'Need a ride' }, { value: 'own_way', label: 'Making my own way' }, { value: 'passenger', label: 'Happy to be a passenger' },
]
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const GRID_HOURS = Array.from({ length: 14 }, (_, index) => index + 8)
type Shape = Record<string, 'free' | 'maybe' | 'busy'>

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
  const [shape, setShape] = useState<Shape>({})
  const [status, setStatus] = useState<null | 'saved' | 'error'>(null)

  useEffect(() => { (async () => {
    const res = await fetch(`/api/crews/${crewId}/state`)
    if (res.status === 401) { router.replace(`/login?redirect=/crews/${crewId}/profile`); return }
    if (!res.ok) { setLoading(false); return }
    const data = await res.json()
    setCrewName(data.crew.name); setMyUserId(data.myProfile?.userId || null); setDisplayName(data.myProfile?.displayName || '')
    setDietary(data.myProfile?.dietary || ''); setTransport(data.myProfile?.transportPreference || 'none'); setPhone(data.myProfile?.contactPhone || ''); setShape(data.myProfile?.availabilityShape || {}); setLoading(false)
  })() }, [crewId, router])

  function toggleShapeCell(day: string, hour: number) {
    const key = `${day}|${hour}`
    setShape(previous => { const current = previous[key] || 'busy'; const next = current === 'busy' ? 'free' : current === 'free' ? 'maybe' : 'busy'; const updated = { ...previous }; if (next === 'busy') delete updated[key]; else updated[key] = next; return updated })
  }
  async function handleSave() {
    if (!myUserId) return
    setSaving(true); setStatus(null)
    try {
      const res = await fetch(`/api/crews/${crewId}/members/${myUserId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName: displayName.trim() || undefined, dietary, transportPreference: transport, contactPhone: phone, availabilityShape: shape }) })
      if (!res.ok) throw new Error('save failed'); setStatus('saved')
    } catch { setStatus('error') } finally { setSaving(false) }
  }
  if (loading) return <div className={product.statusPage}>Loading…</div>

  return <div className={product.pageNarrow}>
    <Link href={`/crews/${crewId}`} className={product.backLink}>← {crewName || 'Back to crew'}</Link>
    <header className={styles.header}><span className={product.eyebrow}>Your reusable defaults</span><h1 className={product.title}>Save the things you do not want to repeat.</h1><p className={product.lede}>When {crewName || 'your crew'} starts a new hang, your name, needs, transport, and usual rhythm are ready to use.</p></header>
    <div className={product.form}>
      <section className={styles.section} aria-labelledby="identity-heading"><h2 id="identity-heading" className={product.sectionTitle}>The basics</h2>
        <label className={product.field}><span className={product.fieldLabel}>Display name</span><input className={product.control} value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="How you appear to the crew" /></label>
        <label className={product.field}><span className={product.fieldLabel}>Dietary <em>(optional)</em></span><input className={product.control} value={dietary} onChange={event => setDietary(event.target.value)} placeholder="e.g. vegetarian, no nuts, lactose-free" /></label>
        <label className={product.field}><span className={product.fieldLabel}>Phone <em>(optional · shared with crew)</em></span><input className={product.control} value={phone} onChange={event => setPhone(event.target.value)} placeholder="+61 4…" /></label>
      </section>
      <section className={styles.section} aria-labelledby="transport-heading"><h2 id="transport-heading" className={product.sectionTitle}>Getting there</h2><div className={product.radioList}>{TRANSPORT_OPTIONS.map(option => <label key={option.value} className={product.radioRow} data-selected={transport === option.value}><input type="radio" name="transport" value={option.value} checked={transport === option.value} onChange={() => setTransport(option.value)} /><span>{option.label}</span></label>)}</div></section>
      <section className={styles.section} aria-labelledby="availability-heading"><div className={styles.availabilityTitle}><div><h2 id="availability-heading" className={product.sectionTitle}>Your usual rhythm</h2><p>Tap a block to cycle through <strong>free</strong>, <strong>maybe</strong>, and <strong>busy</strong>. These defaults can be applied to new hangs.</p></div><div className={styles.legend} aria-label="Availability key"><span data-state="free">Free</span><span data-state="maybe">Maybe</span><span data-state="busy">Busy</span></div></div><ShapeGrid shape={shape} onToggle={toggleShapeCell} /></section>
      {status === 'saved' && <div className={product.success} role="status">Saved — your defaults are ready for the next hang.</div>}
      {status === 'error' && <div className={product.error} role="alert">Couldn&apos;t save your defaults. Try again.</div>}
      <button onClick={handleSave} disabled={saving || !myUserId} className="btn-primary">{saving ? 'Saving…' : 'Save defaults'}</button>
    </div>
  </div>
}

function ShapeGrid({ shape, onToggle }: { shape: Shape; onToggle: (day: string, hour: number) => void }) {
  const formatHour = (hour: number) => hour < 12 ? `${hour}a` : hour === 12 ? '12p' : `${hour - 12}p`
  return <div className={styles.gridWrap}><div className={styles.grid} role="grid" aria-label="Typical availability, Monday through Sunday, 8am through 9pm"><div /><>{DAYS.map(day => <div key={day} className={styles.day}>{day}</div>)}</>{GRID_HOURS.map(hour => <div className={styles.gridRow} key={hour}><div className={styles.hour}>{formatHour(hour)}</div>{DAYS.map(day => { const status = shape[`${day}|${hour}`] || 'busy'; return <button key={day} type="button" className={styles.cell} data-state={status} onClick={() => onToggle(day, hour)} aria-label={`${day} ${formatHour(hour)}: ${status}. Tap to change.`} /> })}</div>)}</div></div>
}
