// Next.js config: security headers (CSP; noindex and no-referrer on event pages and the API) and runtime flags for Hangs v2.
import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV === 'development'

// No nonces: Next's inline bootstrap scripts need 'unsafe-inline'; React needs 'unsafe-eval' in dev only. Fonts are
// self-hosted by next/font and every request goes to this origin, so 'self' covers fonts and fetches. It blocks
// loading or sending anything to another origin; with 'unsafe-inline' it is not an XSS defence for the secrets in
// localStorage (React escaping is).
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

// Do not enable cacheComponents: route segment `dynamic` config depends on it being off.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      // Event pages and the API: never indexed, and the event URL (the only read capability) is never sent as a
      // referrer, even by a future link that forgets rel="noreferrer". Later entries override the defaults above.
      ...['/h/:path*', '/api/:path*'].map(source => ({
        source,
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      })),
    ]
  },
}

export default nextConfig
