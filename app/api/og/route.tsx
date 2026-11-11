// Static brand Open Graph card (1200x630): used by the root layout metadata and for unknown hangs.
import { BrandCard, renderOg } from './og-kit'

export const dynamic = 'force-static'

export async function GET() {
  return renderOg(<BrandCard />, 'public, max-age=86400, s-maxage=86400')
}
