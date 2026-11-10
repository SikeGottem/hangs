// "Best day" hero: states the current answer in words (label, headline, detail) with the organiser's lock CTA below.
'use client'

import { CalendarCheck } from 'lucide-react'
import { LockCta } from '@/components/organiser'
import { Card, cx, MonoLabel, TallyBar } from '@/components/ui'
import type { EventState } from '@/lib/types'

export interface BestDayHeroProps {
  state: EventState
  onState: (next: EventState) => void
  emphasis: 'accent' | 'secondary'
  className?: string
}

export function BestDayHero({ state, onState, emphasis, className }: BestDayHeroProps) {
  const { hero } = state.ranking
  const leading = hero.kind === 'winner' || hero.kind === 'everyone'
  const ruled = leading || hero.kind === 'tie'
  const top = leading ? state.ranking.ranked.find(r => r.optionId === hero.optionIds[0]) : undefined

  return (
    <Card
      as="section"
      padding="lg"
      className={cx('flex flex-col gap-2', ruled && 'border-l-3 border-l-ink', className)}
    >
      <MonoLabel as="p" tone={leading ? 'ink' : 'ink-2'} icon={leading ? CalendarCheck : undefined}>
        {hero.label}
      </MonoLabel>
      <h2 className="font-display text-hero leading-display font-bold tracking-display text-balance text-ink lg:text-display">
        {hero.headline}
      </h2>
      <p className="text-md text-pretty text-ink-2 tabular">{hero.detail}</p>
      {top && (
        <TallyBar free={top.free} maybe={top.maybe} cant={top.cant} none={top.none} showLegend={false} className="mt-2" />
      )}
      {state.viewer.isOrganiser && (
        <div className="empty:hidden">
          <LockCta state={state} onState={onState} emphasis={emphasis} />
        </div>
      )}
    </Card>
  )
}
