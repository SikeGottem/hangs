// deriveState: builds the full EventState (options, tallies, ranking, hero, attendance, viewer) from core rows.
// Used by the server repository and by the client's optimistic overlay (temporary viewer person id 'local').
import { PART_ORDER } from './format'
import { describeHero, rankOptions } from './rank'
import type { EventCore, EventOption, EventState, OptionTally, Person, ViewerCore } from './types'

export const LOCAL_PERSON_ID = 'local'

// The validator for GET /api/events/[id]: the version plus today's date in the event tz, so a tab left open
// past midnight gets fresh state (isPast, ranking, hero) even when nothing was written.
export const etagFor = (version: number, today: string) => `${version}-${today}`

function sortOptions<T extends { date: string; part: EventOption['part'] }>(options: T[]): T[] {
  return [...options].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || PART_ORDER[a.part] - PART_ORDER[b.part])
}

export function deriveState(core: EventCore, viewer: ViewerCore, today: string): EventState {
  const options: EventOption[] = sortOptions(core.options).map(o => ({ ...o, isPast: o.date < today }))
  const optionIds = new Set(options.map(o => o.id))

  const people: Person[] = core.people
    .map((p, i) => ({ p, i }))
    .sort((a, b) => Number(b.p.isOrganiser) - Number(a.p.isOrganiser) || a.i - b.i)
    .map(({ p }) => {
      const answers: Person['answers'] = {}
      for (const [id, v] of Object.entries(p.answers)) if (optionIds.has(id)) answers[id] = v
      return { id: p.id, name: p.name, isOrganiser: p.isOrganiser, answers, answeredCount: Object.keys(answers).length }
    })

  const { respondents, ranked, tallies, topOptionIds } = rankOptions(options, people, today)
  const lock = core.event.lock
  const hero = describeHero(
    { respondentCount: respondents.length, ranked, topOptionIds, tallies },
    people,
    {
      viewerPersonId: viewer.personId,
      organiserName: core.event.organiserName,
      viewerIsOrganiser: viewer.isOrganiser,
      today,
      allPast: options.length > 0 && options.every(o => o.isPast),
      locked: !!lock,
    },
  )

  let attendance: OptionTally | null = null
  if (lock) {
    const t: OptionTally = { optionId: lock.optionId, free: [], maybe: [], cant: [], none: [] }
    const sorted = [...people].sort((a, b) => a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id))
    for (const p of sorted) {
      const v = p.answers[lock.optionId]
      if (v) t[v].push(p.id)
      else t.none.push(p.id)
    }
    attendance = t
  }

  const isLocal = viewer.personId === LOCAL_PERSON_ID
  const viewerPerson = viewer.personId && !isLocal ? people.find(p => p.id === viewer.personId) : undefined

  return {
    event: core.event,
    options,
    people,
    tallies,
    ranking: { respondentCount: respondents.length, ranked, topOptionIds, hero },
    attendance,
    viewer: {
      personId: viewerPerson ? viewerPerson.id : null,
      name: viewerPerson ? viewerPerson.name : null,
      isOrganiser: viewer.isOrganiser,
      personTokenRejected: viewer.personTokenRejected,
      organiserKeyRejected: viewer.organiserKeyRejected,
    },
    today,
    etag: etagFor(core.event.version, today),
    limits: { maxPeople: 150, maxOptions: 62 },
  }
}
