// Unit tests for ranking order, ties and every hero sentence.
import { describe, expect, it } from 'vitest'
import { makeState, opt, person, TODAY } from '@/tests/fixtures'
import { bestDaySentence, rankOptions, tiedOptionIds } from './rank'

const A = opt('aaaaaaaa', '2026-11-21') // Sat
const B = opt('bbbbbbbb', '2026-11-22') // Sun
const C = opt('cccccccc', '2026-11-28') // Sat
const D = opt('dddddddd', '2026-11-29') // Sun
const ORG = person('org0000001', 'Ethan', {}, true)

describe('rankOptions', () => {
  it('hedges the winner headline when under half of respondents are free', () => {
    const people = [
      person('p1', 'Ana', { aaaaaaaa: 'free', bbbbbbbb: 'cant' }),
      person('p2', 'Ben', { aaaaaaaa: 'free', bbbbbbbb: 'cant' }),
      person('p3', 'Cat', { aaaaaaaa: 'cant', bbbbbbbb: 'free' }),
      person('p4', 'Dev', { aaaaaaaa: 'cant', bbbbbbbb: 'cant' }),
      person('p5', 'Eve', { aaaaaaaa: 'cant', bbbbbbbb: 'cant' }),
    ]
    const s = makeState({ options: [A, B], people })
    expect(s.ranking.hero.kind).toBe('winner')
    expect(s.ranking.hero.headline).toBe('Best so far: Sat 21 Nov')
    expect(s.ranking.hero.detail).toBe("Only 2 of 5 free · Cat, Dev and Eve can't.")
  })

  it('ranks the acceptance fixture B, A, C and states the winner (checklist 18)', () => {
    const people = [
      person('p1', 'Ana', { aaaaaaaa: 'free', bbbbbbbb: 'free', cccccccc: 'free' }),
      person('p2', 'Ben', { aaaaaaaa: 'free', bbbbbbbb: 'free', cccccccc: 'free' }),
      person('p3', 'Cat', { aaaaaaaa: 'free', bbbbbbbb: 'free' }),
      person('p4', 'Dev', { aaaaaaaa: 'cant', bbbbbbbb: 'maybe' }),
    ]
    const s = makeState({ options: [A, B, C], people })
    expect(s.ranking.ranked.map(o => o.optionId)).toEqual(['bbbbbbbb', 'aaaaaaaa', 'cccccccc'])
    expect(s.ranking.respondentCount).toBe(4)
    expect(s.ranking.hero.kind).toBe('winner')
    expect(s.ranking.hero.headline).toBe('Sun 22 Nov works best')
    expect(s.ranking.hero.detail).toBe('3 of 4 free · 1 if need be.')
    expect(bestDaySentence(s.ranking.hero)).toBe('Sun 22 Nov works best. 3 of 4 free · 1 if need be.')
    expect(s.ranking.ranked[0].rank).toBe(1)
    expect(s.ranking.ranked[1].rank).toBe(2)
    expect(s.tallies.cccccccc.none).toEqual(['p3', 'p4'])
  })

  it('shares ranks for equal scores and flags neighbours as tied', () => {
    const people = [person('p1', 'Ana', { aaaaaaaa: 'free', bbbbbbbb: 'free' }), person('p2', 'Ben', { aaaaaaaa: 'free', bbbbbbbb: 'free', cccccccc: 'cant' })]
    const r = rankOptions([A, B, C], people, TODAY)
    expect(r.ranked.map(o => [o.optionId, o.rank, o.tiedWithNeighbour])).toEqual([
      ['aaaaaaaa', 1, true], ['bbbbbbbb', 1, true], ['cccccccc', 3, false],
    ])
    expect(r.topOptionIds).toEqual(['aaaaaaaa', 'bbbbbbbb'])
  })

  it('sorts tally ids by name', () => {
    const people = [person('z', 'Zed', { aaaaaaaa: 'free' }), person('a', 'amy', { aaaaaaaa: 'free' }), person('m', 'Mo', { aaaaaaaa: 'free' })]
    expect(rankOptions([A], people, TODAY).tallies.aaaaaaaa.free).toEqual(['a', 'm', 'z'])
  })

  it('ranks past options last and never picks them while a future option exists', () => {
    const past = opt('pppppppp', '2026-11-01')
    const people = [person('p1', 'Ana', { pppppppp: 'free', aaaaaaaa: 'cant' }), person('p2', 'Ben', { pppppppp: 'free', aaaaaaaa: 'maybe' })]
    const s = makeState({ options: [past, A], people })
    expect(s.ranking.ranked.map(o => o.optionId)).toEqual(['aaaaaaaa', 'pppppppp'])
    expect(s.ranking.ranked[1].isPast).toBe(true)
    expect(s.ranking.topOptionIds).toEqual(['aaaaaaaa'])
    expect(s.ranking.hero.kind).toBe('none_free')
  })

  it('ignores answers to deleted options', () => {
    const people = [person('p1', 'Ana', { gonegone: 'free' }), person('p2', 'Ben', { aaaaaaaa: 'free' })]
    const s = makeState({ options: [A], people })
    expect(s.ranking.respondentCount).toBe(1)
    expect(s.people.find(p => p.id === 'p1')?.answers).toEqual({})
    expect(s.people.find(p => p.id === 'p1')?.answeredCount).toBe(0)
  })

  it('does not count someone who joined with zero answers as a respondent', () => {
    const s = makeState({ options: [A], people: [ORG, person('p1', 'Ana')] })
    expect(s.ranking.respondentCount).toBe(0)
    expect(s.ranking.hero.kind).toBe('empty')
    expect(s.tallies.aaaaaaaa.none).toEqual([])
  })

  it('breaks orders by parts within a date', () => {
    const m = opt('mmmmmmmm', '2026-11-21', 'morning')
    const e = opt('eeeeeeee', '2026-11-21', 'evening')
    const r = rankOptions([e, m], [], TODAY)
    expect(r.ranked.map(o => o.optionId)).toEqual(['mmmmmmmm', 'eeeeeeee'])
  })
})

