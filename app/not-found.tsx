import Link from 'next/link'

export default function NotFound() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', padding: '48px 24px', textAlign: 'center',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%', background: 'var(--surface-dim)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 20, fontSize: 24,
      }}>?</div>
      <h1 style={{
        fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800,
        letterSpacing: '-0.03em', marginBottom: 8,
      }}>Hang not found</h1>
      <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 24 }}>
        This link might be broken or the hangout was removed.
      </p>
      <Link href="/" className="btn-primary" style={{ maxWidth: 200 }}>
        Back to home
      </Link>
    </div>
  )
}
