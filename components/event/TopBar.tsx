// Event page top bar: wordmark, a share button (invite or locked message) and the organiser tools menu.
'use client'

import { Share2 } from 'lucide-react'
import { OrganiserMenu } from '@/components/organiser'
import { IconButton, useToast, Wordmark } from '@/components/ui'
import { buildInviteMessage, buildLockedMessage, eventUrl, lockedEventUrl, shareOrCopy } from '@/lib/share'
import type { EventState } from '@/lib/types'

export interface TopBarProps {
  state: EventState
  origin: string
  onState: (next: EventState) => void
  onShared?: (how: 'shared' | 'copied') => void // planning organiser: after a share or copy (collapses the share card, owns the toast)
}

export function TopBar({ state, origin, onState, onShared }: TopBarProps) {
  const { toast } = useToast()

  const share = async () => {
    const o = origin || window.location.origin
    const { event } = state
    const lock = event.lock
    const msg = lock ? buildLockedMessage(state) : buildInviteMessage(state)
    const url = lock ? lockedEventUrl(o, event.id, lock.lockedAt) : eventUrl(o, event.id)
    const r = await shareOrCopy({ title: event.title, text: msg.text, url })
    if (r === 'failed') toast({ message: "Couldn't copy. Long-press the link instead.", tone: 'error' })
    if (r !== 'shared' && r !== 'copied') return
    if (!lock && onShared) onShared(r)
    else if (r === 'copied') toast({ message: 'Copied. Paste it in the chat.' })
  }

  return (
    <header className="flex h-14 items-center justify-between gap-2">
      <Wordmark size="sm" prefetch={false} />
      <div className="-mr-2.5 flex items-center">
        <IconButton icon={Share2} label="Share this plan" onClick={share} />
        {state.viewer.isOrganiser && <OrganiserMenu state={state} onState={onState} />}
      </div>
    </header>
  )
}
