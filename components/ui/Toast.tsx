// Toasts: ToastProvider (in the root layout) and useToast() for short announcements with an optional action.
// One toast at a time (a new one replaces the old), so they never stack over content. Opening a Sheet clears it;
// toasts fired while a Sheet is open render in that Sheet's live region (the page is inert there), at the top of the
// screen clear of the sheet's fields. On the page it sits above the sticky bottom bar (bottom right on wide screens,
// clear of the create form's submit button). Pauses while hovered/focused.
'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cx } from './cx'

export interface ToastOptions {
  message: string
  action?: { label: string; onClick(): void }
  tone?: 'neutral' | 'error'
  durationMs?: number // default 4000, 6000 with an action
}

interface ToastItem extends ToastOptions { id: number }

// clear() drops the showing toast, e.g. when an inline confirmation opens where it would sit.
interface ToastApi { toast(t: ToastOptions): void; clear(): void }

const ToastContext = createContext<ToastApi>({ toast: () => {}, clear: () => {} })
const ToastHostContext = createContext<(el: HTMLElement) => () => void>(() => () => {})

export function useToast(): ToastApi {
  return useContext(ToastContext)
}

// For Sheet: registers an always-mounted live region inside the open dialog; returns the unregister function.
export function useToastHost(): (el: HTMLElement) => () => void {
  return useContext(ToastHostContext)
}

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const remaining = useRef(item.durationMs ?? (item.action ? 6000 : 4000))
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const paused = hovered || focused

  // The timer only runs while the toast is neither hovered nor holding focus (WCAG 2.2.1).
  useEffect(() => {
    if (paused) return
    const started = Date.now()
    const timer = setTimeout(() => onDismiss(item.id), Math.max(0, remaining.current))
    return () => {
      clearTimeout(timer)
      remaining.current -= Date.now() - started
    }
  }, [paused, item.id, onDismiss])

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false) }}
      className={cx(
        'pointer-events-auto flex w-full max-w-(--col-max) min-[960px]:w-auto min-[960px]:max-w-sm animate-fade-in items-center gap-3 rounded-lg px-4 py-3 text-sm shadow-2',
        item.tone === 'error' ? 'bg-danger text-white' : 'bg-ink text-white',
      )}
    >
      <p className="min-w-0 flex-1">{item.message}</p>
      {item.action && (
        <button
          type="button"
          className="-my-2 -mr-2 min-h-11 min-w-11 shrink-0 rounded-md px-3 font-semibold underline underline-offset-2 focus-visible:outline-white"
          onClick={() => {
            item.action?.onClick()
            onDismiss(item.id)
          }}
        >
          {item.action.label}
        </button>
      )}
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const [hosts, setHosts] = useState<HTMLElement[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setItems(list => list.filter(t => t.id !== id))
  }, [])

  // The newest toast replaces the showing one, so repeats (e.g. hitting a cap again) restart the timer, never stack.
  const toast = useCallback((t: ToastOptions) => {
    const id = nextId.current++
    setItems([{ ...t, id }])
  }, [])

  // A sheet opening takes over the screen: drop whatever toast was showing so it never sits on the sheet's content.
  const registerHost = useCallback((el: HTMLElement) => {
    setItems([])
    setHosts(h => [...h, el])
    return () => setHosts(h => h.filter(x => x !== el))
  }, [])

  const clear = useCallback(() => setItems([]), [])
  const api = useMemo(() => ({ toast, clear }), [toast, clear])
  const host = hosts[hosts.length - 1] ?? null
  const list = items.map(t => <ToastView key={t.id} item={t} onDismiss={dismiss} />)

  return (
    <ToastContext.Provider value={api}>
      <ToastHostContext.Provider value={registerHost}>{children}</ToastHostContext.Provider>
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4 min-[960px]:items-end min-[960px]:px-8"
        style={{ bottom: 'calc(max(var(--bar-h, 0px), var(--safe-bottom)) + 12px)' }}
      >
        {host ? null : list}
      </div>
      {host ? createPortal(list, host) : null}
    </ToastContext.Provider>
  )
}
