// AddToCalendarSheet: .ics link (iPhone, Mac, Outlook) and Google Calendar link, with an in-app browser hint.
'use client'

import { CircleAlert, Download, ExternalLink, Link as LinkIcon, type LucideIcon } from 'lucide-react'
import { CopyButton, Sheet, cx, useInAppBrowser, useOrigin } from '@/components/ui'
import { googleCalendarUrl } from '@/lib/ics'
import { eventUrl, lockedEventUrl } from '@/lib/share'
import type { EventState } from '@/lib/types'

export interface AddToCalendarSheetProps {
  open: boolean
  onClose: () => void
  state: EventState
}

function LinkRow({ href, icon: Icon, title, sub, external }: { href: string; icon: LucideIcon; title: string; sub: string; external?: boolean }) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={cx(
        'flex min-h-14 w-full items-center gap-3 rounded-lg border border-line-strong bg-surface px-4 py-2 text-left text-ink',
        'transition duration-(--dur-fast) ease-(--ease-out) hover:bg-hover active:scale-[0.97]',
      )}
    >
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sunken">
        <Icon aria-hidden size={18} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-md font-semibold">{title}</span>
        <span className="text-sm text-ink-3">{sub}</span>
      </span>
    </a>
  )
}

export function AddToCalendarSheet({ open, onClose, state }: AddToCalendarSheetProps) {
  const origin = useOrigin()
  const inApp = useInAppBrowser()
  const { id, version, lock } = state.event

  const ics = (
    <LinkRow key="ics" href={`/api/events/${id}/ics?v=${version}`} icon={Download} title="iPhone, Mac or Outlook" sub="Opens your calendar app" />
  )
  const google = (
    <LinkRow
      key="google"
      href={googleCalendarUrl(state, { url: eventUrl(origin, id) })}
      icon={ExternalLink}
      title="Google Calendar"
      sub="Opens in a new tab"
      external
    />
  )

  return (
    <Sheet open={open} onClose={onClose} title="Add to calendar">
      {open && (
      <div className="flex flex-col gap-3 pt-1">
        {inApp && (
          <div className="flex flex-col gap-3 rounded-lg bg-sunken p-3">
            <p className="flex items-start gap-2 text-sm text-ink-2">
              <CircleAlert aria-hidden size={16} className="mt-0.5 shrink-0" />
              <span>Calendar files don&apos;t open inside Messenger or Instagram. Open this page in Safari or Chrome to add it.</span>
            </p>
            {origin && (
              <CopyButton
                text={lock ? lockedEventUrl(origin, id, lock.lockedAt) : eventUrl(origin, id)}
                label="Copy link"
                icon={LinkIcon}
                className="self-start"
              />
            )}
          </div>
        )}
        {inApp ? [google, ics] : [ics, google]}
      </div>
      )}
    </Sheet>
  )
}
