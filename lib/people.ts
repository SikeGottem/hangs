// People and tally wording shared by the event, organiser and locked views (viewer checks, name lists, tally lines).
import { ANSWER_LABELS, listJoin } from './format'
import { LOCAL_PERSON_ID } from './state'
import type { AnswerValue, EventState, Vocabulary } from './types'

const VALUES: AnswerValue[] = ['free', 'maybe', 'cant']

// Mono (uppercase) answer label, e.g. "IF NEED BE" or "GOING".
export const monoAnswerLabel = (v: AnswerValue, vocab: Vocabulary = 'plan') => ANSWER_LABELS[vocab][v].toUpperCase()

// True for the viewer's own person row or the temporary 'local' overlay person.
export function isViewer(state: EventState, id: string): boolean {
  return id === LOCAL_PERSON_ID || (!!state.viewer.personId && id === state.viewer.personId)
}

// Display names for person ids; the viewer reads as "you".
export function namesFor(state: EventState, ids: string[]): string[] {
  const byId = new Map(state.people.map(p => [p.id, p.name]))
  return ids.map(id => (isViewer(state, id) ? 'you' : byId.get(id) ?? 'Someone'))
}

// "Sam", "Sam and you", or "4 people" when more than three.
export function whoPhrase(state: EventState, ids: string[]): string {
  return ids.length > 3 ? `${ids.length} people` : listJoin(namesFor(state, ids))
}

// ["6 FREE", "1 IF NEED BE", "1 CAN'T"] (or GOING / MAYBE / OUT), zero counts omitted. For wrapping layouts.
export function tallyParts(t: Record<AnswerValue, number>, vocab: Vocabulary = 'plan'): string[] {
  return VALUES.filter(v => t[v] > 0).map(v => `${t[v]} ${monoAnswerLabel(v, vocab)}`)
}

// "6 FREE · 1 IF NEED BE · 1 CAN'T" (or GOING / MAYBE / OUT), zero counts omitted.
export function tallyLine(t: Record<AnswerValue, number>, vocab: Vocabulary = 'plan'): string {
  return tallyParts(t, vocab).join(' · ')
}

// "6 free, 1 if need be, 2 can't, 1 no answer" for screen readers; "No answers yet" when all zero.
export function tallySentence(t: Record<AnswerValue | 'none', number>, vocab: Vocabulary = 'plan'): string {
  const parts = VALUES.filter(v => t[v] > 0).map(v => `${t[v]} ${ANSWER_LABELS[vocab][v].toLowerCase()}`)
  if (t.none > 0) parts.push(`${t.none} no answer`)
  return parts.length ? parts.join(', ') : 'No answers yet'
}
