// Sheet: native <dialog> modal; bottom sheet on phones, centred dialog from 640 px. Esc, backdrop click, focus return,
// and initial focus on a [data-autofocus] element when the content has one.
// Hosts toasts while open (at the top of the screen, over the backdrop), because everything outside a modal dialog is inert.
'use client'

import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { cx } from './cx'
import { IconButton } from './IconButton'
import { useToastHost } from './Toast'

export interface SheetProps {
  open: boolean
  onClose(): void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  className?: string
}

export function Sheet({ open, onClose, title, description, children, footer, className }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descId = useId()
  const toastRegion = useRef<HTMLDivElement>(null)
  const registerToastHost = useToastHost()

  // Toasts fired while this sheet is open render in its own live region, above the backdrop and announced.
  useEffect(() => {
    if (!open || !toastRegion.current) return
    return registerToastHost(toastRegion.current)
  }, [open, registerToastHost])

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      d.showModal()
      // showModal focuses the first focusable (Close); a sheet can name a better start with data-autofocus.
      d.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    } else if (!open && d.open) {
      d.close()
    }
  }, [open])

  useEffect(() => {
    const d = ref.current
    if (!d) return
    const onDialogClose = () => {
      const el = opener.current
      opener.current = null
      if (el && document.contains(el)) el.focus()
    }
    d.addEventListener('close', onDialogClose)
    return () => d.removeEventListener('close', onDialogClose)
  }, [])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={e => {
        e.preventDefault()
        onClose()
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
      className={cx(
        'm-0 mt-auto w-full max-w-none flex-col overflow-hidden rounded-t-2xl bg-surface p-0 text-ink shadow-2 open:flex',
        'max-h-[90dvh] open:animate-slide-up backdrop:bg-ink/40',
        'sm:m-auto sm:w-120 sm:rounded-xl',
        className,
      )}
    >
      <div className="flex items-start gap-2 px-5 pt-4 pb-2">
        <div className="min-w-0 flex-1 pt-2">
          <h2 id={titleId} className="font-display text-xl font-bold tracking-display text-ink">{title}</h2>
          {description && <p id={descId} className="mt-1 text-md text-ink-2">{description}</p>}
        </div>
        <IconButton icon={X} label="Close" onClick={onClose} className="-mr-2" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
      {footer && (
        <div className="border-t border-line bg-surface px-5 pt-3" style={{ paddingBottom: 'calc(12px + var(--safe-bottom))' }}>
          {footer}
        </div>
      )}
      <div
        ref={toastRegion}
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-10 flex flex-col items-center gap-2 px-4"
        style={{ top: 'calc(12px + env(safe-area-inset-top, 0px))' }}
      />
    </dialog>
  )
}
