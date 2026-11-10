// Preset chips for the create calendar: "Next 2 weekends", "Next 14 days" (on only when the selection is exactly theirs; cap-aware) and "Clear" with undo.
// The row wraps (no hidden horizontal scroll), so Clear and every focus ring stay visible at 320 px.
'use client'

import { CalendarDays, CalendarRange, X } from 'lucide-react'
import { useMemo } from 'react'
import { Chip, cx, useToast } from '@/components/ui'
import { nextDays, nextWeekends } from '@/lib/dates'
import { plural } from '@/lib/format'

export interface DatePresetsProps {
  today: string
  value: string[]
  onChange: (next: string[]) => void
  maxSelected: number
  onLimit?: () => void
  className?: string
}

const sorted = (s: Iterable<string>) => [...new Set(s)].sort()

export function DatePresets({ today, value, onChange, maxSelected, onLimit, className }: DatePresetsProps) {
  const { toast } = useToast()
  const presets = useMemo(
    () => [
      { key: 'weekends', label: 'Next 2 weekends', icon: CalendarRange, dates: nextWeekends(today, 2) },
      { key: 'fortnight', label: 'Next 14 days', icon: CalendarDays, dates: nextDays(today, 14) },
    ],
    [today],
  )
  const selected = useMemo(() => new Set(value), [value])

  // A preset is "on" only when the selection is exactly its dates (a superset, like 14 days containing the weekends,
  // doesn't light the weekends chip).
  const isExactly = (dates: string[]) => dates.length > 0 && dates.length === selected.size && dates.every(d => selected.has(d))

  // On chip: remove its dates. Off chip whose dates are all already picked: narrow to just its dates (with Undo).
  // Otherwise add its missing dates in date order until the cap.
  const togglePreset = (label: string, dates: string[]) => {
    if (isExactly(dates)) {
      const drop = new Set(dates)
      onChange(value.filter(d => !drop.has(d)))
      return
    }
    if (dates.every(d => selected.has(d))) {
      const previous = value
      onChange(sorted(dates))
      toast({
        message: `Kept just the ${label.toLowerCase()}`,
        action: { label: 'Undo', onClick: () => onChange(previous) },
      })
      return
    }
    const next = new Set(value)
    let blocked = false
    for (const d of dates) {
      if (next.has(d)) continue
      if (next.size >= maxSelected) { blocked = true; break }
      next.add(d)
    }
    if (blocked) onLimit?.()
    if (next.size !== selected.size) onChange(sorted(next))
  }

  const clear = () => {
    const previous = value
    onChange([])
    toast({
      message: `Cleared ${previous.length} ${plural(previous.length, 'day', 'days')}`,
      action: { label: 'Undo', onClick: () => onChange(previous) },
    })
  }

  return (
    <div
      role="group"
      aria-label="Quick picks"
      className={cx('flex flex-wrap gap-2', className)}
    >
      {presets.map(p => (
        <Chip
          key={p.key}
          icon={p.icon}
          selected={isExactly(p.dates)}
          onClick={() => togglePreset(p.label, p.dates)}
        >
          {p.label}
        </Chip>
      ))}
      {value.length > 0 && (
        <Chip icon={X} onClick={clear}>
          Clear
        </Chip>
      )}
    </div>
  )
}
