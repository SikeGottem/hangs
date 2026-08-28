// Route-level error boundary for the results page. Catches any render crash
// and shows a recoverable fallback instead of Next's default stack trace.
"use client"
import { useEffect } from "react"
import Link from "next/link"
import styles from "./results.module.css"

export default function ResultsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[hangs] results page crashed:', error)
  }, [error])

  return (
    <div className={styles.errorPage}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        background: '#fef2f2', color: 'var(--error)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28,
      }}>
        ⚠︎
      </div>
      <h1 className={styles.errorTitle}>
        Something went sideways
      </h1>
      <p className={styles.errorCopy}>
        Your hang is safe — this is just the view that crashed. Try again, or if
        it keeps breaking, send Ethan the request ID below.
      </p>
      {error.digest && (
        <code style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)',
          background: 'var(--surface-dim)', padding: '4px 10px', borderRadius: 4,
        }}>
          {error.digest}
        </code>
      )}
      <div className={styles.errorActions}>
        <button
          onClick={reset}
          className="btn-primary"
          style={{ padding: '12px 22px', width: 'auto' }}
        >
          Try again
        </button>
        <Link href="/" className="btn-secondary" style={{ padding: '12px 22px', textDecoration: 'none' }}>
          Home
        </Link>
      </div>
    </div>
  )
}
