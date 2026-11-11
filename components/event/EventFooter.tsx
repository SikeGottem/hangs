// Event page footer: "Make your own hang" and "Privacy" links (not prefetched: the event page is the hot entry path).
import Link from 'next/link'
import { cx } from '@/components/ui'

export function EventFooter({ className }: { className?: string }) {
  return (
    <footer className={cx('flex flex-wrap items-center gap-x-5 text-md', className)}>
      <Link href="/" prefetch={false} className="inline-flex min-h-11 items-center rounded-sm underline underline-offset-4">
        Make your own hang
      </Link>
      <Link href="/privacy" prefetch={false} className="inline-flex min-h-11 items-center rounded-sm underline underline-offset-4">
        Privacy
      </Link>
    </footer>
  )
}
