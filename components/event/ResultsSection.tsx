// "All days, best first": the ranked result list (first 8, then Show all) or an empty state when nobody has answered.
'use client'

import { ChevronDown, CircleDashed } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, Card } from '@/components/ui'
import { plural } from '@/lib/format'
import { tiedOptionIds } from '@/lib/rank'
import type { EventState, Person } from '@/lib/types'
import { ResultRow } from './ResultRow'

export interface ResultsSectionProps {
  state: EventState
  viewerIds: ReadonlySet<string>
  showHeading?: boolean   // false inside the locked "See all days" disclosure
  className?: string
}

const INITIAL = 8

export function ResultsSection({ state, viewerIds, showHeading = true, className }: ResultsSectionProps) {
  const [all, setAll] = useState(false)
  const { ranking, tallies, today, event } = state
  const people = useMemo(() => new Map<string, Person>(state.people.map(p => [p.id, p])), [state.people])
  const R = ranking.respondentCount
  const list = all ? ranking.ranked : ranking.ranked.slice(0, INITIAL)
  const n = ranking.ranked.length
  const unit = event.mode === 'parts' ? plural(n, 'slot', 'slots') : plural(n, 'day', 'days')
  const tied = useMemo(() => tiedOptionIds(ranking.ranked, R), [ranking.ranked, R])

  return (
    <section id="results" aria-labelledby={showHeading ? 'results-heading' : undefined} aria-label={showHeading ? undefined : 'All days'} className={className}>
      {showHeading && (
        <h2 id="results-heading" className="mb-3 font-display text-h2 leading-display font-bold tracking-display text-ink">
          All days, best first
        </h2>
      )}
      {R === 0 ? (
        <Card tone="sunken" className="flex items-center gap-3">
          <CircleDashed aria-hidden size={20} className="shrink-0 text-ink-3" />
          <p className="text-md text-ink-2">Answers show up here as people reply.</p>
        </Card>
      ) : (
        <>
          <ol className="flex flex-col gap-2">
            {list.map(item => (
              <ResultRow
                key={item.optionId}
                item={item}
                tally={tallies[item.optionId]}
                people={people}
                viewerIds={viewerIds}
                today={today}
                // Every group of equal answered rows is marked (see tiedOptionIds), not only the top one.
                tied={tied.has(item.optionId)}
                showBar={R >= 2}
              />
            ))}
          </ol>
          {!all && n > INITIAL && (
            <Button variant="ghost" iconRight={ChevronDown} onClick={() => setAll(true)} className="mt-2">
              Show all {n} {unit}
            </Button>
          )}
        </>
      )}
    </section>
  )
}