describe('describeHero', () => {
  it('zero responses: organiser vs guest copy', () => {
    const org = makeState({ options: [A, B], people: [ORG], viewer: { personId: 'org0000001', isOrganiser: true } })
    expect(org.ranking.hero).toMatchObject({ kind: 'empty', label: 'WAITING', headline: 'No answers yet', detail: 'Share the link. The best day shows up here as people answer.' })
    const guest = makeState({ options: [A, B], people: [ORG] })
    expect(guest.ranking.hero.detail).toBe("You're first. Tap the days you can do.")
  })

  it('one response: the viewer or someone else', () => {
    const people = [ORG, person('p1', 'Sam', { aaaaaaaa: 'free' })]
    expect(makeState({ options: [A], people, viewer: { personId: 'p1' } }).ranking.hero).toMatchObject({
      kind: 'solo', headline: 'Waiting on the group', detail: 'Just you so far. The best day shows up once others answer.',
    })
    expect(makeState({ options: [A], people }).ranking.hero.detail).toBe('Sam has answered. Add yours.')
  })

  it('clear winner with cant names and unanswered count', () => {
    const people = [
      person('p1', 'Ana', { aaaaaaaa: 'free', bbbbbbbb: 'free' }),
      person('p2', 'Ben', { aaaaaaaa: 'free', bbbbbbbb: 'cant' }),
      person('p3', 'Sam', { aaaaaaaa: 'cant', bbbbbbbb: 'cant' }),
      person('p4', 'Tia', { bbbbbbbb: 'free' }),
    ]
    const hero = makeState({ options: [A, B], people }).ranking.hero
    expect(hero.kind).toBe('winner')
    expect(hero.headline).toBe('Sat 21 Nov works best')
    expect(hero.detail).toBe("2 of 4 free · Sam can't · 1 hasn't answered this day.")
  })

  it('tie broken by fewer cant is not a tie', () => {
    const people = [person('p1', 'Ana', { aaaaaaaa: 'free', bbbbbbbb: 'free' }), person('p2', 'Ben', { aaaaaaaa: 'cant', bbbbbbbb: 'free' }), person('p3', 'Cy', { aaaaaaaa: 'free', bbbbbbbb: 'cant' }), person('p4', 'Di', { bbbbbbbb: 'maybe' })]
    // A: 2 free, 1 cant, 0 maybe. B: 2 free, 1 cant, 1 maybe -> B wins on maybe.
    const s = makeState({ options: [A, B], people })
    expect(s.ranking.topOptionIds).toEqual(['bbbbbbbb'])
    expect(s.ranking.hero.kind).toBe('winner')
    const people2 = [person('p1', 'Ana', { aaaaaaaa: 'free', bbbbbbbb: 'free' }), person('p2', 'Ben', { aaaaaaaa: 'free', bbbbbbbb: 'free' }), person('p3', 'Cy', { aaaaaaaa: 'cant' })]
    const s2 = makeState({ options: [A, B], people: people2 })
    expect(s2.ranking.topOptionIds).toEqual(['bbbbbbbb'])
    expect(s2.ranking.hero.headline).toBe('Sun 22 Nov works best')
  })

  it('exact tie of 2 and of 3', () => {
    const two = [person('p1', 'Ana', { aaaaaaaa: 'free', bbbbbbbb: 'free', cccccccc: 'cant' }), person('p2', 'Ben', { aaaaaaaa: 'free', bbbbbbbb: 'free' }), person('p3', 'Cy', { aaaaaaaa: 'cant', bbbbbbbb: 'cant' })]
    const h2 = makeState({ options: [A, B, C], people: two }).ranking.hero
    expect(h2).toMatchObject({ kind: 'tie', label: "IT'S A TIE", headline: 'Tie: Sat 21 or Sun 22', detail: '2 free on each · Ethan picks.' })
    const three = [person('p1', 'Ana', { aaaaaaaa: 'free', bbbbbbbb: 'free', cccccccc: 'free' }), person('p2', 'Ben', { aaaaaaaa: 'cant', bbbbbbbb: 'cant', cccccccc: 'cant' })]
    const h3 = makeState({ options: [A, B, C], people: three, viewer: { personId: 'org0000001', isOrganiser: true } }).ranking.hero
    expect(h3.headline).toBe('Tie: Sat 21, Sun 22 or Sat 28')
    expect(h3.detail).toBe('1 free on each · You pick.')
  })

  it('tie headline uses the long form in parts mode', () => {
    const m = opt('mmmmmmmm', '2026-11-21', 'morning')
    const e = opt('eeeeeeee', '2026-11-21', 'evening')
    const people = [person('p1', 'Ana', { mmmmmmmm: 'free', eeeeeeee: 'free' }), person('p2', 'Ben', { mmmmmmmm: 'cant', eeeeeeee: 'cant' })]
    expect(makeState({ options: [m, e], people }).ranking.hero.headline).toBe('Tie: Sat 21 Nov, morning or Sat 21 Nov, evening')
  })

  it('4 or more tied is a wide tie', () => {
    const people = [person('p1', 'Ana', { aaaaaaaa: 'free', bbbbbbbb: 'free', cccccccc: 'free', dddddddd: 'free' }), person('p2', 'Ben', { aaaaaaaa: 'cant', bbbbbbbb: 'cant', cccccccc: 'cant', dddddddd: 'cant' })]
    expect(makeState({ options: [A, B, C, D], people }).ranking.hero).toMatchObject({
      kind: 'wide_tie', label: 'STILL OPEN', headline: 'No clear winner yet', detail: '4 days tied at 1 free. More answers will split it.',
    })
  })

  it("two days with everyone free is a tie with \"Everyone's free on each\"", () => {
    const people = [person('p1', 'Ana', { aaaaaaaa: 'free', bbbbbbbb: 'free' }), person('p2', 'Ben', { aaaaaaaa: 'free', bbbbbbbb: 'free' })]
    const h = makeState({ options: [A, B], people }).ranking.hero
    expect(h.kind).toBe('tie')
    expect(h.detail).toBe("Everyone's free on each · Ethan picks.")
  })

  it('everyone free on one day', () => {
    const people = [person('p1', 'Ana', { aaaaaaaa: 'free' }), person('p2', 'Ben', { aaaaaaaa: 'free' }), person('p3', 'Cy', { aaaaaaaa: 'free', bbbbbbbb: 'free' })]
    expect(makeState({ options: [A, B], people }).ranking.hero).toMatchObject({
      kind: 'everyone', label: 'BEST DAY SO FAR', headline: "Sat 21 Nov: everyone's free", detail: 'All 3 can make it.',
    })
    const two = [person('p1', 'Ana', { aaaaaaaa: 'free' }), person('p2', 'Ben', { aaaaaaaa: 'free' })]
    expect(makeState({ options: [A, B], people: two, viewer: { personId: 'p1' } }).ranking.hero.detail).toBe('Both of you can make it.')
    expect(makeState({ options: [A, B], people: two }).ranking.hero.detail).toBe('Both can make it.')
  })

  it('none_free with and without maybe', () => {
    const withMaybe = [person('p1', 'Ana', { aaaaaaaa: 'maybe' }), person('p2', 'Ben', { aaaaaaaa: 'cant' })]
    expect(makeState({ options: [A], people: withMaybe }).ranking.hero).toMatchObject({
      kind: 'none_free', label: 'STILL OPEN', headline: 'No day works yet', detail: 'Closest: Sat 21 Nov, 1 if need be.',
    })
    const none = [person('p1', 'Ana', { aaaaaaaa: 'cant' }), person('p2', 'Ben', { aaaaaaaa: 'cant' })]
    expect(makeState({ options: [A], people: none }).ranking.hero.detail).toBe("Nobody's free on any of these days so far.")
  })

  it('all options past: expired when unlocked, still chosen when locked', () => {
    const p1 = opt('pppppppp', '2026-11-01')
    const p2 = opt('qqqqqqqq', '2026-11-02')
    const people = [person('p1', 'Ana', { pppppppp: 'free', qqqqqqqq: 'cant' }), person('p2', 'Ben', { pppppppp: 'free' })]
    const org = makeState({ options: [p1, p2], people, viewer: { personId: 'org0000001', isOrganiser: true } }).ranking.hero
    expect(org).toMatchObject({ kind: 'expired', label: 'PASSED', headline: 'These days have passed', detail: 'Add new days to keep planning.', optionIds: [] })
    expect(makeState({ options: [p1, p2], people }).ranking.hero.detail).toBe('Ask Ethan for new ones.')
    const locked = makeState({
      options: [p1, p2], people,
      lock: { optionId: 'pppppppp', date: '2026-11-01', part: 'day', time: null, place: '', lockedAt: 1 },
    })
    expect(locked.ranking.hero.kind).toBe('everyone')
    expect(locked.ranking.topOptionIds).toEqual(['pppppppp'])
  })

  it('more than 3 cant shows a count; viewer phrased as "you"', () => {
    const people = [
      person('p0', 'Zoe', { aaaaaaaa: 'free' }), person('p9', 'Yan', { aaaaaaaa: 'free' }),
      person('p1', 'Ana', { aaaaaaaa: 'cant' }), person('p2', 'Ben', { aaaaaaaa: 'cant' }), person('p3', 'Cy', { aaaaaaaa: 'cant' }), person('p4', 'Di', { aaaaaaaa: 'cant' }),
    ]
    expect(makeState({ options: [A], people }).ranking.hero.detail).toBe("Only 2 of 6 free · 4 can't.")
    const few = people.filter(p => p.id !== 'p4')
    expect(makeState({ options: [A], people: few, viewer: { personId: 'p2' } }).ranking.hero.detail).toBe("Only 2 of 5 free · Ana, you and Cy can't.")
  })

  it('"1 hasn\'t" vs "2 haven\'t" answered this day', () => {
    const one = [person('p1', 'Ana', { aaaaaaaa: 'free' }), person('p2', 'Ben', { aaaaaaaa: 'free' }), person('p3', 'Cy', { bbbbbbbb: 'free' })]
    expect(makeState({ options: [A, B], people: one }).ranking.hero.detail).toBe("2 of 3 free · 1 hasn't answered this day.")
    const two = [...one, person('p4', 'Di', { bbbbbbbb: 'cant' })]
    expect(makeState({ options: [A, B], people: two }).ranking.hero.detail).toBe("2 of 4 free · 2 haven't answered this day.")
  })

  it("the 'local' overlay person counts toward R and is phrased as you", () => {
    const people = [person('p1', 'Ana', { aaaaaaaa: 'free' }), person('local', 'You', { aaaaaaaa: 'cant', bbbbbbbb: 'free' })]
    const s = makeState({ options: [A, B], people, viewer: { personId: 'local' } })
    expect(s.ranking.respondentCount).toBe(2)
    expect(s.viewer.personId).toBeNull()
    expect(s.ranking.hero.headline).toBe('Sun 22 Nov works best')
    expect(s.ranking.hero.detail).toBe("1 of 2 free · 1 hasn't answered this day.")
    const s2 = makeState({ options: [A, B], people: [...people, person('p2', 'Ben', { aaaaaaaa: 'free' })], viewer: { personId: 'local' } })
    expect(s2.ranking.hero.detail).toBe("2 of 3 free · you can't.")
  })
})

