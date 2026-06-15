// Root layout — sets fonts (self-hosted via next/font), metadata, and global shell.
import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import { ToastHost } from '@/components/Toast'
import { ConfirmHost } from '@/components/ui/ConfirmModal'

const inter = Inter({ subsets: ['latin'], variable: '--font-body' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', weight: ['400', '500'] })
// Plus Jakarta Sans is self-hosted at build time — no runtime Google request.
const display = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-display', weight: ['500', '600', '700', '800'] })

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#FAF8F3',
}

export const metadata: Metadata = {
  title: {
    default: 'hangs — plan your next hangout',
    template: '%s · hangs',
  },
  description: 'Find when everyone is free, vote on what to do, get a plan. One link, 60 seconds.',
  applicationName: 'hangs',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
  },
  openGraph: {
    title: 'hangs — plan your next hangout',
    description: 'One link. Everyone fills in when they\'re free. You get a plan.',
    type: 'website',
    siteName: 'hangs',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'hangs — plan your next hangout',
    description: 'One link. Everyone fills in when they\'re free. You get a plan.',
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
      <head />
      <body className={`${inter.variable} ${mono.variable} ${display.variable} antialiased`}
        style={{ background: 'var(--bg)', color: 'var(--text-primary)', fontFamily: 'var(--font-body), Inter, sans-serif' }}>
        <header style={{
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <a href="/" style={{
            fontFamily: 'var(--font-display)',
            fontSize: '22px',
            fontWeight: 800,
            color: 'var(--text-primary)',
            textDecoration: 'none',
            letterSpacing: '-0.03em',
          }}>
            hangs
          </a>
        </header>
        <main style={{ minHeight: '100vh' }}>{children}</main>
        <ToastHost />
        <ConfirmHost />
        {/* Google Identity Services — loaded once, used by GoogleCalendarSync. */}
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
      </body>
    </html>
  )
}
