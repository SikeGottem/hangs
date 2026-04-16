// Custom calendar picker for the create-hang wizard. Replaces raw
// <input type="date"> — supports both range + specific-days modes in a
// single UX with Gen Z preset chips, keyboard nav, and the Amie × Field
// Notes aesthetic. Built on react-day-picker v9 + date-fns.
"use client"
import { useMemo, useState } from 'react'
import { DayPicker, type DateRange } from 'react-day-picker'
import { format, addDays, startOfDay, isSameDay } from 'date-fns'
import 'react-day-picker/style.css'

type Mode = 'range' | 'specific'

export type DatePickerValue = {
  mode: Mode
  start?: string       // YYYY-MM-DD
  end?: string         // YYYY-MM-DD
  dates?: string[]     // YYYY-MM-DD[]
}

type Props = {
  value: DatePickerValue
  onChange: (v: DatePickerValue) => void
}

// Format a Date → YYYY-MM-DD using local timezone (not UTC — the grid is
// inherently a local-wall-clock thing).
const iso = (d: Date) => format(d, 'yyyy-MM-dd')
const parseIso = (s: string) => startOfDay(new Date(s + 'T00:00:00'))

// Gen Z hangout preset set. Each returns a {start, end} or a list of dates.
type Preset = {
  key: string
  label: string
  emoji: string
  // How it should map into range OR specific-days depending on current mode.
  computeRange: (today: Date) => { start: Date; end: Date }
}

const PRESETS: Preset[] = [
  {
    key: 'tonight',
    label: 'Tonight',
    emoji: '🌙',
    computeRange: (today) => ({ start: today, end: today }),
  },
  {
    key: 'tomorrow',
    label: 'Tomorrow',
    emoji: '☀️',
    computeRange: (today) => {
      const t = addDays(today, 1)
      return { start: t, end: t }
    },
  },
  {
    key: 'thisFriday',
    label: 'This Friday',
    emoji: '🍻',
    computeRange: (today) => {
      const day = today.getDay() // 0 Sun .. 6 Sat
      // If today IS Friday and it's not late, "this Friday" = today.
      // Otherwise it's the next Friday — but if today > Friday, it means "next Fri".
      const diff = day <= 5 ? 5 - day : 6 // Sat → 6 days until next Fri
      const fri = addDays(today, diff)
      return { start: fri, end: fri }
    },
  },
  {
    key: 'thisWeekend',
    label: 'This weekend',
    emoji: '🎉',
    computeRange: (today) => {
      const day = today.getDay()
      // If today is Fri/Sat/Sun, this weekend is today → next Sunday.
      // Otherwise, this weekend is the coming Fri → Sun.
      if (day === 5 || day === 6 || day === 0) {
        const sunOffset = day === 0 ? 0 : day === 5 ? 2 : 1
        return { start: today, end: addDays(today, sunOffset) }
      }
      const friOffset = 5 - day
      return { start: addDays(today, friOffset), end: addDays(today, friOffset + 2) }
    },
  },
  {
    key: 'nextWeekend',
    label: 'Next weekend',
    emoji: '🏖️',
    computeRange: (today) => {
      const day = today.getDay()
      // Next weekend = the Friday AFTER this weekend.
      // If today is Mon–Thu, this weekend is this-coming, next weekend is +7.
      // If today is Fri/Sat/Sun, next weekend is +7 from this Friday.
      const thisFriOffset = day === 0 ? 5 : day <= 5 ? 5 - day : (7 - day) + 5
      const nextFri = addDays(today, thisFriOffset + 7)
      return { start: nextFri, end: addDays(nextFri, 2) }
    },
  },
]