describe('tiedOptionIds (TIED badges)', () => {
  const opts = [opt('a', '2026-11-12'), opt('b', '2026-11-13'), opt('c', '2026-11-14')]

  it('marks equal answered rows when someone is free', () => {
    const s = makeState({ options: opts, people: [person('p1', 'Ana', { a: 'free', b: 'free', c: 'cant' }), person('p2', 'Bo', { a: 'free', b: 'free', c: 'cant' })] })
    expect([...tiedOptionIds(s.ranking.ranked, s.ranking.respondentCount)].sort()).toEqual(['a', 'b'])
  })

  it('no TIED badges when nobody is free on any day', () => {
    const s = makeState({ options: opts, people: [person('p1', 'Ana', { a: 'cant', b: 'cant', c: 'maybe' }), person('p2', 'Bo', { a: 'cant', b: 'cant', c: 'maybe' })] })
    expect(s.ranking.ranked.find(o => o.optionId === 'a')?.tiedWithNeighbour).toBe(true)
    expect(tiedOptionIds(s.ranking.ranked, s.ranking.respondentCount).size).toBe(0)
  })

  it('never for a lone respondent or unanswered rows', () => {
    const one = makeState({ options: opts, people: [person('p1', 'Ana', { a: 'free', b: 'free' })] })
    expect(tiedOptionIds(one.ranking.ranked, one.ranking.respondentCount).size).toBe(0)
    const two = makeState({ options: opts, people: [person('p1', 'Ana', { a: 'free' }), person('p2', 'Bo', { a: 'free' })] })
    expect([...tiedOptionIds(two.ranking.ranked, two.ranking.respondentCount)]).toEqual([])
  })
})
