// Event poster header: the plan's title and who's asking, with a share button and (for the organiser) the tools menu.
'use client'

import { Share2 } from 'lucide-react'
import dynamic from 'next/dynamic'
import { IconButton, useToast } from '@/components/ui'
import { buildInviteMessage, buildLockedMessage, eventUrl, lockedEventUrl, shareOrCopy } from '@/lib/share'
import type { EventState } from '@/lib/types'

// The organiser's tools (and all their sheets) load only for the organiser; guests never download them.
const OrganiserMenu = dynamic(() => import('@/components/organiser/OrganiserMenu').then(m => m.OrganiserMenu), {
  ssr: false,
  loading: () => <span aria-hidden className="inline-block size-11" />,
})

export interface TopBarProps {
  state: EventState
  origin: string
  onState: (next: EventState) => void
  onShared?: (how: 'shared' | 'copied') => void // planning organiser: after a share or copy (owns the toast)
  kicker?: string                               // replaces "{name}'s asking"
}

export function TopBar({ state, origin, onState, onShared, kicker }: TopBarProps) {
  const { toast } = useToast()
  const { event, viewer } = state

  const share = async () => {
    const o = origin || window.location.origin
    const lock = event.lock
    const msg = lock ? buildLockedMessage(state) : buildInviteMessage(state)
    const url = lock ? lockedEventUrl(o, event.id, lock.lockedAt) : eventUrl(o, event.id)
    const r = await shareOrCopy({ title: event.title, text: msg.text, url })
    if (r === 'failed') toast({ message: "Couldn't copy. Long-press the link instead.", tone: 'error' })
    if (r !== 'shared' && r !== 'copied') return
    if (!lock && onShared) onShared(r)
    else if (r === 'copied') toast({ message: 'Copied. Paste it in the chat.' })
  }

  const asking = kicker ?? (viewer.isOrganiser ? 'Your plan' : `${event.organiserName}'s asking`)

  return (
    <header className="flex items-start justify-between gap-2">
      <div className="min-w-0 py-0.5">
        <h1 id="invite-title" tabIndex={-1} className="line-clamp-2 text-lg leading-tight font-extrabold break-words outline-none">
          {event.title}
        </h1>
        <p className="text-lg leading-tight">
          {asking}
          {event.note && !event.lock ? <span className="break-words">{` · ${event.note}`}</span> : null}
        </p>
      </div>
      <div className="-mt-1 -mr-2.5 flex shrink-0 items-center">
        <IconButton icon={Share2} label="Share this plan" onClick={share} />
        {viewer.isOrganiser && <OrganiserMenu state={state} onState={onState} />}
      </div>
    </header>
  )
}
