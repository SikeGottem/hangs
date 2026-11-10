// CopyButton: copies text, flips to a check + "Copied" for 1.6 s, toasts on failure.
'use client'

import { Check, Copy, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { copyText } from '@/lib/share'
import { Button, type ButtonVariant } from './Button'
import { useToast } from './Toast'

export interface CopyButtonProps {
  text: string
  label: string
  copiedLabel?: string
  variant?: ButtonVariant
  size?: 'md' | 'lg'
  fullWidth?: boolean
  icon?: LucideIcon
  onCopied?(): void
  className?: string
}

export function CopyButton({ text, label, copiedLabel = 'Copied', variant = 'secondary', size, fullWidth, icon = Copy, onCopied, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { toast } = useToast()

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return (
    <Button
      variant={variant}
      size={size}
      fullWidth={fullWidth}
      className={className}
      iconLeft={copied ? Check : icon}
      onClick={async () => {
        const ok = await copyText(text)
        if (!ok) {
          toast({ message: "Couldn't copy. Long-press the link instead.", tone: 'error' })
          return
        }
        setCopied(true)
        onCopied?.()
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), 1600)
      }}
    >
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </Button>
  )
}
