// Not-found page for bad /h/{id} links and unknown routes: says what happened and offers "Make your own".
import type { Metadata } from 'next'
import { CircleDashed } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Wordmark } from '@/components/ui/Wordmark'

export const metadata: Metadata = {
  title: { absolute: 'Link not found · Hangs' },
  robots: { index: false, follow: false },
}

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-(--col-max) flex-col px-(--gutter)">
      <header className="flex h-14 items-center">
        <Wordmark />
      </header>
      <main className="flex flex-1 flex-col justify-center pb-24">
        <div
          aria-hidden
          className="mb-8 flex size-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line-strong text-ink-3"
        >
          <CircleDashed size={28} strokeWidth={2} />
          <span className="mono-label">No day</span>
        </div>
        <h1 className="font-display text-3xl leading-display font-extrabold tracking-display text-balance text-ink">
          This link doesn&apos;t go anywhere.
        </h1>
        <p className="mt-3 max-w-md text-base text-ink-2">
          It might have a typo, or the link was never made. Ask whoever sent it.
        </p>
        <div className="mt-8">
          <Button href="/" variant="secondary">Make your own</Button>
        </div>
      </main>
    </div>
  )
}
