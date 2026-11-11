// SharePoster: straight after creating, the one job is getting the link into the group chat; the private organiser link sits underneath.
'use client'

import { CircleAlert, Copy, KeyRound, Link as LinkIcon, Share2 } from 'lucide-react'
import { CopyButton, Disclosure, useClientValue, useToast } from '@/components/ui'
import { COBALT } from '@/lib/poster'
import { buildInviteMessage, canNativeShare, eventUrl, organiserLink, shareOrCopy } from '@/lib/share'
import type { EventState } from '@/lib/types'
import { Poster, PosterButton, PosterLink } from './Poster'

export type ShareHow = 'shared' | 'copied' | 'hidden'

export interface SharePosterProps {
  state: EventState
  origin: string
  organiserKey: string | null
  keyAtRisk: boolean
  onShared: (how: ShareHow) => void
}

export function SharePoster({ state, origin, organiserKey, keyAtRisk, onShared }: SharePosterProps) {
  const { toast } = useToast()
  const nativeShare = useClientValue(canNativeShare, false)
  const { event } = state
  const url = origin ? eventUrl(origin, event.id) : ''
  const message = buildInviteMessage(state)
  const ownerLink = origin && organiserKey ? organiserLink(origin, event.id, organiserKey) : ''

  const share = async () => {
    const r = await shareOrCopy({ title: event.title, text: message.text, url: url || eventUrl(window.location.origin, event.id) })
    if (r === 'failed') toast({ message: "Couldn't copy. Long-press the link instead.", tone: 'error' })
    if (r === 'shared' || r === 'copied') onShared(r)
  }

  return (
    <Poster colour={COBALT} accent>
      <main className="mx-auto flex w-full max-w-120 flex-1 flex-col">
        <h1 id="invite-title" tabIndex={-1} className="mt-4 text-title leading-display font-extrabold tracking-poster text-balance outline-none">
          Now send it to the group.
        </h1>

        {keyAtRisk && ownerLink && (
          <div role="alert" className="mt-4 flex flex-col items-start gap-2 text-lg leading-snug">
            <p className="flex items-start gap-2"><CircleAlert aria-hidden size={20} className="mt-0.5 shrink-0" />This browser won&apos;t remember you made this. Copy your organiser link now and keep it.</p>
            <CopyButton variant="secondary" icon={KeyRound} text={ownerLink} label="Copy organiser link" />
          </div>
        )}

        <figure className="mt-6 rounded-lg border-3 border-current p-4">
          <figcaption className="sr-only">Message preview</figcaption>
          <p className="text-h2 leading-snug font-medium text-pretty break-words whitespace-pre-line">{message.text}</p>
          <p className="mt-2 text-md break-all">{url || ' '}</p>
        </figure>

        <div className="mt-auto flex flex-col gap-2 pt-6">
          {nativeShare ? (
            <>
              <PosterButton icon={Share2} onClick={share}>Share link</PosterButton>
              <CopyButton variant="secondary" size="lg" fullWidth icon={Copy} text={message.textWithUrl(url)} label="Copy message" onCopied={() => onShared('copied')} />
            </>
          ) : (
            <CopyButton variant="accent" size="lg" fullWidth icon={Copy} text={message.textWithUrl(url)} label="Copy message" onCopied={() => onShared('copied')} className="min-h-18 text-hero font-extrabold" />
          )}
          <div className="flex flex-wrap items-center justify-between gap-x-4">
            <CopyButton variant="ghost" icon={LinkIcon} text={url} label="Copy link only" onCopied={() => toast({ message: 'Copied. Paste it in the chat.' })} className="-ml-4" />
            <PosterLink onClick={() => onShared('hidden')}>Answer mine first</PosterLink>
          </div>
          {ownerLink && !keyAtRisk && (
            <Disclosure summary={<span className="inline-flex items-center gap-2"><KeyRound aria-hidden size={18} />Manage this from another phone</span>}>
              <div className="flex flex-col items-start gap-3 pb-1">
                <p className="text-lg leading-snug text-pretty">Keep this link private. It lets you run this plan from anywhere.</p>
                <CopyButton variant="secondary" icon={KeyRound} text={ownerLink} label="Copy organiser link" />
              </div>
            </Disclosure>
          )}
        </div>
      </main>
    </Poster>
  )
}
