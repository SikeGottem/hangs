// Root layout: font (Bricolage Grotesque), global tokens, site metadata, the hash-secret capture and the toast provider.
import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque } from 'next/font/google'
import type { ReactNode } from 'react'
import { ToastProvider } from '@/components/ui/Toast'
import { BRAND } from '@/lib/brand'
import { HASH_CAPTURE_SCRIPT } from '@/lib/hash-capture'
import { siteUrl } from '@/lib/site'
import './globals.css'

const bricolage = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage', display: 'swap' })

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
  themeColor: BRAND.day1,
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-AU" className={bricolage.variable}>
      <body className="bg-bg font-sans text-ink antialiased">
        <script dangerouslySetInnerHTML={{ __html: HASH_CAPTURE_SCRIPT }} />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
