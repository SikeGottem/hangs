// Unit tests for deriveState: ordering, viewer, attendance and the client 'local' overlay rule.
import { describe, expect, it } from 'vitest'
import { makeState, opt, person } from '@/tests/fixtures'
import { overlayState } from './client'

const ORG = person('org0000001', 'Ethan', {}, true)

describe('deriveState', () => {
  it('orders options by date then part and flags past ones', () => {
    const s = makeState({
      options: [opt('eeeeeeee', '2026-11-21', 'evening'), opt('pppppppp', '2026-11-01'), opt('mmmmmmmm', '2026-11-21', 'morning')],
      people: [ORG],
    })
    expect(s.options.map(o => [o.id, o.isPast])).toEqual([['pppppppp', true], ['mmmmmmmm', false], ['eeeeeeee', false]])
  })

  it('puts the organiser first and keeps the others in order', () => {
    const s = makeState({ options: [opt('aaaaaaaa', '2026-11-21')], people: [person('p1', 'Zed'), ORG, person('p2', 'Amy')] })
    expect(s.people.map(p => p.id)).toEqual(['org0000001', 'p1', 'p2'])
  })

  it('fills the viewer, etag and limits', () => {
    const s = makeState({ options: [opt('aaaaaaaa', '2026-11-21')], people: [ORG, person('p1', 'Sam')], viewer: { personId: 'p1' } })
    expect(s.viewer).toEqual({ personId: 'p1', name: 'Sam', isOrganiser: false, personTokenRejected: false, organiserKeyRejected: false })
    expect(s.etag).toBe(`3-${s.today}`)
    expect(s.limits).toEqual({ maxPeople: 150, maxOptions: 62 })
    expect(s.attendance).toBeNull()
  })

  it('tallies attendance over all people when locked (silent joiners in none)', () => {
    const s = makeState({
      options: [opt('aaaaaaaa', '2026-11-21'), opt('bbbbbbbb', '2026-11-22')],
      people: [ORG, person('p1', 'Sam', { aaaaaaaa: 'free' }), person('p2', 'Ana', { aaaaaaaa: 'cant' }), person('p3', 'Bo', { bbbbbbbb: 'free' })],
      lock: { optionId: 'aaaaaaaa', date: '2026-11-21', part: 'day', time: '13:00', place: '', lockedAt: 5 },
    })
    expect(s.attendance).toEqual({ optionId: 'aaaaaaaa', free: ['p1'], maybe: [], cant: ['p2'], none: ['p3', 'org0000001'] })
  })
})

describe("overlayState ('local' rule)", () => {
  const server = makeState({ options: [opt('aaaaaaaa', '2026-11-21'), opt('bbbbbbbb', '2026-11-22')], people: [ORG, person('p1', 'Ana', { aaaaaaaa: 'free' })] })

  it('returns the server state untouched with nothing pending', () => {
    expect(overlayState(server, {}, 'Sam')).toBe(server)
  })

  it('adds a temporary local person who counts toward R but is not a real viewer id', () => {
    const s = overlayState(server, { aaaaaaaa: 'free', bbbbbbbb: 'cant' }, 'Sam')
    const local = s.people.find(p => p.id === 'local')
    expect(local).toMatchObject({ name: 'Sam', answeredCount: 2 })
    expect(s.ranking.respondentCount).toBe(2)
    expect(s.tallies.aaaaaaaa.free).toEqual(['p1', 'local'])
    expect(s.viewer.personId).toBeNull()
    expect(s.ranking.hero.kind).toBe('everyone')
  })

  it('falls back to "You" and applies clears to a real viewer', () => {
    expect(overlayState(server, { aaaaaaaa: 'maybe' }, '').people.find(p => p.id === 'local')?.name).toBe('You')
    const viewer = makeState({ options: [opt('aaaaaaaa', '2026-11-21')], people: [ORG, person('p1', 'Ana', { aaaaaaaa: 'free' })], viewer: { personId: 'p1' } })
    const cleared = overlayState(viewer, { aaaaaaaa: null }, 'Ana')
    expect(cleared.people.find(p => p.id === 'p1')?.answers).toEqual({})
    expect(cleared.ranking.respondentCount).toBe(0)
    expect(cleared.people.some(p => p.id === 'local')).toBe(false)
  })
})
