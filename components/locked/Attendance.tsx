// Attendance: who's going / maybe / out for the locked day, with silent joiners tucked in a "No answer" disclosure.
'use client'

import { Disclosure, MonoLabel, PersonChip, StateIcon } from '@/components/ui'
import { isViewer, monoAnswerLabel, tallyLine } from '@/lib/people'
import type { AnswerValue, EventState } from '@/lib/types'

const GROUPS: Array<{ value: AnswerValue; label: string }> = (['free', 'maybe', 'cant'] as const).map(value => ({
  value, label: monoAnswerLabel(value, 'rsvp'),
}))

const ICON_TONE: Record<AnswerValue, string> = { free: 'text-free', maybe: 'text-maybe', cant: 'text-cant' }

export function Attendance({ state }: { state: EventState }) {
  const a = state.attendance
  if (!a) return null
  const byId = new Map(state.people.map(p => [p.id, p]))
  const isYou = (id: string) => isViewer(state, id)
  const counts = { free: a.free.length, maybe: a.maybe.length, cant: a.cant.length }
  const summary = tallyLine(counts, 'rsvp')

  const chips = (ids: string[], value?: AnswerValue) => (
    <ul className="flex flex-wrap gap-2">
      {ids.map(id => {
        const p = byId.get(id)
        if (!p) return null
        return (
          <li key={id} className="max-w-full">
            <PersonChip name={p.name} value={value} isYou={isYou(id)} isOrganiser={p.isOrganiser} />
          </li>
        )
      })}
    </ul>
  )

  return (
    <section aria-labelledby="attendance-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="attendance-heading" className="font-display text-h2 font-bold tracking-display text-ink">Who&apos;s coming</h2>
        <p className="mono-label tabular text-ink-2">{summary || "NO ONE'S ANSWERED FOR THIS DAY YET"}</p>
      </div>

      {GROUPS.map(g => {
        const ids = a[g.value]
        if (ids.length === 0) return null
        return (
          <div key={g.value} className="flex flex-col gap-2">
            <MonoLabel as="h3" tone="ink">
              <StateIcon value={g.value} size={14} className={ICON_TONE[g.value]} />
              {g.label} ({ids.length})
            </MonoLabel>
            {chips(ids, g.value)}
          </div>
        )
      })}

      {a.none.length > 0 && (
        <Disclosure
          summary={
            <MonoLabel tone="ink-2">
              <StateIcon value="none" size={14} />
              NO ANSWER ({a.none.length})
            </MonoLabel>
          }
        >
          {chips(a.none)}
        </Disclosure>
      )}
    </section>
  )
}
