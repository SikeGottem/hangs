// /login — email input for magic-link auth. "Check your inbox" on success.

"use client"
import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'

function LoginInner() {
  const sp = useSearchParams()
  const err = sp.get('e')
  const redirect = sp.get('redirect') || ''

  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(errToMessage(err))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/request-magic-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), redirect: redirect || undefined }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      setSent(true)
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 24px' }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 36,
            fontWeight: 800,
            letterSpacing: '-0.04em',
            marginBottom: 8,
          }}>Sign in</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 15, marginBottom: 24, lineHeight: 1.5 }}>
            We&apos;ll email you a link — no password needed.
          </p>
        </motion.div>

        <AnimatePresence mode="wait">
          {!sent ? (
            <motion.form
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onSubmit={handleSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@unsw.edu.au"
                disabled={loading}
                style={{
                  padding: '14px 16px',
                  fontSize: 16,
                  borderRadius: 10,
                  border: '1.5px solid var(--border-light)',
                  background: 'var(--surface)',
                  outline: 'none',
                }}
              />
              {error && (
                <div style={{ fontSize: 13, color: 'var(--error)', padding: '4px 2px' }}>{error}</div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="btn-primary"
                style={{ padding: '14px', fontSize: 16, opacity: loading ? 0.6 : 1 }}
              >
                {loading ? 'Sending…' : 'Send me a link'}
              </button>
            </motion.form>
          ) : (
            <motion.div
              key="sent"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              style={{
                padding: '20px',
                background: 'var(--surface)',
                border: '1px solid var(--border-light)',
                borderRadius: 12,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Check your inbox</div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                We sent a sign-in link to <strong>{email}</strong>. Click it to finish signing in. The link expires in 15 minutes.
              </div>
              <button
                onClick={() => { setSent(false); setEmail('') }}
                style={{
                  marginTop: 16,
                  fontSize: 13,
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent)',
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                Use a different email
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  )
}

function errToMessage(e: string | null): string | null {
  switch (e) {
    case 'missing': return 'Missing token — try signing in again.'
    case 'invalid': return 'That link doesn\'t work. Request a new one.'
    case 'used': return 'This link was already used. Request a fresh one.'
    case 'expired': return 'Link expired — request a new one.'
    default: return null
  }
}
