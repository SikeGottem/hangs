// Root error boundary: plain explanation plus "Try again" (reset) and "Go home".
'use client'

import { useEffect } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button, Wordmark } from '@/components/ui'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-(--col-max) flex-col px-(--gutter)">
      <header className="flex h-14 items-center">
        <Wordmark />
      </header>
      <main className="flex flex-1 flex-col justify-center pb-24">
        <h1 className="font-display text-3xl leading-display font-extrabold tracking-display text-balance text-ink">
          Something broke on our end.
        </h1>
        <p className="mt-3 max-w-md text-base text-ink-2">Your answers are safe. Try again in a moment.</p>
        {error.digest && <p className="mono-label mt-4 text-ink-3">Ref {error.digest}</p>}
        <div className="mt-8 flex flex-wrap gap-3">
          <Button variant="primary" iconLeft={RotateCcw} onClick={() => reset()}>Try again</Button>
          <Button variant="ghost" href="/">Go home</Button>
        </div>
      </main>
    </div>
  )
}
