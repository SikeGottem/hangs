// One ranked result: rank (shared by equal rows; none for unanswered days), TIED / PAST tags, date and tally bar; expands to show who is free / if need be / can't / no answer.
'use client'

import { ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'
import { cx, MonoLabel, PersonChip, StateIcon, TallyBar } from '@/components/ui'
import { formatOption } from '@/lib/format'
import { monoAnswerLabel } from '@/lib/people'
import type { AnswerValue, OptionTally, Person, RankedOption } from '@/lib/types'

export interface ResultRowProps {
  item: RankedOption
  tally: OptionTally | undefined
  people: ReadonlyMap<string, Person>
  viewerIds: ReadonlySet<string>
  today: string
  tied: boolean                          // shares its score with a neighbouring row (shown as TIED)
  showBar: boolean                       // false while fewer than two people have answered
}

const GROUPS: Array<{ key: AnswerValue | 'none'; label: string }> = [
  ...(['free', 'maybe', 'cant'] as const).map(key => ({ key, label: monoAnswerLabel(key) })),
  { key: 'none', label: 'NO ANSWER' },
]

export function ResultRow({ item, tally, people, viewerIds, today, tied, showBar }: ResultRowProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const label = formatOption(item, { today })
  const unanswered = item.free + item.maybe + item.cant === 0

  return (
    <li className="rounded-lg border border-line bg-surface">
      {/* The whole header, tally bar included, is the tap target; a two-column grid aligns the bar under the date. */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(o => !o)}
        className="grid w-full grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1 rounded-lg px-3 pt-3 pb-3 text-left transition-colors duration-(--dur-fast) hover:bg-hover"
      >
        {/* The ranking's own rank: equal rows share a number (1, 2, 2, 4). Days nobody has answered get no number. */}
        <span className="mono-label tabular text-ink-3">{unanswered ? '–' : String(item.rank).padStart(2, '0')}</span>
        <span className="flex min-h-6 min-w-0 items-center gap-2">
          {/* Wraps instead of clipping: "Sat 21 Nov, afternoon" plus a tag must stay readable at 320 px. */}
          <span className={cx('min-w-0 flex-1 font-display text-h3 leading-tight font-bold tracking-display text-pretty', item.isPast || unanswered ? 'text-ink-3' : 'text-ink')}>
            {label}
          </span>
          {tied && <span className="mono-label shrink-0 rounded-sm bg-sunken px-1 text-ink-2">TIED</span>}
          {item.isPast && <span className="mono-label shrink-0 rounded-sm bg-sunken px-1 text-ink-3">PAST</span>}
          <ChevronDown aria-hidden size={18} className={cx('shrink-0 text-ink-3 transition-transform duration-(--dur)', open && 'rotate-180')} />
        </span>
        <TallyBar free={item.free} maybe={item.maybe} cant={item.cant} none={item.none} showBar={showBar} className="col-start-2" />
      </button>
      {open && (
        <div id={panelId} className="flex flex-col gap-3 border-t border-line px-3 pt-3 pb-4">
          {tally && GROUPS.map(g => {
            const ids = tally[g.key]
            if (ids.length === 0) return null
            return (
              <div key={g.key} className="flex flex-col gap-1.5">
                <MonoLabel as="p" tone="ink-2" className="tabular">
                  <StateIcon value={g.key} size={14} />
                  {g.label} ({ids.length})
                </MonoLabel>
                <ul className="flex flex-wrap gap-1.5">
                  {ids.map(pid => {
                    const p = people.get(pid)
                    if (!p) return null
                    return (
                      <li key={pid} className="max-w-full">
                        <PersonChip
                          name={p.name}
                          value={g.key === 'none' ? undefined : g.key}
                          isYou={viewerIds.has(pid)}
                          isOrganiser={p.isOrganiser}
                        />
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </li>
  )
}
