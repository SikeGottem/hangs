// Pure ranking of candidate options and the "best day" hero sentence (isomorphic, used by server and client).
import { formatOption, listJoin, PART_ORDER, plural } from './format'
import type { AnswerValue, DayPart, EventOption, Hero, OptionTally, RankedOption } from './types'

export interface RankInputOption { id: string; date: string; part: DayPart }
export interface RankInputPerson { id: string; name: string; answers: Record<string, AnswerValue> }

export interface RankResult {
  respondents: RankInputPerson[]
  ranked: RankedOption[]
  tallies: Record<string, OptionTally>
  topOptionIds: string[]
}

const byName = (people: Map<string, RankInputPerson>) => (a: string, b: string) =>
  (people.get(a)?.name ?? '').localeCompare(people.get(b)?.name ?? '', 'en') || a.localeCompare(b)

const sameScore = (a: RankedOption, b: RankedOption) =>
  a.isPast === b.isPast && a.free === b.free && a.cant === b.cant && a.maybe === b.maybe

export function rankOptions(
  options: Array<RankInputOption | Omit<EventOption, 'isPast'> | EventOption>,
  people: RankInputPerson[],
  today: string,
): RankResult {
  const optionIds = new Set(options.map(o => o.id))
  const respondents = people.filter(p => Object.keys(p.answers).some(id => optionIds.has(id)))
  const index = new Map(respondents.map(p => [p.id, p]))
  const cmpName = byName(index)

  const tallies: Record<string, OptionTally> = {}
  const scored: RankedOption[] = options.map(o => {
    const t: OptionTally = { optionId: o.id, free: [], maybe: [], cant: [], none: [] }
    for (const p of respondents) {
      const v = p.answers[o.id]
      if (v === 'free' || v === 'maybe' || v === 'cant') t[v].push(p.id)
      else t.none.push(p.id)
    }
    t.free.sort(cmpName); t.maybe.sort(cmpName); t.cant.sort(cmpName); t.none.sort(cmpName)
    tallies[o.id] = t
    return {
      optionId: o.id, date: o.date, part: o.part, isPast: o.date < today,
      free: t.free.length, maybe: t.maybe.length, cant: t.cant.length, none: t.none.length,
      rank: 0, tiedWithNeighbour: false,
    }
  })

  const ranked = [...scored].sort((a, b) =>
    (Number(a.isPast) - Number(b.isPast))
    || (b.free - a.free)
    || (a.cant - b.cant)
    || (b.maybe - a.maybe)
    || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
    || (PART_ORDER[a.part] - PART_ORDER[b.part]),
  )
  ranked.forEach((o, i) => {
    o.rank = i > 0 && sameScore(o, ranked[i - 1]) ? ranked[i - 1].rank : i + 1
  })
  ranked.forEach((o, i) => {
    o.tiedWithNeighbour = (i > 0 && sameScore(o, ranked[i - 1])) || (i < ranked.length - 1 && sameScore(o, ranked[i + 1]))
  })

  let candidates = ranked.filter(o => !o.isPast)
  if (candidates.length === 0) candidates = ranked
  const top = candidates[0]
  const topOptionIds = top
    ? candidates.filter(o => o.free === top.free && o.cant === top.cant && o.maybe === top.maybe).map(o => o.optionId)
    : []

  return { respondents, ranked, tallies, topOptionIds }
}

// Rows that get a TIED badge in the results list: every group of equal, answered, upcoming rows, once at least two
// people have answered and someone is free on some upcoming day (rows sharing "nobody free" are not news).
export function tiedOptionIds(ranked: RankedOption[], respondentCount: number): Set<string> {
  const ids = new Set<string>()
  if (respondentCount < 2 || !ranked.some(o => !o.isPast && o.free > 0)) return ids
  for (const o of ranked) {
    if (!o.isPast && o.free + o.maybe + o.cant > 0 && o.tiedWithNeighbour) ids.add(o.optionId)
  }
  return ids
}

export interface HeroContext {
  viewerPersonId: string | null
  organiserName: string
  viewerIsOrganiser: boolean
  today: string
  allPast: boolean
  locked: boolean
}

export interface HeroInput {
  respondentCount: number
  ranked: RankedOption[]
  topOptionIds: string[]
  tallies: Record<string, OptionTally>
}

