// Organiser component helpers: the stored organiser key and option labels (people/tally wording lives in lib/people).
'use client'

import { useSyncExternalStore } from 'react'
import { readIdentity } from '@/lib/client'
import { formatOption } from '@/lib/format'
import type { EventOption } from '@/lib/types'

function subscribeStorage(cb: () => void) {
  window.addEventListener('storage', cb)
  return () => window.removeEventListener('storage', cb)
}

// The organiser key stored on this device for the event (null on the server or when absent).
export function useOrganiserKey(eventId: string): string | null {
  return useSyncExternalStore(subscribeStorage, () => readIdentity(eventId).organiserKey, () => null)
}

export const optionLabel = (o: Pick<EventOption, 'date' | 'part'>, today: string) => formatOption(o, { today })
export const optionTiny = (o: Pick<EventOption, 'date' | 'part'>) => formatOption(o, { style: 'tiny' })
