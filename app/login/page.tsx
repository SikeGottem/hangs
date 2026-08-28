// Magic-link sign-in surface; retains redirect and development-link handling.

'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import styles from '@/app/product.module.css'

function LoginInner() {
  const sp = useSearchParams()
  const err = sp.get('e')
  const redirect = sp.get('redirect') || ''
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(errToMessage(err))

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
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
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data = await res.json().catch(() => ({}))
      if (data.devLink) {
        window.location.href = data.devLink
        return
      }
      setSent(true)
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.authPage}>
      <section className={styles.authCopy} aria-labelledby="login-title">
        <span className={styles.eyebrow}>Your plans, in one place</span>
        <h1 id="login-title" className={styles.titleLarge}>Pick up where the group left off.</h1>
        <p className={styles.lede}>
          Sign in to make a plan, keep your crews close, and give everyone a clear answer.
        </p>
        <div className={styles.authProof} aria-label="Hangs benefits">
          <span>No password</span>
          <span>One useful link</span>
        </div>
      </section>

      <section className={styles.authCard} aria-labelledby="email-title">
        {!sent ? (
          <>
            <h2 id="email-title" className={styles.authCardTitle}>Send a sign-in link</h2>
            <p className={styles.authCardText}>We&apos;ll send a short-lived link to your inbox. No password to remember.</p>
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="email">Email address</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  placeholder="you@unsw.edu.au"
                  disabled={loading}
                  className={styles.control}
                  aria-describedby={error ? 'email-error' : 'email-hint'}
                />
                <p id="email-hint" className={styles.fieldHint}>Use the address you&apos;d like this crew to recognise.</p>
              </div>
              {error && <p id="email-error" className={styles.error} role="alert">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary">
                {loading ? 'Sending link…' : 'Email me a link'}
              </button>
            </form>
          </>
        ) : (
          <div className={styles.mailState} aria-live="polite">
            <div className={styles.mailMark} aria-hidden="true">01</div>
            <strong>Check your inbox</strong>
            <p>We sent a sign-in link to <b>{email}</b>. Open it to finish signing in; it expires in 15 minutes.</p>
            <button type="button" onClick={() => { setSent(false); setEmail('') }}>Use a different email</button>
          </div>
        )}
      </section>
    </div>
  )
}

export default function LoginPage() {
  return <Suspense fallback={null}><LoginInner /></Suspense>
}

function errToMessage(error: string | null): string | null {
  switch (error) {
    case 'missing': return 'Missing token — try signing in again.'
    case 'invalid': return 'That link doesn\'t work. Request a new one.'
    case 'used': return 'This link was already used. Request a fresh one.'
    case 'expired': return 'Link expired — request a new one.'
    default: return null
  }
}