export function describeHero(ranking: HeroInput, people: Array<{ id: string; name: string }>, ctx: HeroContext): Hero {
  const R = ranking.respondentCount
  const nameOf = (id: string) => (id === ctx.viewerPersonId ? 'you' : people.find(p => p.id === id)?.name ?? 'Someone')
  const L = (o: { date: string; part: DayPart }) => formatOption(o, { today: ctx.today })
  const T = (o: { date: string; part: DayPart }) => formatOption(o, { today: ctx.today, style: 'tiny' })
  const ids = ranking.topOptionIds
  const topGroup = ids.map(id => ranking.ranked.find(o => o.optionId === id)).filter((o): o is RankedOption => !!o)
  const top = topGroup[0]

  if (ctx.allPast && !ctx.locked) {
    return {
      kind: 'expired', label: 'PASSED', headline: 'These days have passed',
      detail: ctx.viewerIsOrganiser ? 'Add new days to keep planning.' : `Ask ${ctx.organiserName} for new ones.`,
      optionIds: [],
    }
  }
  if (R === 0 || !top) {
    return {
      kind: 'empty', label: 'WAITING', headline: 'No answers yet',
      detail: ctx.viewerIsOrganiser ? 'Share the link. The best day shows up here as people answer.' : "You're first. Tap the days you can do.",
      optionIds: ids,
    }
  }
  if (R === 1) {
    const only = ranking.tallies[top.optionId]
    const respondentId = only ? [...only.free, ...only.maybe, ...only.cant, ...only.none][0] : undefined
    const isViewer = respondentId !== undefined && respondentId === ctx.viewerPersonId
    const name = respondentId ? people.find(p => p.id === respondentId)?.name ?? 'Someone' : 'Someone'
    return {
      kind: 'solo', label: 'WAITING', headline: 'Waiting on the group',
      detail: isViewer ? 'Just you so far. The best day shows up once others answer.' : `${name} has answered. Add yours.`,
      optionIds: ids,
    }
  }
  if (top.free === 0) {
    return {
      kind: 'none_free', label: 'STILL OPEN', headline: 'No day works yet',
      detail: top.maybe > 0 ? `Closest: ${L(top)}, ${top.maybe} if need be.` : "Nobody's free on any of these days so far.",
      optionIds: ids,
    }
  }
  if (topGroup.length >= 4) {
    return {
      kind: 'wide_tie', label: 'STILL OPEN', headline: 'No clear winner yet',
      detail: `${topGroup.length} days tied at ${top.free} free. More answers will split it.`,
      optionIds: ids,
    }
  }
  if (topGroup.length >= 2) {
    const fmt = topGroup.some(o => o.part !== 'day') ? L : T
    const labels = topGroup.map(fmt)
    const headline = labels.length === 2
      ? `Tie: ${labels[0]} or ${labels[1]}`
      : `Tie: ${labels[0]}, ${labels[1]} or ${labels[2]}`
    const freePart = top.free === R ? "Everyone's free on each" : `${top.free} free on each`
    return {
      kind: 'tie', label: "IT'S A TIE", headline,
      detail: `${freePart} · ${ctx.viewerIsOrganiser ? 'You pick' : `${ctx.organiserName} picks`}.`,
      optionIds: ids,
    }
  }
  if (top.free === R) {
    let detail = `All ${R} can make it.`
    if (R === 2) {
      const viewerIn = ctx.viewerPersonId !== null && (ranking.tallies[top.optionId]?.free ?? []).includes(ctx.viewerPersonId)
      detail = viewerIn ? 'Both of you can make it.' : 'Both can make it.'
    }
    return { kind: 'everyone', label: 'BEST DAY SO FAR', headline: `${L(top)}: everyone's free`, detail, optionIds: ids }
  }

  const tally = ranking.tallies[top.optionId]
  const cantIds = tally?.cant ?? []
  // Under half free: still the best day, but the words must not sound like a recommendation.
  const hedged = top.free * 2 < R
  const fragments = [hedged ? `Only ${top.free} of ${R} free` : `${top.free} of ${R} free`]
  if (cantIds.length > 0) {
    fragments.push(cantIds.length <= 3 ? `${listJoin(cantIds.map(nameOf))} can't` : `${cantIds.length} can't`)
  }
  if (top.maybe > 0) fragments.push(`${top.maybe} if need be`)
  if (top.none > 0) fragments.push(`${top.none} ${plural(top.none, "hasn't", "haven't")} answered this day`)
  return {
    kind: 'winner',
    label: 'BEST DAY SO FAR',
    headline: hedged ? `Best so far: ${L(top)}` : `${L(top)} works best`,
    detail: `${fragments.join(' · ')}.`,
    optionIds: ids,
  }
}

export function bestDaySentence(hero: Hero): string {
  return `${hero.headline}. ${hero.detail}`
}
