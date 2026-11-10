// Server-only canonical site origin for metadata, OG images and ICS links: configured URL first, else the request's own host.
import 'server-only'
import { headers } from 'next/headers'

const trimSlash = (s: string) => s.replace(/\/+$/, '')
const HOST = /^[a-z0-9.-]+(:\d{1,5})?$|^\[[0-9a-f:]+\](:\d{1,5})?$/i

// NEXT_PUBLIC_SITE_URL, else the Vercel production alias, else this deployment's own Vercel URL. Null when none is set.
export function configuredSiteUrl(): string | null {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) return trimSlash(explicit)
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (prod) return `https://${trimSlash(prod)}`
  const deployment = process.env.VERCEL_URL?.trim()
  if (deployment) return `https://${trimSlash(deployment)}`
  return null
}

let warned = false

// The origin a request arrived on (local runs on any port), used only when nothing is configured.
function originFrom(h: Headers): string | null {
  const host = (h.get('x-forwarded-host') ?? h.get('host'))?.split(',')[0].trim()
  if (!host || !HOST.test(host)) return null
  const fwd = h.get('x-forwarded-proto')?.split(',')[0].trim()
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) || /\.(localhost|test)(:\d+)?$/.test(host)
  const proto = fwd === 'http' || fwd === 'https' ? fwd : local ? 'http' : 'https'
  return `${proto}://${host}`
}

// Absolute origin for links that leave the page (og:url, og:image, ICS). Pass the Request in route handlers; in
// metadata it reads the incoming headers. Only falls back to the request host when no site URL is configured.
export async function siteUrl(req?: Request): Promise<string> {
  const configured = configuredSiteUrl()
  if (configured) return configured
  if (process.env.VERCEL && !warned) {
    warned = true
    console.error('[hangs] No site URL configured (NEXT_PUBLIC_SITE_URL / VERCEL_PROJECT_PRODUCTION_URL); using the request host for absolute links.')
  }
  // Not wrapped in try/catch: during prerendering headers() signals Next to render dynamically, which must propagate.
  const h = req ? req.headers : await headers()
  return originFrom(h) ?? 'http://localhost:3000'
}
