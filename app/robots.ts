// robots.txt: crawl the public pages; keep crawlers out of the API except the link-preview images. Event pages stay
// crawlable so their noindex (meta tag and X-Robots-Tag) is seen; they are never listed anywhere.
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/api/og', '/api/events/*/og'],
      disallow: ['/api/'],
    },
  }
}
