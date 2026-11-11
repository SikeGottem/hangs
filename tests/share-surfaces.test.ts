// Share surfaces: link-preview copy (pure) plus the .ics and Open Graph route handlers against a temp-file DB.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as icsRoute from '@/app/api/events/[id]/ics/route'
import * as lockRoute from '@/app/api/events/[id]/lock/route'
import * as ogRoute from '@/app/api/events/[id]/og/route'
import { ogText } from '@/app/api/og/og-kit'
import * as eventsRoute from '@/app/api/events/route'
import { eventPreviewCopy, pageUrl } from '@/app/h/[id]/preview-copy'
import type { CreateEventResponse, EventState, EventSummary } from '@/lib/types'
import { freshIp, futureDates, useTempDb } from './db-helper'

let cleanup: () => void
beforeAll(() => ({ cleanup } = useTempDb()))
afterAll(() => cleanup())

const summary = (patch: Partial<EventSummary> = {}): EventSummary => ({
  id: 'abcdefghjk', version: 1, title: 'Picnic at mine', note: '', organiserName: 'Ethan', mode: 'days',
  optionDates: ['2026-11-21'], respondentCount: 0, leading: null, lock: null, ...patch,
})

describe('eventPreviewCopy', () => {
  it('planning: no count at zero, a count once people answer', () => {
    expect(eventPreviewCopy(summary())).toEqual({
      ogTitle: 'Picnic at mine: pick your days',
      description: "Ethan is finding a day. Tap the days you're free, takes 20 seconds, no sign-up.",
    })
    expect(eventPreviewCopy(summary({ respondentCount: 4 })).description).toMatch(/ 4 answered so far\.$/)
  })

  it('locked: time and place when set, "time TBC" and no zero count otherwise', () => {
    const full = eventPreviewCopy(summary({ lock: { label: 'Sat 21 Nov', timeLabel: '1pm', place: 'My place', going: 3, maybe: 1, lockedAt: 1 } }))
    expect(full.ogTitle).toBe('Picnic at mine: Sat 21 Nov')
    expect(full.description).toBe("It's on: Sat 21 Nov, 1pm at My place. 3 going. Tap for details and add it to your calendar.")
    const bare = eventPreviewCopy(summary({ lock: { label: 'Sat 21 Nov', timeLabel: null, place: '', going: 0, maybe: 0, lockedAt: 1 } }))
    expect(bare.description).toBe("It's on: Sat 21 Nov, time TBC. Tap for details and add it to your calendar.")
  })
})

describe('pageUrl (og:url / canonical)', () => {
  it('matches the shared URL: bare while planning, ?l= once locked', () => {
    expect(pageUrl('abcdefghjk', null)).toBe('/h/abcdefghjk')
    expect(pageUrl('abcdefghjk', 1763700000000)).toBe('/h/abcdefghjk?l=1763700000000')
  })
})

describe('GET ics and og routes', () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

  async function created(): Promise<CreateEventResponse & { state: EventState }> {
    const res = await eventsRoute.POST(new Request('http://localhost/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': freshIp() },
      body: JSON.stringify({ title: 'Picnic, at mine', organiserName: 'Ethan', dates: futureDates(2), tz: 'Australia/Sydney' }),
    }))
    return res.json()
  }

  it('ics: 404 for bad ids, 409 before lock, a calendar file after', async () => {
    const c = await created()
    expect((await icsRoute.GET(new Request('http://localhost/x'), ctx('nope'))).status).toBe(404)
    expect((await icsRoute.GET(new Request('http://localhost/x'), ctx('zzzzzzzzzz'))).status).toBe(404)
    const early = await icsRoute.GET(new Request('http://localhost/x'), ctx(c.id))
    expect(early.status).toBe(409)
    expect(early.headers.get('content-type')).toMatch(/^text\/plain/)

    await lockRoute.POST(new Request(`http://localhost/api/events/${c.id}/lock`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': freshIp(), 'x-hangs-organiser': c.organiserKey },
      body: JSON.stringify({ optionId: c.state.options[0].id, time: '13:30', place: 'Newtown' }),
    }), ctx(c.id))

    const res = await icsRoute.GET(new Request('http://localhost/x'), ctx(c.id))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/calendar; charset=utf-8')
    expect(res.headers.get('content-disposition')).toBe('inline; filename="picnic-at-mine.ics"')
    const body = await res.text()
    expect(body).toContain(`UID:${c.id}@hangs\r\n`)
    expect(body).toContain('SUMMARY:Picnic\\, at mine\r\n')
    expect(body).toMatch(/DTSTART:\d{8}T\d{6}Z/)
  })

  it('og: PNG at the current ?v=, a redirect for any other v, and the cached brand card for unknown ids', async () => {
    const c = await created()
    const v = c.state.event.version
    const ok = await ogRoute.GET(new Request(`http://localhost/api/events/${c.id}/og?v=${v}`), ctx(c.id))
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toBe('image/png')
    expect(ok.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=300')
    const png = new Uint8Array(await ok.arrayBuffer())
    expect([...png.slice(1, 4)].map(b => String.fromCharCode(b)).join('')).toBe('PNG')
    for (const q of ['', '?v=random123', `?v=${v + 1}`]) {
      const other = await ogRoute.GET(new Request(`http://localhost/api/events/${c.id}/og${q}`), ctx(c.id))
      expect(other.status).toBe(307)
      expect(other.headers.get('location')).toBe(`/api/events/${c.id}/og?v=${v}`)
    }
    for (const id of ['zzzzzzzzzz', 'bad']) {
      const missing = await ogRoute.GET(new Request(`http://localhost/api/events/${id}/og?v=1`), ctx(id))
      expect(missing.status).toBe(307)
      expect(missing.headers.get('location')).toBe('/api/og')
    }
  }, 20_000)

  it('og text: emoji stripped; titles and names outside the Latin font subset use neutral copy', () => {
    expect(ogText('Picnic 🧺 at mine')).toBe('Picnic at mine')
    expect(ogText('Café crème')).toBe('Café crème')
    expect(ogText('周末野餐')).toBeNull()
    expect(ogText('Пикник')).toBeNull()
    expect(ogText('🎉')).toBeNull()
  })
})
