// StickyBar: opaque bar stuck to the bottom of the main column, padded for the iOS safe area. While mounted and
// sticky it publishes its height as --bar-h, which toasts and the page's scroll padding use to stay clear of it.
'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { cx } from './cx'

export function StickyBar({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const root = document.documentElement
    const update = () => {
      const sticky = getComputedStyle(el).position === 'sticky'
      root.style.setProperty('--bar-h', `${sticky ? Math.ceil(el.getBoundingClientRect().height) : 0}px`)
    }
    update()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    ro?.observe(el)
    window.addEventListener('resize', update)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', update)
      root.style.removeProperty('--bar-h')
    }
  }, [])

  return (
    <div
      ref={ref}
      id={id}
      data-sticky-bar=""
      className={cx('sticky bottom-0 z-20 bg-bg px-3 pt-3 shadow-bar', className)}
      style={{ paddingBottom: 'calc(12px + var(--safe-bottom))' }}
    >
      {children}
    </div>
  )
}
