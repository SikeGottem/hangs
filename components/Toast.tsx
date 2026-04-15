// Tiny toast system — no context, no library. One global function, fixed
// position at the bottom, auto-dismiss after 3 seconds. Used by the results
// page to surface fetch errors instead of swallowing them.
"use client"
import { useEffect, useState } from 'react'

type Toast = { id: number; text: string; kind: 'info' | 'error' | 'success' }

let pushImpl: ((text: string, kind?: Toast['kind']) => void) | null = null

export function showToast(text: string, kind: Toast['kind'] = 'info') {
  if (pushImpl) pushImpl(text, kind)
  else console.warn('[toast] not mounted:', text)
}

export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    pushImpl = (text, kind = 'info') => {
      const id = Date.now() + Math.random()
      setToasts(prev => [...prev, { id, text, kind }])
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
    }
    return () => { pushImpl = null }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
      zIndex: 2000, display: 'flex', flexDirection: 'column', gap: 8,
      pointerEvents: 'none', maxWidth: '90vw',
    }}>
      {toasts.map(t => {
        const bg = t.kind === 'error' ? '#fef2f2' : t.kind === 'success' ? 'var(--free-light)' : 'var(--surface)'
        const color = t.kind === 'error' ? 'var(--error)' : t.kind === 'success' ? '#1a7a3a' : 'var(--text-primary)'
        const border = t.kind === 'error' ? 'var(--error)' : t.kind === 'success' ? 'var(--free)' : 'var(--border)'
        return (
          <div key={t.id} style={{
            padding: '12px 20px',
            background: bg,
            color,
            border: `1px solid ${border}`,
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-md)',
            fontSize: 14,
            fontWeight: 500,
            pointerEvents: 'auto',
            fontFamily: 'var(--font-body)',
          }}>
            {t.text}
          </div>
        )
      })}
    </div>
  )
}
