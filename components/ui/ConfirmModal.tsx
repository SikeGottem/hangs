// Styled confirmation modal — replaces native window.confirm() across the app.
// Singleton pattern matches Toast.tsx: one global showConfirm() returns a
// Promise<boolean>. Caller just does `if (!(await showConfirm({...}))) return`.
"use client"
import { useState, useEffect, useRef } from 'react'

type ConfirmOpts = {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type Pending = ConfirmOpts & { resolve: (v: boolean) => void }

let pushImpl: ((opts: ConfirmOpts) => Promise<boolean>) | null = null

export function showConfirm(opts: ConfirmOpts): Promise<boolean> {
  if (pushImpl) return pushImpl(opts)
  if (typeof window === 'undefined') return Promise.resolve(false)
  console.warn('[confirm] host not mounted, falling back to native confirm')
  return Promise.resolve(window.confirm(opts.message))
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null)
  const confirmBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    pushImpl = (opts) => new Promise(resolve => setPending({ ...opts, resolve }))
    return () => { pushImpl = null }
  }, [])

  const close = (result: boolean) => {
    if (pending) pending.resolve(result)
    setPending(null)
  }

  useEffect(() => {
    if (!pending) return
    confirmBtnRef.current?.focus()
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(false) }
      if (e.key === 'Enter') { e.preventDefault(); close(true) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])

  if (!pending) return null

  const {
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
  } = pending

  return (
    <div
      onClick={() => close(false)}
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Confirm action'}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(26, 26, 26, 0.48)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 3000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        animation: 'hangs-confirm-fade 120ms ease-out',
      }}
    >
      <style>{`
        @keyframes hangs-confirm-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes hangs-confirm-pop {
          from { opacity: 0; transform: translateY(8px) scale(0.97) }
          to { opacity: 1; transform: translateY(0) scale(1) }
        }
      `}</style>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          maxWidth: 380,
          width: '100%',
          padding: '24px 24px 20px',
          fontFamily: 'var(--font-body)',
          animation: 'hangs-confirm-pop 160ms cubic-bezier(0.25, 0.1, 0.25, 1)',
        }}
      >
        {title && (
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 20,
            fontWeight: 800,
            letterSpacing: '-0.01em',
            color: 'var(--text-primary)',
            marginBottom: 8,
          }}>
            {title}
          </div>
        )}
        <div style={{
          fontSize: 14,
          lineHeight: 1.5,
          color: 'var(--text-secondary)',
          marginBottom: 22,
        }}>
          {message}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => close(false)}
            style={{
              padding: '10px 18px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              fontFamily: 'var(--font-display)',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--text-secondary)',
              transition: 'background 0.15s ease',
            }}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={() => close(true)}
            style={{
              padding: '10px 18px',
              background: danger ? 'var(--error)' : 'var(--accent)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              fontFamily: 'var(--font-display)',
              fontSize: 14,
              fontWeight: 700,
              color: danger ? '#fff' : 'var(--accent-text)',
              transition: 'transform 0.1s ease',
            }}
            onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
            onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
