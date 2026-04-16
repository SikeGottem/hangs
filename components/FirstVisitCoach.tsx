// First-visit onboarding for the responder flow. Follows the Linear / Apple
// TipKit pattern — single hero strip + tiny inline tips anchored to specific
// UI elements. Not a full-screen carousel (those get skipped).
//
// Persistence: each tip has its own localStorage key. Dismissed = gone forever
// on this device. The version suffix lets us re-surface the whole thing if
// we redesign — bump v1 → v2 when copy changes materially.
"use client"
import { useEffect, useState } from 'react'

const HERO_KEY = 'hangs_onboarded_v1'

type HeroProps = {
  onDismiss?: () => void
}

export function OnboardingHero({ onDismiss }: HeroProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      if (!localStorage.getItem(HERO_KEY)) setVisible(true)
    } catch { /* ignore */ }
  }, [])

  if (!visible) return null

  const dismiss = () => {
    setVisible(false)
    try { localStorage.setItem(HERO_KEY, String(Date.now())) } catch { /* ignore */ }
    onDismiss?.()
  }

  return (
    <div
      role="status"
      style={{
        position: 'relative',
        background: 'var(--maybe-light)',
        border: '1px solid var(--accent)',
        borderRadius: 'var(--radius-md)',
        padding: '14px 40px 14px 16px',
        marginBottom: 20,
        animation: 'hangs-hero-in 260ms cubic-bezier(0.25, 0.1, 0.25, 1)',
      }}
    >
      <style>{`
        @keyframes hangs-hero-in {
          from { opacity: 0; transform: translateY(-6px) }
          to { opacity: 1; transform: translateY(0) }
        }
      `}</style>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: 14,
        fontWeight: 800,
        color: '#8a6d10',
        letterSpacing: '-0.01em',
      }}>
        you're invited. tap times you're free.
      </div>
      <div style={{
        fontSize: 12,
        color: '#8a6d10',
        marginTop: 2,
        lineHeight: 1.4,
      }}>
        no signup. your name saves to this device.
      </div>
      <button
        type="button"
        aria-label="Dismiss welcome message"
        onClick={dismiss}
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          width: 24,
          height: 24,
          padding: 0,
          background: 'transparent',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
          color: '#8a6d10',
          fontSize: 18,
          fontWeight: 700,
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ×
      </button>
    </div>
  )
}

type TipProps = {
  storageKey: string
  headline: string
  body: string
  show: boolean
  onDismiss?: () => void
}

// Inline tip bubble — renders below a target element. Pass `show` based on
// whether the target is mounted / visible / focused. Dismissed tips stay
// dismissed forever (per-device, per-key).
export function InlineTip({ storageKey, headline, body, show, onDismiss }: TipProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!show) { setVisible(false); return }
    try {
      if (!localStorage.getItem(storageKey)) {
        // Tiny delay so the tip doesn't flash at the same instant as the UI.
        const t = setTimeout(() => setVisible(true), 450)
        return () => clearTimeout(t)
      }
    } catch { /* ignore */ }
  }, [show, storageKey])

  if (!visible) return null

  const dismiss = () => {
    setVisible(false)
    try { localStorage.setItem(storageKey, String(Date.now())) } catch { /* ignore */ }
    onDismiss?.()
  }

  return (
    <div
      role="status"
      style={{
        background: 'var(--text-primary)',
        color: 'var(--bg)',
        borderRadius: 12,
        padding: '12px 14px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        marginTop: 10,
        marginBottom: 6,
        position: 'relative',
        maxWidth: 320,
        animation: 'hangs-tip-in 220ms cubic-bezier(0.25, 0.1, 0.25, 1)',
      }}
    >
      <style>{`
        @keyframes hangs-tip-in {
          from { opacity: 0; transform: translateY(-6px) scale(0.97) }
          to { opacity: 1; transform: translateY(0) scale(1) }
        }
      `}</style>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: 13,
        fontWeight: 700,
        marginBottom: 2,
      }}>
        {headline}
      </div>
      <div style={{ fontSize: 12, opacity: 0.82, lineHeight: 1.4 }}>
        {body}
      </div>
      <button
        type="button"
        onClick={dismiss}
        style={{
          marginTop: 8,
          padding: '4px 10px',
          background: 'rgba(255,255,255,0.16)',
          border: 'none',
          borderRadius: 6,
          color: 'var(--bg)',
          fontFamily: 'var(--font-display)',
          fontSize: 11,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        got it
      </button>
    </div>
  )
}
