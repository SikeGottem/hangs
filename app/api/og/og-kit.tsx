// Shared Open Graph image kit: fonts, the brand card, and the per-event planning/locked cards (Satori, flexbox only, colours from lib/poster).
import 'server-only'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import type { ReactElement, ReactNode } from 'react'
import { parseDate } from '@/lib/dates'
import { dateParts, formatDate, formatTime, PART_LABELS, weekdayLong } from '@/lib/format'
import { COBALT, dayColour, type PosterColour } from '@/lib/poster'
import type { EventState } from '@/lib/types'

export const OG_SIZE = { width: 1200, height: 630 } as const

type OgFont = { name: string; data: Buffer; weight: 500 | 800; style: 'normal' }

let fontsPromise: Promise<OgFont[]> | null = null

// Fonts are read once per process; a failed read clears the memo so the next request retries.
function loadFonts(): Promise<OgFont[]> {
  if (!fontsPromise) {
    // Literal join(process.cwd(), '...') calls so Next's file tracing bundles the fonts with the function.
    fontsPromise = Promise.all([
      readFile(join(process.cwd(), 'assets/fonts/bricolage-grotesque-latin-800-normal.woff')),
      readFile(join(process.cwd(), 'assets/fonts/bricolage-grotesque-latin-500-normal.woff')),
    ]).then(([heavy, medium]) => [
      { name: 'Bricolage', data: heavy, weight: 800, style: 'normal' },
      { name: 'Bricolage', data: medium, weight: 500, style: 'normal' },
    ] as OgFont[])
    fontsPromise.catch(() => { fontsPromise = null })
  }
  return fontsPromise
}

const FONT = 'Bricolage'

// Renders fully (fonts, Satori, PNG) before returning, so any font or render failure rejects here, where the caller's
// try/catch can fall back, instead of surfacing while the response streams.
export async function renderOg(node: ReactElement, cacheControl: string): Promise<Response> {
  const fonts = await loadFonts()
  const png = await new ImageResponse(node, { ...OG_SIZE, fonts }).arrayBuffer()
  return new Response(png, { status: 200, headers: { 'content-type': 'image/png', 'cache-control': cacheControl } })
}

// Characters the bundled Latin WOFF subsets can draw (fontsource "latin" unicode-range).
const LATIN_SUBSET = /^[\u0020-\u007E\u00A0-\u00FF\u0131\u0152\u0153\u02BB\u02BC\u02C6\u02DA\u02DC\u0304\u0308\u0329\u2000-\u206F\u20AC\u2122\u2191\u2193\u2212\u2215]*$/
const PICTOGRAPHIC = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\uFE0E\uFE0F\u200D\u20E3]/gu

// Text for the card: emoji removed (Satori would fetch them from a CDN), and null when anything left is outside the
// Latin subset (CJK, Cyrillic, Vietnamese...), so the caller can use neutral copy instead of drawing missing-glyph boxes.
export function ogText(s: string): string | null {
  const t = s.replace(PICTOGRAPHIC, '').replace(/\s+/g, ' ').trim()
  return t && LATIN_SUBSET.test(t) ? t : null
}

// ---------- pieces ----------

function Wordmark({ color }: { color: string }) {
  return <div style={{ display: 'flex', fontFamily: FONT, fontWeight: 800, fontSize: 40, letterSpacing: -1.6, color }}>hangs</div>
}

// A full-bleed poster in one colour, like the app itself.
function Sheet({ colour, children }: { colour: PosterColour; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', padding: 64, background: colour.hex, color: colour.fgHex, fontFamily: FONT }}>
      {children}
    </div>
  )
}

function clampTitle(size: number) {
  return {
    display: 'block', fontWeight: 800, fontSize: size, lineHeight: 1.02, letterSpacing: -0.04 * size,
    paddingBottom: Math.round(size * 0.12), marginBottom: -Math.round(size * 0.12),
    lineClamp: 2, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
  } as const
}

const oneLine = { display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' } as const

function DayTile({ day, weekday, filled, colour }: { day: string; weekday: string; filled: boolean; colour: PosterColour }) {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 124, height: 124, borderRadius: 20,
        border: `5px solid ${colour.fgHex}`, background: filled ? colour.fgHex : 'transparent', color: filled ? colour.hex : colour.fgHex,
      }}
    >
      <div style={{ display: 'flex', fontSize: 24, fontWeight: 500 }}>{weekday}</div>
      <div style={{ display: 'flex', fontSize: 58, fontWeight: 800, lineHeight: 1, letterSpacing: -2 }}>{day}</div>
    </div>
  )
}

