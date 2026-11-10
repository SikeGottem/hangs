// Root layout: fonts (Jakarta / Inter / JetBrains Mono), global tokens, site metadata, the hash-secret capture and the toast provider.
import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google'
import type { ReactNode } from 'react'
import { ToastProvider } from '@/components/ui/Toast'
import { BRAND } from '@/lib/brand'
import { HASH_CAPTURE_SCRIPT } from '@/lib/hash-capture'
import { siteUrl } from '@/lib/site'
import './globals.css'

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-jakarta', display: 'swap' })
const inter = Inter({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-inter', display: 'swap' })
const jbmono = JetBrains_Mono({ subsets: ['latin'], weight: ['500'], variable: '--font-jbmono', display: 'swap' })

// metadataBase is the configured site URL; only when none is set (local runs) does it follow the request's host.
export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL(await siteUrl()),
    title: { default: "Hangs: find the day everyone's free", template: '%s · Hangs' },
    description: "Pick some days, send one link, see who's free. No sign-up, works on any phone.",
    openGraph: { type: 'website', images: [{ url: '/api/og', width: 1200, height: 630, alt: 'Hangs' }] },
    twitter: { card: 'summary_large_image', images: ['/api/og'] },
  }
}

export const viewport: Viewport = {
  themeColor: BRAND.bg,
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-AU" className={`${jakarta.variable} ${inter.variable} ${jbmono.variable}`}>
      <body className="bg-bg font-sans text-ink antialiased">
        <script dangerouslySetInnerHTML={{ __html: HASH_CAPTURE_SCRIPT }} />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
