// Event page footer: "Make your own hang" and "Privacy" links (not prefetched: the event page is the hot entry path).
import Link from 'next/link'

export function EventFooter() {
  return (
    <footer className="flex flex-wrap items-center gap-x-5 border-t border-line pt-4 pb-8 text-sm text-ink-3">
      <Link href="/" prefetch={false} className="inline-flex min-h-11 items-center rounded-sm underline-offset-4 hover:text-ink hover:underline">
        Make your own hang
      </Link>
      <Link href="/privacy" prefetch={false} className="inline-flex min-h-11 items-center rounded-sm underline-offset-4 hover:text-ink hover:underline">
        Privacy
      </Link>
    </footer>
  )
}