export default function DatePicker({ value, onChange }: Props) {
  const today = useMemo(() => startOfDay(new Date()), [])
  const [month, setMonth] = useState<Date>(() => {
    if (value.start) return parseIso(value.start)
    if (value.dates && value.dates.length > 0) return parseIso(value.dates[0])
    return today
  })

  const setMode = (mode: Mode) => {
    // Preserve as much as we can when switching modes.
    if (mode === 'range') {
      // If we had specific dates, take min/max as the range.
      if (value.dates && value.dates.length > 0) {
        const sorted = [...value.dates].sort()
        onChange({ mode, start: sorted[0], end: sorted[sorted.length - 1] })
        return
      }
      onChange({ mode, start: value.start, end: value.end })
    } else {
      // Going specific: if we had a range, expand it into the list of days.
      if (value.start && value.end) {
        const dates: string[] = []
        let cursor = parseIso(value.start)
        const end = parseIso(value.end)
        while (cursor <= end) {
          dates.push(iso(cursor))
          cursor = addDays(cursor, 1)
        }
        onChange({ mode, dates })
        return
      }
      onChange({ mode, dates: value.dates || [] })
    }
  }

  const applyPreset = (preset: Preset) => {
    const { start, end } = preset.computeRange(today)
    if (value.mode === 'range') {
      onChange({ mode: 'range', start: iso(start), end: iso(end) })
    } else {
      // Specific mode: expand preset into individual days and merge with existing.
      const newDates = new Set(value.dates || [])
      let cursor = start
      while (cursor <= end) {
        newDates.add(iso(cursor))
        cursor = addDays(cursor, 1)
      }
      onChange({ mode: 'specific', dates: [...newDates].sort() })
    }
    setMonth(start)
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate([8, 30, 8]) } catch { /* ignore */ }
    }
  }

  const clear = () => {
    if (value.mode === 'range') onChange({ mode: 'range', start: undefined, end: undefined })
    else onChange({ mode: 'specific', dates: [] })
  }

  // Summary string for the action bar
  const summary = (() => {
    if (value.mode === 'range') {
      if (!value.start || !value.end) return 'Pick a date range'
      const s = parseIso(value.start)
      const e = parseIso(value.end)
      const days = Math.round((e.getTime() - s.getTime()) / 86400000) + 1
      if (isSameDay(s, e)) return format(s, 'EEE d MMM')
      return `${format(s, 'EEE d MMM')} → ${format(e, 'EEE d MMM')} · ${days} days`
    }
    if (!value.dates || value.dates.length === 0) return 'Pick specific days'
    if (value.dates.length === 1) return format(parseIso(value.dates[0]), 'EEE d MMM')
    return `${value.dates.length} days selected`
  })()

  // Convert our value → react-day-picker selected shape
  const rdpSelected: Date | Date[] | DateRange | undefined = (() => {
    if (value.mode === 'range') {
      if (!value.start && !value.end) return undefined
      return {
        from: value.start ? parseIso(value.start) : undefined,
        to: value.end ? parseIso(value.end) : undefined,
      }
    }
    return (value.dates || []).map(parseIso)
  })()

  return (
    <div className="hangs-datepicker">
      <style>{`
        .hangs-datepicker {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 14px;
        }
        .hangs-datepicker .seg {
          display: flex;
          background: var(--surface-dim);
          border-radius: 999px;
          padding: 3px;
          margin-bottom: 12px;
        }
        .hangs-datepicker .seg button {
          flex: 1;
          padding: 8px 14px;
          background: transparent;
          border: none;
          border-radius: 999px;
          font-family: var(--font-display);
          font-size: 13px;
          font-weight: 700;
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .hangs-datepicker .seg button[aria-pressed="true"] {
          background: var(--surface);
          color: var(--text-primary);
          box-shadow: var(--shadow-sm);
        }
        .hangs-datepicker .presets {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
          padding-bottom: 2px;
          margin-bottom: 12px;
        }
        .hangs-datepicker .presets::-webkit-scrollbar { display: none }
        .hangs-datepicker .preset {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 7px 12px;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 999px;
          font-family: var(--font-display);
          font-size: 12px;
          font-weight: 600;
          color: var(--text-primary);
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.15s ease;
        }
        .hangs-datepicker .preset:hover {
          background: var(--maybe-light);
          border-color: var(--accent);
        }
        .hangs-datepicker .rdp-root {
          --rdp-accent-color: var(--accent);
          --rdp-accent-background-color: color-mix(in srgb, var(--accent) 22%, transparent);
          --rdp-day-height: 44px;
          --rdp-day-width: 44px;
          --rdp-day_button-height: 40px;
          --rdp-day_button-width: 40px;
          --rdp-day_button-border-radius: 10px;
          --rdp-selected-border: 1.5px solid var(--accent);
          --rdp-today-color: var(--accent);
          font-family: var(--font-display);
        }
        .hangs-datepicker .rdp-caption_label {
          font-family: var(--font-display);
          font-size: 15px;
          font-weight: 700;
          color: var(--text-primary);
        }
        .hangs-datepicker .rdp-weekday {
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .hangs-datepicker .rdp-day_button {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
          transition: background 0.12s ease;
        }
        .hangs-datepicker .rdp-day_button:hover:not([disabled]) {
          background: var(--surface-dim);
        }
        .hangs-datepicker .rdp-day_button:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 1px;
        }
        .hangs-datepicker .rdp-today .rdp-day_button {
          color: var(--accent);
          font-weight: 800;
        }
        .hangs-datepicker .rdp-disabled .rdp-day_button {
          color: var(--text-muted);
          opacity: 0.35;
        }
        .hangs-datepicker .rdp-selected .rdp-day_button,
        .hangs-datepicker .rdp-range_start .rdp-day_button,
        .hangs-datepicker .rdp-range_end .rdp-day_button {
          background: var(--accent);
          color: var(--accent-text);
          font-weight: 800;
          box-shadow: var(--shadow-sm);
        }
        .hangs-datepicker .rdp-range_middle .rdp-day_button {
          background: var(--rdp-accent-background-color);
          color: var(--text-primary);
          border-radius: 0;
          font-weight: 600;
        }
        .hangs-datepicker .rdp-chevron { fill: var(--text-primary) }
        .hangs-datepicker .summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          margin-top: 10px;
          background: var(--surface-dim);
          border-radius: var(--radius-sm);
          font-family: var(--font-mono);
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
        }
        .hangs-datepicker .summary button {
          background: none;
          border: none;
          font-family: var(--font-display);
          font-size: 11px;
          font-weight: 700;
          color: var(--text-muted);
          cursor: pointer;
          padding: 4px 8px;
        }
        .hangs-datepicker .summary button:hover { color: var(--text-primary) }
      `}</style>

      {/* Mode toggle */}
      <div className="seg" role="tablist" aria-label="Date picker mode">
        <button
          type="button"
          role="tab"
          aria-pressed={value.mode === 'range'}
          onClick={() => setMode('range')}
        >
          Range
        </button>
        <button
          type="button"
          role="tab"
          aria-pressed={value.mode === 'specific'}
          onClick={() => setMode('specific')}
        >
          Specific days
        </button>
      </div>

      {/* Preset chips */}
      <div className="presets" role="group" aria-label="Date presets">
        {PRESETS.map(p => (
          <button
            key={p.key}
            type="button"
            className="preset"
            onClick={() => applyPreset(p)}
            aria-label={`Pick ${p.label}`}
          >
            <span aria-hidden="true">{p.emoji}</span> {p.label}
          </button>
        ))}
      </div>

      {/* Calendar grid (react-day-picker v9) */}
      {value.mode === 'range' ? (
        <DayPicker
          mode="range"
          selected={rdpSelected as DateRange | undefined}
          onSelect={(range: DateRange | undefined) => {
            onChange({
              mode: 'range',
              start: range?.from ? iso(range.from) : undefined,
              end: range?.to ? iso(range.to) : undefined,
            })
            if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
              try { navigator.vibrate(4) } catch { /* ignore */ }
            }
          }}
          month={month}
          onMonthChange={setMonth}
          disabled={{ before: today }}
          showOutsideDays
          weekStartsOn={1}
        />
      ) : (
        <DayPicker
          mode="multiple"
          selected={rdpSelected as Date[] | undefined}
          onSelect={(dates: Date[] | undefined) => {
            onChange({ mode: 'specific', dates: (dates || []).map(iso).sort() })
            if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
              try { navigator.vibrate(4) } catch { /* ignore */ }
            }
          }}
          month={month}
          onMonthChange={setMonth}
          disabled={{ before: today }}
          showOutsideDays
          weekStartsOn={1}
        />
      )}

      {/* Action bar — live summary + clear */}
      <div className="summary">
        <span>{summary}</span>
        <button type="button" onClick={clear} aria-label="Clear selection">Clear</button>
      </div>
    </div>
  )
}
