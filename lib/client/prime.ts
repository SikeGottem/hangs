// primeState: paints the viewer's cached self (person id, name, role, own answers) over the anonymous server render, so a returning visitor's first paint after hydration is already theirs; the identified fetch then reconciles.
import { deriveState } from '../state'
import type { AnswerValue, EventState } from '../types'
import type { ViewerCache } from './storage'

// Returns null when there is nothing to prime: no cache, the server already identified the viewer, or the cached
// person is no longer on the event (removed). The server's copy of the viewer's answers wins unless the cache was
// written at a newer event version than the render (a stale page); cached answers for days that no longer exist drop.
export function primeState(server: EventState, cache: ViewerCache | null): EventState | null {
  if (!cache || server.viewer.personId) return null
  const me = server.people.find(p => p.id === cache.personId)
  if (!me) return null
  const optionIds = new Set(server.options.map(o => o.id))
  let answers: Record<string, AnswerValue> = me.answers
  if (cache.version > server.event.version) {
    answers = {}
    for (const [id, v] of Object.entries(cache.answers)) if (optionIds.has(id)) answers[id] = v
  }
  const people = server.people.map(p => ({
    id: p.id,
    name: p.name,
    isOrganiser: p.isOrganiser,
    answers: p.id === me.id ? { ...answers } : { ...p.answers },
  }))
  return deriveState(
    { event: server.event, options: server.options.map(o => ({ id: o.id, kind: o.kind, date: o.date, part: o.part })), people },
    {
      personId: me.id,
      isOrganiser: server.viewer.isOrganiser || cache.isOrganiser,
      personTokenRejected: false,
      organiserKeyRejected: false,
    },
    server.today,
  )
}
