import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { ToastHost } from '@/components/Toast'
import { ConfirmHost } from '@/components/ui/ConfirmModal'

const inter = Inter({ subsets: ['latin'], variable: '--font-body' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', weight: ['400', '500'] })

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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className={`${inter.variable} ${mono.variable} antialiased`}
        style={{ background: 'var(--bg)', color: 'var(--text-primary)', fontFamily: 'var(--font-body), Inter, sans-serif' }}>
        <header style={{
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <a href="/" style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
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
      </body>
    </html>
  )
}
