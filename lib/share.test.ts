// Share message builders and the share/copy fallback (stubbed navigator/window): URL on its own line everywhere.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeState, opt, person } from '@/tests/fixtures'
import { buildInviteMessage, buildLockedNudgeMessage, buildNewDaysMessage, shareOrCopy } from './share'

const A = opt('aaaaaaaa', '2026-11-21')
const ORG = person('org0000001', 'Ethan', { aaaaaaaa: 'free' }, true)
const LOCK = { optionId: 'aaaaaaaa', date: '2026-11-21', part: 'day' as const, time: '13:00', place: '', lockedAt: 5 }

afterEach(() => vi.unstubAllGlobals())

describe('messages', () => {
  it('invite text never contains the URL; textWithUrl puts it on its own line', () => {
    const m = buildInviteMessage(makeState({ options: [A], people: [ORG] }))
    expect(m.text).toBe('Picnic at mine: which days can you do? Tap yours, takes 20 seconds, no sign-up.')
    expect(m.textWithUrl('https://x/h/1')).toBe(`${m.text}\nhttps://x/h/1`)
  })

  it('invite puts a note on its own line, never wrapped in brackets or run into the question', () => {
    const m = buildInviteMessage(makeState({ options: [A], people: [ORG], event: { note: 'Bring a rug, back of the house okay?' } }))
    expect(m.text).toBe('Picnic at mine\nBring a rug, back of the house okay?\nWhich days can you do? Tap yours, takes 20 seconds, no sign-up.')
  })

  it('locked nudge states the day, the going count and who is still to answer', () => {
    const s = makeState({
      options: [A],
      people: [ORG, person('p1', 'Sam', { aaaaaaaa: 'cant' }), person('p2', 'Ana'), person('p3', 'Bo', { aaaaaaaa: 'free' })],
      lock: LOCK,
    })
    expect(buildLockedNudgeMessage(s).text).toBe('Picnic at mine is on Sat 21 Nov. 2 going, 1 still to answer. You in?')
    const all = makeState({ options: [A], people: [ORG], lock: LOCK })
    expect(buildLockedNudgeMessage(all).text).toBe('Picnic at mine is on Sat 21 Nov. 1 going. You in?')
  })

  it('new-days message', () => {
    expect(buildNewDaysMessage(makeState({ options: [A], people: [ORG] })).text).toBe('Picnic at mine: I added new days, can you check?')
  })
})

describe('shareOrCopy', () => {
  it('without a share sheet, copies exactly the previewed message (URL on its own line)', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { clipboard: { writeText }, userAgent: 'Mozilla/5.0 Instagram 300.0' })
    vi.stubGlobal('window', { isSecureContext: true })
    const r = await shareOrCopy({ title: 'Picnic', text: 'Picnic: which days?', url: 'https://x/h/1' })
    expect(r).toBe('copied')
    expect(writeText).toHaveBeenCalledWith('Picnic: which days?\nhttps://x/h/1')
  })

  it('uses the native share sheet with the URL only in `url`', async () => {
    const share = vi.fn(async () => {})
    vi.stubGlobal('navigator', { share, userAgent: 'Mozilla/5.0 (iPhone) Safari' })
    const r = await shareOrCopy({ title: 'Picnic', text: 'Picnic: which days?', url: 'https://x/h/1' })
    expect(r).toBe('shared')
    expect(share).toHaveBeenCalledWith({ title: 'Picnic', text: 'Picnic: which days?', url: 'https://x/h/1' })
  })
})
