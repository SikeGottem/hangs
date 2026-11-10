// Unit tests for nextAction: which single element gets the yellow accent.
import { describe, expect, it } from 'vitest'
import { makeState, opt, person } from '@/tests/fixtures'
import { nextAction, type NextActionInput } from './next-action'

const A = opt('aaaaaaaa', '2026-11-21')
const ORG = person('org0000001', 'Ethan', {}, true)
const guest = makeState({ options: [A], people: [ORG] })
const organiser = makeState({ options: [A], people: [ORG], viewer: { personId: 'org0000001', isOrganiser: true } })
const organiser2 = makeState({
  options: [A], people: [ORG, person('p1', 'Ana', { aaaaaaaa: 'free' }), person('p2', 'Ben', { aaaaaaaa: 'free' })],
  viewer: { personId: 'org0000001', isOrganiser: true },
})
const expiredOrg = makeState({ options: [opt('pppppppp', '2026-11-01')], people: [ORG], viewer: { personId: 'org0000001', isOrganiser: true } })
const locked = makeState({ options: [A], people: [ORG], lock: { optionId: 'aaaaaaaa', date: '2026-11-21', part: 'day', time: null, place: '', lockedAt: 1 } })

const base = (patch: Partial<NextActionInput>): NextActionInput => ({
  state: guest, needsName: false, shared: false, doneTapped: false, myAnswerCount: 0, myLockedAnswer: null, ...patch,
})

describe('nextAction', () => {
  it('needsName wins over everything', () => {
    expect(nextAction(base({ needsName: true, state: locked, myLockedAnswer: 'free' }))).toBe('name')
  })
  it('locked: calendar only after free or maybe', () => {
    expect(nextAction(base({ state: locked, myLockedAnswer: null }))).toBeNull()
    expect(nextAction(base({ state: locked, myLockedAnswer: 'cant' }))).toBeNull()
    expect(nextAction(base({ state: locked, myLockedAnswer: 'free' }))).toBe('calendar')
    expect(nextAction(base({ state: locked, myLockedAnswer: 'maybe' }))).toBe('calendar')
  })
  it('expired for the organiser', () => {
    expect(nextAction(base({ state: expiredOrg }))).toBe('add_days')
  })
  it('organiser share before anything else', () => {
    expect(nextAction(base({ state: organiser, myAnswerCount: 2 }))).toBe('share')
  })
  it('done after answering', () => {
    expect(nextAction(base({ state: guest, myAnswerCount: 1 }))).toBe('done')
    expect(nextAction(base({ state: organiser, shared: true, myAnswerCount: 1 }))).toBe('done')
  })
  it('lock once two people answered', () => {
    expect(nextAction(base({ state: organiser2, shared: true, doneTapped: true }))).toBe('lock')
    expect(nextAction(base({ state: organiser, shared: true, doneTapped: true }))).toBeNull()
  })
  it('for an organiser with two or more respondents, lock outranks their own Done', () => {
    expect(nextAction(base({ state: organiser2, shared: true, myAnswerCount: 1, doneTapped: false }))).toBe('lock')
  })
  it('null for a guest with nothing to do', () => {
    expect(nextAction(base({ state: guest }))).toBeNull()
    expect(nextAction(base({ state: guest, myAnswerCount: 3, doneTapped: true }))).toBeNull()
  })
})
