// Shared Open Graph image kit: fonts, the brand card, and the per-event planning/locked cards (Satori, flexbox only, colours from BRAND).
import 'server-only'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import type { ReactElement, ReactNode } from 'react'
import { BRAND } from '@/lib/brand'
import { dateParts, formatDate, formatTime, PART_LABELS } from '@/lib/format'
import type { EventState } from '@/lib/types'

export const OG_SIZE = { width: 1200, height: 630 } as const

type OgFont = { name: string; data: Buffer; weight: 500 | 800; style: 'normal' }

let fontsPromise: Promise<OgFont[]> | null = null

// Fonts are read once per process; a failed read clears the memo so the next request retries.
function loadFonts(): Promise<OgFont[]> {
  if (!fontsPromise) {
    // Literal join(process.cwd(), '...') calls so Next's file tracing bundles the fonts with the function.
    fontsPromise = Promise.all([
      readFile(join(process.cwd(), 'assets/fonts/plus-jakarta-sans-latin-800-normal.woff')),
      readFile(join(process.cwd(), 'assets/fonts/inter-latin-500-normal.woff')),
      readFile(join(process.cwd(), 'assets/fonts/jetbrains-mono-latin-500-normal.woff')),
    ]).then(([jakarta, inter, mono]) => [
      { name: 'Jakarta', data: jakarta, weight: 800, style: 'normal' },
      { name: 'Inter', data: inter, weight: 500, style: 'normal' },
      { name: 'Mono', data: mono, weight: 500, style: 'normal' },
    ] as OgFont[])
    fontsPromise.catch(() => { fontsPromise = null })
  }
  return fontsPromise
}

const DISPLAY = 'Jakarta'
const BODY = 'Inter'
const MONO = 'Mono'

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

// The app-icon mark (ink square, three accent bars) beside the lowercase wordmark.
function Brand({ scale = 1 }: { scale?: number }) {
  const box = 52 * scale
  const bars = [16, 30, 21]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 * scale }}>
      <div style={{ display: 'flex', width: box, height: box, borderRadius: 14 * scale, background: BRAND.ink, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4 * scale, transform: 'rotate(10deg)' }}>
          {bars.map(h => (
            <div key={h} style={{ display: 'flex', width: 6 * scale, height: h * scale, borderRadius: 3 * scale, background: BRAND.accent }} />
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', fontFamily: DISPLAY, fontSize: 40 * scale, letterSpacing: -1.6 * scale, color: BRAND.ink }}>hangs</div>
    </div>
  )
}

function Mono({ children, size = 22, color = BRAND.ink2 }: { children: string; size?: number; color?: string }) {
  return (
    <div style={{ display: 'flex', fontFamily: MONO, fontSize: size, letterSpacing: size * 0.08, textTransform: 'uppercase', color, whiteSpace: 'nowrap' }}>
      {children}
    </div>
  )
}

function Pill({ children, tone }: { children: string; tone: 'accent' | 'sunken' }) {
  const accent = tone === 'accent'
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', height: 48, padding: '0 20px', borderRadius: 12,
        background: accent ? BRAND.accent : BRAND.sunken, color: accent ? BRAND.onAccent : BRAND.ink2,
        fontFamily: MONO, fontSize: 22, letterSpacing: 1.8, textTransform: 'uppercase',
        ...(accent ? { transform: 'rotate(-2deg)' } : {}),
      }}
    >
      {children}
    </div>
  )
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', background: BRAND.bg, padding: 40 }}>
      <div
        style={{
          display: 'flex', flexDirection: 'column', width: '100%', height: '100%', padding: 56,
          background: BRAND.surface, borderRadius: 40, border: `2px solid ${BRAND.line}`,
        }}
      >
        {children}
      </div>
    </div>
  )
}

function Title({ text, sizes }: { text: string; sizes: { short: number; long: number; threshold: number } }) {
  const size = [...text].length > sizes.threshold ? sizes.long : sizes.short
  return (
    <div
      style={{
        display: 'block', fontFamily: DISPLAY, fontSize: size, lineHeight: 1.1, letterSpacing: -0.025 * size,
        // Bottom padding keeps descenders (g, y, p) inside the clamp's overflow box.
        paddingBottom: Math.round(size * 0.12), marginBottom: -Math.round(size * 0.12),
        color: BRAND.ink, lineClamp: 2, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
      }}
    >
      {text}
    </div>
  )
}

