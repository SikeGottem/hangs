import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-body' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', weight: ['400', '500'] })

export const metadata: Metadata = {
  title: 'hangs — plan your next hangout',
  description: 'Find when everyone is free, vote on what to do, get a plan. One link, 60 seconds.',
  icons: { icon: '/favicon.svg' },
  viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
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
      </body>
    </html>
  )
}
