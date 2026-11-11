// Unit tests for the .ics builder (escaping, UTF-8-safe folding, timing) and the Google Calendar link.
import { describe, expect, it } from 'vitest'
import { makeState, opt, person } from '@/tests/fixtures'
import { buildIcs, escapeIcsText, foldLine, googleCalendarUrl, icsSlug } from './ics'
import type { LockInfo } from './types'

const ORG = person('org0000001', 'Ethan', {}, true)
const NOW = new Date('2026-11-10T01:02:03Z')
const URL_ = 'https://hangs.example/h/evt0000001'

function locked(lock: Partial<LockInfo>, event: { title?: string; note?: string } = {}) {
  return makeState({
    options: [opt('aaaaaaaa', '2026-11-21'), opt('mmmmmmmm', '2026-11-22', 'afternoon')],
    people: [ORG],
    event,
    lock: { optionId: 'aaaaaaaa', date: '2026-11-21', part: 'day', time: null, place: '', lockedAt: 9, ...lock },
  })
}

const utf8 = (s: string) => new TextEncoder().encode(s).length

describe('escapeIcsText', () => {
  it('escapes backslash first, then ; and , and newlines; strips CR', () => {
    expect(escapeIcsText('a\\b;c,d\r\ne')).toBe(String.raw`a\\b\;c\,d\ne`)
  })
})

describe('foldLine', () => {
  it('leaves short lines alone', () => {
    expect(foldLine('SUMMARY:hi')).toBe('SUMMARY:hi')
  })
  it('folds at 75 octets without splitting multibyte characters (emoji, CJK)', () => {
    const line = `SUMMARY:${'野餐🧺'.repeat(30)}`
    const folded = foldLine(line)
    const parts = folded.split('\r\n')
    expect(parts.length).toBeGreaterThan(1)
    for (const p of parts) expect(utf8(p)).toBeLessThanOrEqual(75)
    for (const p of parts.slice(1)) expect(p.startsWith(' ')).toBe(true)
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(line)
    expect(folded).not.toContain('�')
  })
})

describe('buildIcs', () => {
  it('all-day when there is no time and the day is whole', () => {
    const ics = buildIcs(locked({}, { title: 'Picnic, at mine; bring snacks', note: 'Rug\nand hat' }), { url: URL_, now: NOW })
    expect(ics.endsWith('\r\n')).toBe(true)
    expect(ics.split('\r\n').every(l => !l.includes('\n'))).toBe(true)
    const lines = ics.split('\r\n')
    expect(lines.slice(0, 5)).toEqual(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hangs//v2//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'])
    expect(ics).toContain('UID:evt0000001@hangs')
    expect(ics).toContain('SEQUENCE:3')
    expect(ics).toContain('DTSTAMP:20261110T010203Z')
    expect(ics).toContain('DTSTART;VALUE=DATE:20261121')
    expect(ics).toContain('DTEND;VALUE=DATE:20261122')
    expect(ics).toContain(String.raw`SUMMARY:Picnic\, at mine\; bring snacks`)
    expect(ics).toContain(`DESCRIPTION:Rug\\nand hat\\n\\n${URL_.replace(/,/g, '\\,')}`)
    expect(ics).toContain(`URL:${URL_}`)
    expect(ics).not.toContain('LOCATION:')
  })

  it('timed events are UTC Z, three hours long, with a location', () => {
    const ics = buildIcs(locked({ time: '13:30', place: 'Centennial Park' }), { url: URL_, now: NOW })
    expect(ics).toContain('DTSTART:20261121T023000Z')
    expect(ics).toContain('DTEND:20261121T053000Z')
    expect(ics).toContain('LOCATION:Centennial Park')
    expect(ics).toContain(`DESCRIPTION:${URL_}`)
  })

  it('a part with no time uses the default start', () => {
    const ics = buildIcs(locked({ optionId: 'mmmmmmmm', date: '2026-11-22', part: 'afternoon' }), { url: URL_, now: NOW })
    expect(ics).toContain('DTSTART:20261122T020000Z') // 13:00 AEDT
    expect(ics).toContain('DTEND:20261122T050000Z')
  })

  it('throws when not locked', () => {
    const s = makeState({ options: [opt('aaaaaaaa', '2026-11-21')], people: [ORG] })
    expect(() => buildIcs(s, { url: URL_, now: NOW })).toThrow()
  })
})

describe('googleCalendarUrl', () => {
  it('prefills an all-day event', () => {
    const u = new URL(googleCalendarUrl(locked({ place: 'Home' }, { note: 'BYO' }), { url: URL_ }))
    expect(u.origin + u.pathname).toBe('https://calendar.google.com/calendar/render')
    expect(u.searchParams.get('action')).toBe('TEMPLATE')
    expect(u.searchParams.get('text')).toBe('Picnic at mine')
    expect(u.searchParams.get('dates')).toBe('20261121/20261122')
    expect(u.searchParams.get('details')).toBe(`BYO\n\n${URL_}`)
    expect(u.searchParams.get('location')).toBe('Home')
  })
  it('uses UTC instants for a timed event', () => {
    const u = new URL(googleCalendarUrl(locked({ time: '18:00' }), { url: URL_ }))
    expect(u.searchParams.get('dates')).toBe('20261121T070000Z/20261121T100000Z')
  })
})

describe('icsSlug', () => {
  it('slugs titles', () => {
    expect(icsSlug('Picnic at mine!')).toBe('picnic-at-mine')
    expect(icsSlug('野餐')).toBe('hang')
    expect(icsSlug('x'.repeat(60)).length).toBe(40)
    expect(icsSlug('Café night')).toBe('cafe-night')
  })
})