// Clamp to one line with an ellipsis (place names, organiser names).
const oneLine = { display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' } as const

// ---------- brand card ----------

const DEMO_DAYS = [
  { w: 'FRI', d: '20', m: 'Nov', on: false },
  { w: 'SAT', d: '21', m: 'Nov', on: true },
  { w: 'SUN', d: '22', m: 'Nov', on: false },
  { w: 'SAT', d: '28', m: 'Nov', on: false },
]

export function BrandCard() {
  return (
    <Frame>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Brand />
        <Mono>One link · no sign-up · any phone</Mono>
      </div>
      <div style={{ display: 'flex', flex: 1, alignItems: 'center' }}>
        <div style={{ display: 'flex', fontFamily: DISPLAY, fontSize: 84, lineHeight: 1.04, letterSpacing: -2.1, color: BRAND.ink, maxWidth: 820 }}>
          Find the day everyone’s free.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14 }}>
        {DEMO_DAYS.map(t => (
          <DayTile key={t.w + t.d} weekday={t.w} day={t.d} month={t.m} highlight={t.on} />
        ))}
      </div>
    </Frame>
  )
}

function DayTile({ weekday, day, month, highlight = false }: { weekday: string; day: string; month: string; highlight?: boolean }) {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        width: 112, height: 120, borderRadius: 20,
        background: highlight ? BRAND.accent : BRAND.sunken, color: highlight ? BRAND.onAccent : BRAND.ink,
      }}
    >
      <Mono size={18} color={highlight ? BRAND.onAccent : BRAND.ink3}>{weekday}</Mono>
      <div style={{ display: 'flex', fontFamily: DISPLAY, fontSize: 48, lineHeight: 1.05, letterSpacing: -1 }}>{day}</div>
      <div style={{ display: 'flex', fontFamily: BODY, fontSize: 20, color: highlight ? BRAND.onAccent : BRAND.ink2 }}>{month}</div>
    </div>
  )
}

function MoreTile({ n }: { n: number }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', width: 112, height: 120, borderRadius: 20,
        border: `2px dashed ${BRAND.lineStrong}`, fontFamily: DISPLAY, fontSize: 40, color: BRAND.ink2,
      }}
    >
      {`+${n}`}
    </div>
  )
}

// ---------- event cards ----------

export interface OgView {
  title: string
  organiserName: string
  dates: string[]                       // distinct, chronological
  respondentCount: number
  leading: { date: string; label: string } | null
  lock: { dateLabel: string; whenLabel: string; place: string; going: number } | null
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
  const maxTiles = view.leading ? 4 : 6
  const overflow = view.dates.length > maxTiles
  const shown = overflow ? view.dates.slice(0, maxTiles - 1) : view.dates
  const more = view.dates.length - shown.length
  return (
    <Frame>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Brand />
        <Pill tone="sunken">Pick your days</Pill>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 10 }}>
        <Title text={view.title} sizes={{ short: 76, long: 60, threshold: 28 }} />
        <div style={{ ...oneLine, fontFamily: BODY, fontSize: 32, color: BRAND.ink2 }}>{`${view.organiserName} is finding a day`}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          {shown.map(d => {
            const p = dateParts(d)
            return <DayTile key={d} weekday={p.weekday} day={p.day} month={p.month} highlight={view.leading?.date === d} />
          })}
          {more > 0 && <MoreTile n={more} />}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, minWidth: 0 }}>
          {view.respondentCount > 0 && <Mono>{`${view.respondentCount} answered`}</Mono>}
          {view.leading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
              <Mono size={20} color={BRAND.ink3}>Leading</Mono>
              <div style={{ display: 'flex', fontFamily: DISPLAY, fontSize: view.leading.label.length > 14 ? 30 : 40, letterSpacing: -0.8, color: BRAND.ink, whiteSpace: 'nowrap' }}>
                {view.leading.label}
              </div>
            </div>
          )}
        </div>
      </div>
    </Frame>
  )
}

function LockedCard({ view, lock }: { view: OgView; lock: NonNullable<OgView['lock']> }) {
  const when = lock.place ? `${lock.whenLabel} · ${lock.place}` : lock.whenLabel
  return (
    <Frame>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Brand />
        <Pill tone="accent">{'It’s on'}</Pill>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 4 }}>
        <Title text={view.title} sizes={{ short: 56, long: 44, threshold: 30 }} />
        <div style={{ display: 'flex', fontFamily: DISPLAY, fontSize: lock.dateLabel.length > 10 ? 92 : 112, lineHeight: 1.05, letterSpacing: -3, color: BRAND.ink, whiteSpace: 'nowrap' }}>
          {lock.dateLabel}
        </div>
        <div style={{ ...oneLine, fontFamily: BODY, fontSize: 36, color: BRAND.ink2 }}>{when}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
        <Mono color={BRAND.ink}>{lock.going > 0 ? `${lock.going} going` : 'Are you in?'}</Mono>
        <div style={{ ...oneLine, fontFamily: MONO, fontSize: 22, letterSpacing: 1.8, textTransform: 'uppercase', color: BRAND.ink3, maxWidth: 560, textAlign: 'right' }}>
          {`${view.organiserName}’s hang`}
        </div>
      </div>
    </Frame>
  )
}
