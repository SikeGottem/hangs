// Test fixtures: tiny builders for EventCore / EventState used by the pure lib tests.
import { deriveState } from '@/lib/state'
import type { AnswerValue, DayPart, EventCore, EventInfo, EventState, LockInfo, ViewerCore } from '@/lib/types'

export const TODAY = '2026-11-10'

export function opt(id: string, date: string, part: DayPart = 'day') {
  return { id, kind: 'date' as const, date, part }
}

export function person(id: string, name: string, answers: Record<string, AnswerValue> = {}, isOrganiser = false) {
  return { id, name, isOrganiser, answers }
}

export function eventInfo(patch: Partial<EventInfo> = {}): EventInfo {
  return {
    id: 'evt0000001', title: 'Picnic at mine', note: '', mode: 'days', tz: 'Australia/Sydney',
    organiserName: 'Ethan', organiserPersonId: 'org0000001', version: 3, createdAt: 1, updatedAt: 2, lock: null,
    ...patch,
  }
}

export const NO_VIEWER: ViewerCore = { personId: null, isOrganiser: false, personTokenRejected: false, organiserKeyRejected: false }

export function makeState(opts: {
  options: ReturnType<typeof opt>[]
  people: ReturnType<typeof person>[]
  viewer?: Partial<ViewerCore>
  event?: Partial<EventInfo>
  lock?: LockInfo | null
  today?: string
}): EventState {
  const core: EventCore = {
    event: eventInfo({ ...opts.event, lock: opts.lock ?? null }),
    options: opts.options,
    people: opts.people,
  }
  return deriveState(core, { ...NO_VIEWER, ...opts.viewer }, opts.today ?? TODAY)
}
