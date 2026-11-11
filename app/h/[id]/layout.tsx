// Event layout: per-hang link-preview metadata (title, description, OG image) that switches between planning and locked; renders children as-is.
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { summarizeEvent } from '@/lib/events'
import { isEventId } from '@/lib/ids'
import { loadEventForPage } from './load'
import { eventPreviewCopy, pageUrl } from './preview-copy'

const ROBOTS = { index: false, follow: false } as const

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  // Shares the page's per-request cache (and read-miss limiter), so this adds no DB read.
  const state = isEventId(id) ? await loadEventForPage(id) : null
  const summary = state ? summarizeEvent(state) : null
  if (!summary) return { title: { absolute: 'Hangs' }, robots: ROBOTS, referrer: 'no-referrer' }

  const { ogTitle, description } = eventPreviewCopy(summary)
  const image = { url: `/api/events/${id}/og?v=${summary.version}`, width: 1200, height: 630, alt: summary.title }
  // Locked shares go out as /h/{id}?l={lockedAt}; og:url must match it, or Facebook/Messenger/Instagram resolve the
  // share to the bare URL's cached planning unfurl.
  const url = pageUrl(id, summary.lock?.lockedAt ?? null)
  return {
    title: summary.title,
    description,
    robots: ROBOTS,
    referrer: 'no-referrer',
    alternates: { canonical: url },
    openGraph: { type: 'website', siteName: 'Hangs', url, title: ogTitle, description, images: [image] },
    twitter: { card: 'summary_large_image', title: ogTitle, description, images: [image] },
  }
}

export default function EventLayout({ children }: { children: ReactNode }) {
  return children
}
