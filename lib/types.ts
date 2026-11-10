// Shared Hangs v2 types: API shapes, event state, ranking and client identity.

export type AnswerValue = 'free' | 'maybe' | 'cant'
export type DayPart = 'day' | 'morning' | 'afternoon' | 'evening'
export type EventMode = 'days' | 'parts'
export type Vocabulary = 'plan' | 'rsvp'
export type ErrorCode = 'bad_request' | 'invalid_json' | 'payload_too_large' | 'unauthorized' | 'forbidden' | 'not_found'
  | 'name_taken' | 'event_full' | 'too_many_options' | 'last_option' | 'locked_option' | 'not_locked'
  | 'cannot_remove_organiser' | 'rate_limited' | 'server_error' | 'network'   // 'network' is client-only
export interface ApiError { code: ErrorCode; message: string; status: number; retryAfter?: number }   // retryAfter: seconds, from Retry-After
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError }
export interface AnswerUpdate { optionId: string; value: AnswerValue | null }

export interface EventOption { id: string; kind: 'date'; date: string; part: DayPart; isPast: boolean }
export interface LockInfo { optionId: string; date: string; part: DayPart; time: string | null; place: string; lockedAt: number }
export interface EventInfo {
  id: string; title: string; note: string; mode: EventMode; tz: string
  organiserName: string; organiserPersonId: string
  version: number                          // monotonic; the etag
  createdAt: number; updatedAt: number; lock: LockInfo | null
}
export interface Person {
  id: string; name: string; isOrganiser: boolean
  answers: Record<string, AnswerValue>     // optionId -> value; absent = no answer
  answeredCount: number                    // keys in answers that exist in options
}
export interface OptionTally {             // in `tallies`: over RESPONDENTS only (people with answeredCount > 0)
  optionId: string
  free: string[]; maybe: string[]; cant: string[]; none: string[]   // personIds, each sorted by name
}
export interface RankedOption {
  optionId: string; date: string; part: DayPart; isPast: boolean
  free: number; maybe: number; cant: number; none: number
  rank: number                             // 1-based; equal (isPast,free,cant,maybe) share a rank
  tiedWithNeighbour: boolean
}
export type HeroKind = 'expired' | 'empty' | 'solo' | 'none_free' | 'wide_tie' | 'tie' | 'everyone' | 'winner'
export interface Hero { kind: HeroKind; label: string; headline: string; detail: string; optionIds: string[] }
export interface Ranking { respondentCount: number; ranked: RankedOption[]; topOptionIds: string[]; hero: Hero }
export interface Viewer {
  personId: string | null; name: string | null; isOrganiser: boolean
  personTokenRejected: boolean; organiserKeyRejected: boolean   // header sent but no match
}
export interface EventState {
  event: EventInfo
  options: EventOption[]                   // chronological, PART_ORDER within a date
  people: Person[]                         // organiser first, then by createdAt
  tallies: Record<string, OptionTally>
  ranking: Ranking
  attendance: OptionTally | null           // locked option tallied over ALL people (silent joiners land in `none`); null when unlocked
  viewer: Viewer
  today: string                            // YYYY-MM-DD in event.tz
  etag: string                             // `${event.version}-${today}` (see etagFor)
  limits: { maxPeople: 150; maxOptions: 62 }
}
// `state` is null only when the write committed but the follow-up read failed; the client refetches.
export interface CreateEventResponse { id: string; organiserKey: string; personToken: string; personId: string; state: EventState | null }
export interface JoinResponse { personId: string; personToken: string; state: EventState | null }
export interface SaveAnswersResponse { state: EventState; skippedOptionIds: string[] }
export interface EventSummary {            // for metadata/OG (D)
  id: string; version: number; title: string; note: string; organiserName: string; mode: EventMode
  optionDates: string[]                    // distinct, chronological
  respondentCount: number
  leading: { label: string; free: number } | null  // only when hero.kind is 'winner' | 'everyone'
  lock: { label: string; timeLabel: string | null; place: string; going: number; maybe: number; lockedAt: number } | null
}
// core inputs to deriveState
export interface EventCore { event: EventInfo; options: Omit<EventOption, 'isPast'>[]; people: Omit<Person, 'answeredCount'>[] }
export interface ViewerCore { personId: string | null; isOrganiser: boolean; personTokenRejected: boolean; organiserKeyRejected: boolean }
export type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error' | 'offline'   // 'unsaved' = answers held, no person yet
export interface Identity { personToken: string | null; personId: string | null; organiserKey: string | null }
export interface MyEvent { id: string; title: string; role: 'organiser' | 'guest'; at: number }
export type NextAction = 'name' | 'calendar' | 'add_days' | 'share' | 'done' | 'lock' | null
