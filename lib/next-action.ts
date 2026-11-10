// nextAction: picks the single element that gets the yellow accent on the event page.
import type { AnswerValue, EventState, NextAction } from './types'

export interface NextActionInput {
  state: EventState
  needsName: boolean
  shared: boolean
  doneTapped: boolean
  myAnswerCount: number
  myLockedAnswer: AnswerValue | null
}

export function nextAction({ state, needsName, shared, doneTapped, myAnswerCount, myLockedAnswer }: NextActionInput): NextAction {
  if (needsName) return 'name'
  if (state.event.lock) {
    return myLockedAnswer === 'free' || myLockedAnswer === 'maybe' ? 'calendar' : null
  }
  const { viewer, ranking } = state
  if (ranking.hero.kind === 'expired' && viewer.isOrganiser) return 'add_days'
  if (viewer.isOrganiser && !shared) return 'share'
  // Once two or more people have answered, locking is the organiser's job: it outranks their own "Done".
  if (viewer.isOrganiser && ranking.respondentCount >= 2) return 'lock'
  if (myAnswerCount > 0 && !doneTapped) return 'done'
  return null
}