// ---------- brand card ----------

export function BrandCard() {
  return (
    <Sheet colour={COBALT}>
      <Wordmark color={COBALT.fgHex} />
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', fontSize: 128, fontWeight: 800, lineHeight: 0.98, letterSpacing: -5 }}>
        Find the day everyone’s free.
      </div>
      <div style={{ display: 'flex', fontSize: 36, fontWeight: 500 }}>One link. No sign-up. Any phone.</div>
    </Sheet>
  )
}

// ---------- event cards ----------

export interface OgView {
  title: string
  organiserName: string
  dates: string[]                       // distinct, chronological
  respondentCount: number
  leading: { date: string; label: string } | null
  lock: { date: string; dateLabel: string; whenLabel: string; place: string; going: number } | null
}

// Pure: turns a public EventState into exactly what the card shows.
export function ogView(s: EventState): OgView {
  const hero = s.ranking.hero
  const top = (hero.kind === 'winner' || hero.kind === 'everyone') ? s.options.find(o => o.id === hero.optionIds[0]) : undefined
  const lock = s.event.lock
  return {
    title: ogText(s.event.title) ?? (lock ? 'It’s on' : 'Pick your days'),
    organiserName: ogText(s.event.organiserName) ?? 'Someone',
    dates: [...new Set(s.options.map(o => o.date))],
    respondentCount: s.ranking.respondentCount,
    leading: top
      ? { date: top.date, label: top.part === 'day' ? formatDate(top.date, { today: s.today }) : `${formatDate(top.date, { today: s.today })}, ${top.part}` }
      : null,
    lock: lock
      ? {
          date: lock.date,
          dateLabel: formatDate(lock.date, { today: s.today }),
          whenLabel: lock.time ? formatTime(lock.time) : lock.part === 'day' ? 'Time TBC' : `${PART_LABELS[lock.part]}, time TBC`,
          place: ogText(lock.place) ?? '',
          going: s.attendance?.free.length ?? 0,
        }
      : null,
  }
}

export function EventCard({ view }: { view: OgView }) {
  return view.lock ? <LockedCard view={view} lock={view.lock} /> : <PlanningCard view={view} />
}

function PlanningCard({ view }: { view: OgView }) {
  const maxTiles = 7
  const overflow = view.dates.length > maxTiles
  const shown = overflow ? view.dates.slice(0, maxTiles - 1) : view.dates
  const more = view.dates.length - shown.length
  const size = [...view.title].length > 26 ? 84 : 116
  return (
    <Sheet colour={COBALT}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ ...oneLine, fontSize: 38, fontWeight: 500, maxWidth: 800 }}>{`${view.organiserName} is finding a day`}</div>
        <Wordmark color={COBALT.fgHex} />
      </div>
      <div style={{ display: 'flex', flex: 1, alignItems: 'center' }}>
        <div style={clampTitle(size)}>{view.title}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {shown.map(d => {
          const p = dateParts(d)
          return <DayTile key={d} day={p.day} weekday={p.weekday.charAt(0) + p.weekday.slice(1).toLowerCase()} filled={view.leading?.date === d} colour={COBALT} />
        })}
        {more > 0 && <div style={{ display: 'flex', fontSize: 52, fontWeight: 800, marginLeft: 8 }}>{`+${more}`}</div>}
      </div>
    </Sheet>
  )
}

function LockedCard({ view, lock }: { view: OgView; lock: NonNullable<OgView['lock']> }) {
  const colour = dayColour(lock.date)
  const when = lock.place ? `${lock.whenLabel} · ${lock.place}` : lock.whenLabel
  const { day } = parseDate(lock.date)
  return (
    <Sheet colour={colour}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ ...oneLine, fontSize: 44, fontWeight: 800, maxWidth: 800 }}>{view.title}</div>
        <Wordmark color={colour.fgHex} />
      </div>
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 44 }}>
        <div style={{ display: 'flex', fontSize: 290, fontWeight: 800, lineHeight: 0.9, letterSpacing: -16 }}>{String(day)}</div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', fontSize: 72, fontWeight: 800, letterSpacing: -2.5 }}>{weekdayLong(lock.date)}</div>
          <div style={{ ...oneLine, fontSize: 44, fontWeight: 500, marginTop: 8 }}>{when}</div>
        </div>
      </div>
      <div style={{ display: 'flex', fontSize: 38, fontWeight: 500 }}>{lock.going > 0 ? `It’s on. ${lock.going} going.` : 'It’s on. Are you in?'}</div>
    </Sheet>
  )
}
