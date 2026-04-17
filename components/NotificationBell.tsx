// Bell component for the logged-in user's header. Polls /api/notifications
// every 30 seconds and shows an unread badge. Click opens a dropdown with
// the last 10 items; clicking an item marks it read + navigates.

"use client"
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

type NotificationItem = {
  id: string
  crewId: string | null
  hangId: string | null
  type: string
  text: string
  url: string | null
  read: boolean
  createdAt: string
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return
      const d = await res.json()
      setUnread(d.unreadCount || 0)
      setItems(d.items || [])
    } catch { /* ignore */ }
  }

  // Initial + poll every 30s
  useEffect(() => {
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [])

  // Click-outside to close
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function markAllRead() {
    setLoading(true)
    try {
      await fetch('/api/notifications', { method: 'POST' })
      setUnread(0)
      setItems(prev => prev.map(i => ({ ...i, read: true })))
    } finally { setLoading(false) }
  }

  async function handleItemClick(item: NotificationItem) {
    if (!item.read) {
      await fetch(`/api/notifications/${item.id}`, { method: 'PATCH' })
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, read: true } : i))
      setUnread(u => Math.max(0, u - 1))
    }
    setOpen(false)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
        onClick={() => setOpen(v => !v)}
        style={{
          position: 'relative',
          width: 36, height: 36,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', border: 'none', borderRadius: 999,
          cursor: 'pointer', color: 'var(--text-primary)',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 4, right: 4,
            minWidth: 16, height: 16, padding: '0 4px',
            background: 'var(--accent)', color: 'var(--accent-text)',
            borderRadius: 999, fontSize: 9, fontWeight: 800,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-mono)',
          }}>{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          width: 320, maxHeight: 420, overflow: 'auto',
          background: 'var(--surface)',
          border: '1px solid var(--border-light)', borderRadius: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
          zIndex: 50,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px', borderBottom: '1px solid var(--border-light)',
          }}>
            <strong style={{ fontSize: 13 }}>Notifications</strong>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                disabled={loading}
                style={{
                  background: 'none', border: 'none', color: 'var(--accent)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0,
                }}
              >
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
              Nothing new.
            </div>
          ) : (
            items.map(item => (
              <NotificationRow key={item.id} item={item} onClick={() => handleItemClick(item)} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

function NotificationRow({ item, onClick }: { item: NotificationItem; onClick: () => void }) {
  const when = timeAgo(item.createdAt)
  const dot = !item.read
  const content = (
    <div style={{
      display: 'flex', gap: 10, padding: '10px 14px',
      borderBottom: '1px solid var(--border-light)',
      background: dot ? 'var(--maybe-light)' : 'transparent',
      cursor: 'pointer',
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: 999, marginTop: 6,
        background: dot ? 'var(--accent)' : 'transparent',
        flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: dot ? 700 : 500, lineHeight: 1.4 }}>
          {item.text}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
          {when}
        </div>
      </div>
    </div>
  )
  return item.url ? (
    <Link href={item.url} onClick={onClick} style={{ textDecoration: 'none', color: 'inherit' }}>
      {content}
    </Link>
  ) : (
    <div onClick={onClick}>{content}</div>
  )
}

function timeAgo(iso: string): string {
  const t = new Date(iso + 'Z').getTime()
  const diff = Date.now() - t
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}
