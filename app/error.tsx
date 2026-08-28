// App-wide recoverable error boundary for unexpected route rendering failures.

'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import styles from '@/app/product.module.css'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[hangs] app crashed:', error) }, [error])

  return (
    <section className={styles.statusPage}>
      <span className={styles.statusCode}>UNEXPECTED INTERRUPTION</span>
      <h1 className={styles.title}>This screen couldn&apos;t load.</h1>
      <p>Try loading it again. If it keeps happening, head home and send Ethan the reference below.</p>
      {error.digest && <code className={styles.badge} style={{ width: 'fit-content', marginBottom: '1.5rem' }}>{error.digest}</code>}
      <div className={styles.statusActions}>
        <button type="button" onClick={reset} className="btn-primary">Try again</button>
        <Link href="/" className="btn-secondary">Back to hangs</Link>
      </div>
    </section>
  )
}
