// Organiser share state: message preview + one accent share action (Share link, or Copy message where there is no
// native share), the private organiser link, and a collapsed row once shared. A share, a copied message or Hide
// collapses it; "Copy link only" just copies.
'use client'

import { Check, CircleAlert, Copy, KeyRound, Link as LinkIcon, Share2, X } from 'lucide-react'
import { Button, Card, CopyButton, cx, Disclosure, IconButton, MonoLabel, useClientValue, useToast } from '@/components/ui'
import { buildInviteMessage, canNativeShare, eventUrl, organiserLink, shareOrCopy } from '@/lib/share'
import type { EventState } from '@/lib/types'

export interface ShareCardProps {
  state: EventState
  origin: string
  organiserKey: string | null
  shared: boolean
  accent: boolean          // nextAction === 'share'
  keyAtRisk: boolean       // this browser didn't keep the organiser key: show the organiser link up front
  onShared: (how: ShareHow) => void // collapse (markShared) after a share, a copied message or Hide; owns the toast
  className?: string
}

export type ShareHow = 'shared' | 'copied' | 'hidden'

export function ShareCard({ state, origin, organiserKey, shared, accent, keyAtRisk, onShared, className }: ShareCardProps) {
  const { toast } = useToast()
  const nativeShare = useClientValue(canNativeShare, false)

  const { event } = state
  const url = origin ? eventUrl(origin, event.id) : ''
  const message = buildInviteMessage(state)
  const ownerLink = origin && organiserKey ? organiserLink(origin, event.id, organiserKey) : ''

  const copiedMessage = () => onShared('copied')
  const copiedLink = () => toast({ message: 'Copied. Paste it in the chat.' })

  const share = async () => {
    const r = await shareOrCopy({ title: event.title, text: message.text, url: url || eventUrl(window.location.origin, event.id) })
    if (r === 'failed') toast({ message: "Couldn't copy. Long-press the link instead.", tone: 'error' })
    if (r === 'shared' || r === 'copied') onShared(r)
  }

  const ownerLinkBlock = ownerLink && (
    <div className="flex flex-col items-start gap-3 pb-1">
      <p className="text-sm text-pretty text-ink-2">Keep this private. Open it on another phone or laptop to manage this plan.</p>
      <CopyButton variant="secondary" icon={KeyRound} text={ownerLink} label="Copy organiser link" />
    </div>
  )

  // This browser can't keep the key (blocked storage, some in-app browsers): the link is the only way back in.
  const riskNotice = keyAtRisk && ownerLink && (
    <div role="alert" className="flex flex-col gap-3 rounded-lg bg-danger-bg p-3">
      <p className="flex items-start gap-2 text-sm text-pretty text-ink">
        <CircleAlert aria-hidden size={16} className="mt-0.5 shrink-0 text-danger" />
        <span>This browser won&apos;t remember that you made this plan. Copy your organiser link now and keep it, or you&apos;ll lose the organiser tools when you close this tab.</span>
      </p>
      <CopyButton variant="secondary" icon={KeyRound} text={ownerLink} label="Copy organiser link" className="self-start" />
    </div>
  )

  if (shared) {
    return (
      <div className={cx(className, 'flex flex-col gap-2')}>
        {riskNotice}
        {/* Label on its own line, both actions on one line below, all starting on the same left edge. */}
        <section aria-label="Share link" className="flex flex-col gap-1 rounded-lg border border-line bg-surface px-1 pt-2.5 pb-1">
          <MonoLabel as="p" tone="ink-2" icon={Check} className="px-4">LINK SHARED</MonoLabel>
          <div className="flex flex-wrap items-center">
            <Button variant="ghost" iconLeft={Share2} onClick={share}>Share again</Button>
            {ownerLink && <CopyButton variant="ghost" icon={KeyRound} text={ownerLink} label="Organiser link" />}
          </div>
        </section>
      </div>
    )
  }

  const mainVariant = accent ? 'accent' : 'primary'

  return (
    <Card as="section" padding="lg" className={cx(className, 'relative flex flex-col gap-4')}>
      <div className="flex flex-col gap-1.5 pr-10">
        <MonoLabel as="p" tone="ink-2" icon={Check}>LINK READY</MonoLabel>
        <h2 className="font-display text-xl leading-display font-bold tracking-display text-balance text-ink">
          Now drop it in the group chat
        </h2>
      </div>
      <IconButton icon={X} label="Hide" onClick={() => onShared('hidden')} className="absolute top-2 right-2" />

      {riskNotice}

      <figure className="flex flex-col gap-2 rounded-lg bg-sunken p-3">
        <figcaption className="sr-only">Message preview</figcaption>
        <p className="text-md text-pretty whitespace-pre-line text-ink break-words">{message.text}</p>
        <p className="font-mono text-xs break-all text-ink-2">{url || ' '}</p>
      </figure>

      {nativeShare ? (
        // Side by side once both labels fit; stacked on narrow phones so "Copy message" never truncates.
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
          <Button variant={mainVariant} iconLeft={Share2} fullWidth onClick={share}>Share link</Button>
          <CopyButton variant="secondary" icon={Copy} fullWidth text={message.textWithUrl(url)} label="Copy message" onCopied={copiedMessage} />
        </div>
      ) : (
        // No share sheet (desktop, Messenger / Instagram): copying the previewed message is the one next step.
        <CopyButton variant={mainVariant} icon={Copy} fullWidth text={message.textWithUrl(url)} label="Copy message" onCopied={copiedMessage} />
      )}
      <CopyButton variant="ghost" icon={LinkIcon} text={url} label="Copy link only" onCopied={copiedLink} className="self-center" />

      {ownerLink && !keyAtRisk && (
        <Disclosure
          className="border-t border-line pt-2"
          summary={<span className="inline-flex items-center gap-2"><KeyRound aria-hidden size={16} className="text-ink-2" />Your organiser link</span>}
        >
          {ownerLinkBlock}
        </Disclosure>
      )}
    </Card>
  )
}
