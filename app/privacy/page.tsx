// Privacy page: a short, honest list of what Hangs stores, who can see it, where it lives and how long it is kept.
import type { Metadata } from 'next'
import Link from 'next/link'
import { Wordmark } from '@/components/ui/Wordmark'

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What Hangs stores, and what it does not.',
}

const POINTS = [
  "Hangs stores what you type: the hang's title, note, the days, names, answers, and the time and place once it's locked in.",
  "Anyone with a hang's link can see all of it: the title, note, place, everyone's names and answers. Only share it with people you'd tell.",
  "The link preview image and the calendar file show the title, the day and the place to anyone who has the link.",
  'Hang pages are hidden from search engines and not listed anywhere. The link is the only way in, and it is not passed on to sites you open from a hang.',
  'No accounts, no ads, no analytics and no cookies.',
  'Your device keeps a private key so you can edit your answers. We only store a scrambled (hashed) version of it.',
  'Your browser also remembers your name, the hangs you have opened and answers not yet saved, on that device only.',
  'To stop abuse we count requests per connection. We store a scrambled code made from your IP address with a secret key that changes every day, never the address itself, and delete it after about an hour (the next time anyone saves something).',
  'Hangs runs on Vercel and its data is stored with Turso, both in Tokyo, Japan. They keep their own short-lived request logs, which include IP addresses.',
  "Hangs are kept until they're deleted; nothing removes them automatically yet. The organiser can remove anyone's answers, so ask them if you want yours gone.",
]

export default function PrivacyPage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-(--col-max) flex-col px-(--gutter)">
      <header className="flex h-14 items-center">
        <Wordmark />
      </header>
      <main className="flex-1 pt-8 pb-16">
        <h1 className="font-display text-3xl leading-display font-extrabold tracking-display text-ink">Privacy</h1>
        <p className="mt-3 text-base text-ink-2">The short version, in plain words.</p>
        <ul className="mt-8 flex flex-col border-t border-line">
          {POINTS.map(p => (
            <li key={p} className="flex gap-3 border-b border-line py-4 text-base text-ink">
              <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-ink" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
        <Link
          href="/"
          className="mt-8 inline-flex min-h-11 items-center rounded-md font-semibold text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
        >
          Back to Hangs
        </Link>
      </main>
    </div>
  )
}
