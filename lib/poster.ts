// Poster colours: every date gets one stable full-screen colour (and its readable text colour) from the token palette.
import { BRAND } from './brand'
import { parseDate } from './dates'

export interface PosterColour {
  bg: string                 // CSS colour token
  fg: string
  hex: string                // the same background as a hex, for the browser's theme colour and OG images
  fgHex: string
}

const token = (name: string, hex: string, fgHex: string): PosterColour => ({
  bg: `var(--color-${name})`,
  fg: `var(--color-on-${name})`,
  hex,
  fgHex,
})

export const POSTER_COLOURS: PosterColour[] = [
  token('day-1', BRAND.day1, BRAND.white),
  token('day-2', BRAND.day2, BRAND.ink),
  token('day-3', BRAND.day3, BRAND.white),
  token('day-4', BRAND.day4, BRAND.white),
  token('day-5', BRAND.day5, BRAND.white),
]

export const COBALT = POSTER_COLOURS[0]
export const NIGHT = token('night', BRAND.night, BRAND.white)

// Based on the date itself, so a day keeps its colour when other days are added or removed.
export function dayColour(date: string): PosterColour {
  const { year, month0, day } = parseDate(date)
  const n = Math.floor(Date.UTC(year, month0, day) / 86_400_000)
  return POSTER_COLOURS[((n % POSTER_COLOURS.length) + POSTER_COLOURS.length) % POSTER_COLOURS.length]
}
