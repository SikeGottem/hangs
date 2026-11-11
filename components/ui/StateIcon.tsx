// StateIcon: the icon for an answer state (free Check, maybe Waves, can't X, none CircleDashed). Always paired with a visible label.
import { Check, CircleDashed, Waves, X } from 'lucide-react'
import type { AnswerValue } from '@/lib/types'

// lucide-react has no Tilde icon, so "if need be" uses Waves (a wavy, non-committal mark).
const ICONS = { free: Check, maybe: Waves, cant: X, none: CircleDashed } as const

export function StateIcon({ value, size = 16, className }: { value: AnswerValue | 'none'; size?: number; className?: string }) {
  const Icon = ICONS[value]
  return <Icon aria-hidden size={size} strokeWidth={value === 'free' || value === 'cant' ? 2.5 : 2} className={className} />
}
