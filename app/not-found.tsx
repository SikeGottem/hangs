// Global 404 fallback for Hangs routes that cannot be found.

import Link from 'next/link'
import styles from '@/app/product.module.css'

export default function NotFound() {
  return (
    <section className={styles.statusPage}>
      <span className={styles.statusCode}>404 · NOT FOUND</span>
      <h1 className={styles.title}>That page isn&apos;t here.</h1>
      <p>The link may be incomplete, or the hangout may have been removed. Start a new plan or head back to the home page.</p>
      <div className={styles.statusActions}>
        <Link href="/" className="btn-primary">Back to hangs</Link>
        <Link href="/create" className="btn-secondary">Plan a hang</Link>
      </div>
    </section>
  )
}
