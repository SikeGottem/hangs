// TallyBar: stacked free / maybe (hatched) / can't / no-answer bar with an icon legend; zero counts omitted.
// Built from spans only, so it can sit inside a button (e.g. a ResultRow header). Legend items never break inside
// and are spaced by a gap (no separator dots left dangling at a wrap).
import { monoAnswerLabel, tallySentence } from '@/lib/people'
import type { AnswerValue } from '@/lib/types'
import { cx } from './cx'
import { StateIcon } from './StateIcon'

export interface TallyBarProps {
  free: number; maybe: number; cant: number; none: number
  showLegend?: boolean
  showBar?: boolean   // false: counts only (e.g. while a single person has answered, a full bar says nothing)
  className?: string
}

const SEGMENT: Record<AnswerValue, string> = { free: 'bg-free', maybe: 'hatch-maybe bg-maybe-bg', cant: 'bg-cant' }
const ICON: Record<AnswerValue, string> = { free: 'text-free', maybe: 'text-maybe', cant: 'text-cant' }
const VALUES: AnswerValue[] = ['free', 'maybe', 'cant']

export function TallyBar({ free, maybe, cant, none, showLegend = true, showBar = true, className }: TallyBarProps) {
  const counts = { free, maybe, cant, none }
  const total = free + maybe + cant + none
  const pct = (n: number) => (total ? `${(n / total) * 100}%` : '0%')
  const shown = VALUES.filter(v => counts[v] > 0)
  return (
    <span className={cx('flex flex-col gap-1.5', className)}>
      {showBar && shown.length > 0 ? (
        <span role="img" aria-label={tallySentence(counts)} className="flex h-2.5 w-full overflow-hidden rounded-full bg-sunken">
          {shown.map(v => <span key={v} className={cx('h-full', SEGMENT[v])} style={{ width: pct(counts[v]) }} />)}
          {none > 0 && <span className="h-full bg-sunken" style={{ width: pct(none) }} />}
        </span>
      ) : (
        <span className="sr-only">{tallySentence(counts)}</span>
      )}
      {showLegend && shown.length > 0 && (
        <span aria-hidden className="mono-label tabular flex flex-wrap items-center gap-x-3 gap-y-0.5 text-ink-2">
          {shown.map(v => (
            <span key={v} className="inline-flex items-center gap-1 whitespace-nowrap">
              <StateIcon value={v} size={12} className={ICON[v]} />{counts[v]} {monoAnswerLabel(v)}
            </span>
          ))}
        </span>
      )}
      {showLegend && shown.length === 0 && none > 0 && (
        // Respondents exist (none counts them) but all skipped this day: not the same as "nobody has answered yet".
        <span aria-hidden className="mono-label inline-flex items-center gap-1 text-ink-3">
          <StateIcon value="none" size={12} />NOT ANSWERED BY ANYONE
        </span>
      )}
    </span>
  )
}
