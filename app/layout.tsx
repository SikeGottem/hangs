// Root layout sets fonts, metadata, and the global Hangs shell.
import type { Metadata, Viewport } from 'next'
import { JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google'
import Link from 'next/link'
import Script from 'next/script'
import './globals.css'
import { ToastHost } from '@/components/Toast'
import { ConfirmHost } from '@/components/ui/ConfirmModal'

const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', weight: ['400', '500'] })
const display = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-display', weight: ['500', '600', '700', '800'] })

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#FAF8F3',
}

export const metadata: Metadata = {
  title: {
    default: 'hangs · plan your next hangout',
    template: '%s · hangs',
  },
  description: 'Find the time, pick the thing, and get an honest headcount. One link, no signup.',
  applicationName: 'hangs',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
  },
  openGraph: {
    title: 'hangs · plan your next hangout',
    description: 'Find the time, pick the thing, and get an honest headcount. No signup.',
    type: 'website',
    siteName: 'hangs',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'hangs · plan your next hangout',
    description: 'Find the time, pick the thing, and get an honest headcount. No signup.',
  },
  appleWebApp: {
    capable: true,
    title: 'hangs',
    statusBarStyle: 'default',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${mono.variable} ${display.variable} antialiased`}>
        <header className="site-header">
          <Link href="/" className="site-brand" aria-label="Hangs home">
            <span className="site-brand-mark" aria-hidden="true"><i /><i /><i /></span>
            hangs
          </Link>
          <nav className="site-nav" aria-label="Main navigation">
            <Link href="/login">Log in</Link>
          </nav>
        </header>
        <main className="site-main">{children}</main>
        <ToastHost />
        <ConfirmHost />
        {/* Google Identity Services loads lazily for GoogleCalendarSync. */}
        <Script src="https://accounts.google.com/gsi/client" strategy="lazyOnload" />
      </body>
    </html>
  )
}
