// App-wide error boundary — catches render crashes in any route that doesn't
// have its own more-specific error.tsx. Shows a recoverable fallback instead
// of Next.js's raw stack trace.
"use client"
import { useEffect } from "react"

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[hangs] app crashed:', error)
  }, [error])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '70vh', padding: '48px 24px',
      textAlign: 'center', gap: 14,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        background: '#fef2f2', color: 'var(--error)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28,
      }}>
        ⚠︎
      </div>
      <h1 style={{
        fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800,
        letterSpacing: '-0.03em', color: 'var(--text-primary)',
      }}>
        Something broke
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 340, lineHeight: 1.5 }}>
        Sorry about that. Try again, or head home. If it keeps happening, send
        Ethan the code below.
      </p>
      {error.digest && (
        <code style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)',
          background: 'var(--surface-dim)', padding: '4px 10px', borderRadius: 4,
        }}>
          {error.digest}
        </code>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
        <button
          onClick={reset}
          className="btn-primary"
          style={{ padding: '12px 22px', width: 'auto' }}
        >
          Try again
        </button>
        <a href="/" className="btn-secondary" style={{ padding: '12px 22px', textDecoration: 'none' }}>
          Home
        </a>
      </div>
    </div>
  )
}
