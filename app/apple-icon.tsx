// Apple touch icon (180x180): the ink square with three accent bars, colours from BRAND.
import { ImageResponse } from 'next/og'
import { BRAND } from '@/lib/brand'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  const bars = [45, 82, 59]
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: BRAND.ink }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, transform: 'rotate(10deg)' }}>
          {bars.map(h => (
            <div key={h} style={{ width: 20, height: h, borderRadius: 10, background: BRAND.accent }} />
          ))}
        </div>
      </div>
    ),
    size,
  )
}
