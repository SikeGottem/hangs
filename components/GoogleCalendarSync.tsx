// Google Calendar busy-time autofill for the availability grid (read-only).
// Uses the Google Identity Services token model — popup flow, client-only,
// zero server involvement. The access token never leaves the browser and is
// garbage-collected with the page. Scope is calendar.freebusy (narrowest
// possible) so Google's consent UI says "See your availability" rather than
// "See your calendars" — no event titles, locations, or attendees are ever
// fetched.
//
// Requires NEXT_PUBLIC_GOOGLE_CLIENT_ID env var + the GIS script tag in
// app/layout.tsx.
"use client"
import { useCallback, useRef, useState } from 'react'
import { showToast } from '@/components/Toast'

const SCOPE = 'https://www.googleapis.com/auth/calendar.freebusy'

type Props = {
  dateRangeStart: string  // "YYYY-MM-DD" (inclusive)
  dateRangeEnd: string    // "YYYY-MM-DD" (inclusive — we add 1 day internally)
  hours: number[]         // e.g. [8,9,...,22] — the hours the grid renders
  onBusySlots: (keys: string[]) => void  // parent paints these slots as "busy"
}

export default function GoogleCalendarSync({
  dateRangeStart,
  dateRangeEnd,
  hours,
  onBusySlots,
}: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [count, setCount] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  // Keep the token client alive across re-syncs to avoid re-initialising GIS.
  const tokenClientRef = useRef<ReturnType<NonNullable<Window['google']>['accounts']['oauth2']['initTokenClient']> | null>(null)

  const sync = useCallback(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    if (!clientId) {
      setState('error')
      setErr('Calendar sync not configured yet')
      showToast('Google Calendar sync is not set up yet', 'error')
      return
    }
    if (!window.google?.accounts?.oauth2) {
      setState('error')
      setErr('Google script not loaded — try again in a sec')
      return
    }
    setState('loading')
    setErr(null)

    const handleResponse = async (resp: { access_token?: string; error?: string }) => {
      if (!resp.access_token) {
        setState('error')
        setErr(resp.error || 'Permission denied')
        return
      }
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
        // end is inclusive in the UI, exclusive in the API
        const endExclusive = new Date(dateRangeEnd + 'T00:00:00')
        endExclusive.setDate(endExclusive.getDate() + 1)

        const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resp.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            timeMin: new Date(dateRangeStart + 'T00:00:00').toISOString(),
            timeMax: endExclusive.toISOString(),
            timeZone: tz,
            items: [{ id: 'primary' }],
          }),
        })
        if (!res.ok) throw new Error(`freebusy ${res.status}`)
        const data = await res.json()
        const busy: { start: string; end: string }[] = data.calendars?.primary?.busy || []

        // Walk each busy block hourly in the viewer's local TZ and bucket
        // into grid slot keys. Any overlap with an hour marks that hour busy.
        const keys = new Set<string>()
        for (const b of busy) {
          const s = new Date(b.start)
          const e = new Date(b.end)
          const cursor = new Date(s)
          cursor.setMinutes(0, 0, 0)
          while (cursor < e) {
            const h = cursor.getHours()
            if (hours.includes(h)) {
              const y = cursor.getFullYear()
              const m = String(cursor.getMonth() + 1).padStart(2, '0')
              const d = String(cursor.getDate()).padStart(2, '0')
              keys.add(`${y}-${m}-${d}|${h}`)
            }
            cursor.setHours(cursor.getHours() + 1)
          }
        }
        onBusySlots(Array.from(keys))
        setCount(keys.size)
        setState('done')
        if (keys.size === 0) {
          showToast('No conflicts — you\'re free the whole window', 'success')
        } else {
          showToast(`Blocked out ${keys.size} busy slot${keys.size === 1 ? '' : 's'}`, 'success')
        }
      } catch (e: unknown) {
        setState('error')
        setErr(e instanceof Error ? e.message : 'Fetch failed')
        showToast('Could not read Google Calendar', 'error')
      }
    }

    // Re-use the cached client on subsequent clicks (silent re-auth).
    if (!tokenClientRef.current) {
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: handleResponse,
        error_callback: (e) => {
          setState('error')
          setErr(e.message || e.type)
        },
      })
    } else {
      // Update the callback for this new sync attempt — we want the latest closure.
      // (GIS reuses the stored config otherwise.)
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: handleResponse,
        error_callback: (e) => {
          setState('error')
          setErr(e.message || e.type)
        },
      })
    }
    // '' prompt = silent if already granted, popup otherwise.
    // Must be called synchronously inside the user gesture for iOS Safari.
    tokenClientRef.current.requestAccessToken({ prompt: '' })
  }, [dateRangeStart, dateRangeEnd, hours, onBusySlots])

  const label = (() => {
    if (state === 'loading') return 'Syncing…'
    if (state === 'done' && count > 0) return `Synced · ${count} busy slot${count === 1 ? '' : 's'}`
    if (state === 'done') return 'Synced · re-sync'
    if (state === 'error') return 'Retry sync'
    return 'Sync Google Calendar'
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button
        type="button"
        onClick={sync}
        disabled={state === 'loading'}
        aria-label="Import busy time from Google Calendar"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '10px 16px',
          background: state === 'done' ? 'var(--free-light)' : 'var(--surface)',
          border: `1px solid ${state === 'done' ? 'var(--free)' : state === 'error' ? 'var(--error)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-md)',
          cursor: state === 'loading' ? 'wait' : 'pointer',
          fontFamily: 'var(--font-display)',
          fontSize: 13,
          fontWeight: 700,
          color: state === 'done' ? '#1a7a3a' : state === 'error' ? 'var(--error)' : 'var(--text-primary)',
          transition: 'all 0.15s ease',
          opacity: state === 'loading' ? 0.7 : 1,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        {label}
      </button>
      <div style={{
        fontSize: 10,
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-muted)',
        lineHeight: 1.4,
      }}>
        Read-only · we only see when you're busy, never what you're doing
      </div>
    </div>
  )
}
