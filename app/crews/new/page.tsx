// /crews/new — 2-step flow: crew name/description → invite members.

"use client"
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'

export default function NewCrew() {
  const router = useRouter()
  const [step, setStep] = useState<0 | 1>(0)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [emailsText, setEmailsText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [me, setMe] = useState<{ user: any } | null>(null)

  useEffect(() => {
    fetch('/api/me').then(r => r.json()).then(setMe)
  }, [])

  useEffect(() => {
    if (me && !me.user) router.replace('/login?redirect=/crews/new')
  }, [me, router])

  const emails = emailsText
    .split(/[\s,;\n]+/)
    .map(s => s.trim().toLowerCase())
    .filter(s => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s))

  async function handleCreate() {
    if (!name.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/crews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          inviteEmails: emails.length ? emails : undefined,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      const { crew } = await res.json()
      router.push(`/crews/${crew.id}`)
    } catch (e: any) {
      setError(e.message || 'Something went wrong')
      setLoading(false)
    }
  }

  if (!me || !me.user) return null

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '32px 24px' }}>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="label" style={{ marginBottom: 8 }}>Step {step + 1} of 2</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, letterSpacing: '-0.04em', margin: '0 0 20px' }}>
          {step === 0 ? 'Name your crew' : 'Invite members'}
        </h1>
      </motion.div>

      <AnimatePresence mode="wait">
        {step === 0 ? (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Name</span>
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="UNSW Climbing Society"
                maxLength={80}
                style={{
                  padding: '12px 14px', fontSize: 16, borderRadius: 10,
                  border: '1.5px solid var(--border-light)', background: 'var(--surface)',
                }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Description (optional)</span>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Weekly bouldering + beer"
                maxLength={400}
                rows={3}
                style={{
                  padding: '12px 14px', fontSize: 15, borderRadius: 10,
                  border: '1.5px solid var(--border-light)', background: 'var(--surface)',
                  fontFamily: 'inherit', resize: 'vertical',
                }}
              />
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => router.back()}
                style={{ flex: 1, padding: 12, background: 'none', border: '1.5px solid var(--border-light)', borderRadius: 10, fontSize: 14, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => setStep(1)}
                disabled={!name.trim()}
                className="btn-primary"
                style={{ flex: 2, padding: 12, opacity: name.trim() ? 1 : 0.5 }}
              >
                Next →
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                Member emails (optional — you can add more later)
              </span>
              <textarea
                autoFocus
                value={emailsText}
                onChange={e => setEmailsText(e.target.value)}
                placeholder={'sarah@unsw.edu.au\nnoah@example.com'}
                rows={6}
                style={{
                  padding: '12px 14px', fontSize: 14, borderRadius: 10,
                  border: '1.5px solid var(--border-light)', background: 'var(--surface)',
                  fontFamily: 'var(--font-mono), monospace', resize: 'vertical',
                }}
              />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Paste or type — separated by spaces, commas, or new lines.
                {emails.length > 0 && <strong> {emails.length} valid email{emails.length === 1 ? '' : 's'}.</strong>}
              </span>
            </label>

            {error && (
              <div style={{ fontSize: 13, color: 'var(--error)', padding: '4px 2px' }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setStep(0)}
                disabled={loading}
                style={{ flex: 1, padding: 12, background: 'none', border: '1.5px solid var(--border-light)', borderRadius: 10, fontSize: 14, cursor: 'pointer' }}
              >
                ← Back
              </button>
              <button
                onClick={handleCreate}
                disabled={loading}
                className="btn-primary"
                style={{ flex: 2, padding: 12, opacity: loading ? 0.6 : 1 }}
              >
                {loading ? 'Creating…' : emails.length ? `Create & invite ${emails.length}` : 'Create crew'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
