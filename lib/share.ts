// Share links and prefilled group-chat messages, plus native share / clipboard fallbacks. Callers pass the origin.
import { formatOption, formatTime } from './format'
import type { EventState } from './types'
import { isInAppBrowser } from './ua'

export const eventUrl = (origin: string, id: string) => `${origin}/h/${id}`
export const lockedEventUrl = (origin: string, id: string, lockedAt: number) => `${origin}/h/${id}?l=${lockedAt}`
export const organiserLink = (origin: string, id: string, key: string) => `${origin}/h/${id}#k=${key}`
export const personalLink = (origin: string, id: string, token: string) => `${origin}/h/${id}#p=${token}`

export interface ShareMessage { text: string; textWithUrl: (url: string) => string }

const message = (text: string): ShareMessage => ({ text, textWithUrl: (url: string) => `${text}\n${url}` })

// A note goes on its own line (it can be long or end in "?"), so it never runs into the question.
export function buildInviteMessage(state: EventState): ShareMessage {
  const { title, note } = state.event
  if (!note) return message(`${title}: which days can you do? Tap yours, takes 20 seconds, no sign-up.`)
  return message(`${title}\n${note}\nWhich days can you do? Tap yours, takes 20 seconds, no sign-up.`)
}

export function buildNudgeMessage(state: EventState): ShareMessage {
  const { title } = state.event
  const R = state.ranking.respondentCount
  const hero = state.ranking.hero
  const best = state.options.find(o => o.id === hero.optionIds[0])
  if ((hero.kind === 'winner' || hero.kind === 'everyone') && best) {
    return message(`${title}: ${R} of us have answered and ${formatOption(best, { today: state.today })} is looking best. Still need yours:`)
  }
  return message(`${title}: ${R} of us have answered. Still need yours:`)
}

export function buildLockedMessage(state: EventState): ShareMessage {
  const { title, lock } = state.event
  if (!lock) return buildInviteMessage(state)
  const when = formatOption(lock, { today: state.today })
  const time = lock.time ? formatTime(lock.time) : 'time TBC'
  const place = lock.place ? ` at ${lock.place}` : ''
  return message(`${title} is on: ${when}, ${time}${place}. You in?`)
}

// Locked-day nudge for people who haven't answered the locked day yet.
export function buildLockedNudgeMessage(state: EventState): ShareMessage {
  const { title, lock } = state.event
  const a = state.attendance
  if (!lock || !a) return buildNudgeMessage(state)
  const going = `${a.free.length} going`
  const waiting = a.none.length > 0 ? `, ${a.none.length} still to answer` : ''
  return message(`${title} is on ${formatOption(lock, { today: state.today })}. ${going}${waiting}. You in?`)
}

// After the organiser adds days: asks people who already answered to check the new ones.
export function buildNewDaysMessage(state: EventState): ShareMessage {
  return message(`${state.event.title}: I added new days, can you check?`)
}

export async function copyText(s: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(s)
      return true
    }
  } catch {
    // fall through to the textarea fallback
  }
  try {
    if (typeof document === 'undefined') return false
    const ta = document.createElement('textarea')
    ta.value = s
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.left = '0'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, s.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

export function canNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function' && !isInAppBrowser()
}

// Native share sheet when available (URL only in `url`), otherwise copies the text with the URL on its own line,
// exactly as the message preview and "Copy message" show it.
export async function shareOrCopy({ title, text, url }: { title: string; text: string; url: string }): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  if (canNativeShare()) {
    try {
      await navigator.share({ title, text, url })
      return 'shared'
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return 'cancelled'
      // e.g. NotAllowedError: fall back to copying
    }
  }
  return (await copyText(message(text).textWithUrl(url))) ? 'copied' : 'failed'
}
