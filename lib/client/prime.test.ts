// Tests for primeState: the returning viewer's cached self painted over the anonymous server render.
import { describe, expect, it } from 'vitest'
import { makeState, opt, person } from '@/tests/fixtures'
import { primeState } from './prime'
import type { ViewerCache } from './storage'

const OPTS = [opt('aaaaaaaa', '2026-11-21'), opt('bbbbbbbb', '2026-11-22'), opt('cccccccc', '2026-11-23')]
const people = (samAnswers: Record<string, 'free' | 'maybe' | 'cant'>) => [
  person('org0000001', 'Ethan', { aaaaaaaa: 'free' }, true),
  person('p0000001', 'Sam', samAnswers),
]
const cache = (patch: Partial<ViewerCache> = {}): ViewerCache => ({
  personId: 'p0000001', name: 'Sam', isOrganiser: false, version: 3, answers: { aaaaaaaa: 'free' }, ...patch,
})

describe('primeState', () => {
  it('marks the cached person as the viewer, keeping the server render as the source of their answers', () => {
    const server = makeState({ options: OPTS, people: people({ aaaaaaaa: 'free', bbbbbbbb: 'maybe' }) })
    expect(server.viewer.personId).toBeNull()
    const primed = primeState(server, cache())!
    expect(primed.viewer).toMatchObject({ personId: 'p0000001', name: 'Sam', isOrganiser: false })
    expect(primed.people.find(p => p.id === 'p0000001')!.answers).toEqual({ aaaaaaaa: 'free', bbbbbbbb: 'maybe' })
    // Same as what the identified fetch will return.
    const identified = makeState({ options: OPTS, people: people({ aaaaaaaa: 'free', bbbbbbbb: 'maybe' }), viewer: { personId: 'p0000001' } })
    expect(primed.viewer).toEqual(identified.viewer)
    expect(primed.ranking).toEqual(identified.ranking)
  })

  it('uses cached answers only when the cache is newer than the render, dropping days that no longer exist', () => {
    const server = makeState({ options: OPTS, people: people({ aaaaaaaa: 'cant' }), event: { version: 3 } })
    const primed = primeState(server, cache({ version: 5, answers: { aaaaaaaa: 'free', cccccccc: 'maybe', zzzzzzzz: 'free' } }))!
    const me = primed.people.find(p => p.id === 'p0000001')!
    expect(me.answers).toEqual({ aaaaaaaa: 'free', cccccccc: 'maybe' })
    expect(me.answeredCount).toBe(2)
    expect(primed.tallies.aaaaaaaa.free).toContain('p0000001')
  })

  it('carries the organiser role from the cache', () => {
    const server = makeState({ options: OPTS, people: people({}) })
    const primed = primeState(server, cache({ personId: 'org0000001', name: 'Ethan', isOrganiser: true }))!
    expect(primed.viewer).toMatchObject({ personId: 'org0000001', name: 'Ethan', isOrganiser: true })
  })

  it('does nothing without a cache, once the server identified the viewer, or when the person was removed', () => {
    const anon = makeState({ options: OPTS, people: people({}) })
    expect(primeState(anon, null)).toBeNull()
    const identified = makeState({ options: OPTS, people: people({}), viewer: { personId: 'p0000001' } })
    expect(primeState(identified, cache())).toBeNull()
    const removed = makeState({ options: OPTS, people: [person('org0000001', 'Ethan', {}, true)] })
    expect(primeState(removed, cache())).toBeNull()
  })
})
