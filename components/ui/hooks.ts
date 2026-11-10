// Shared browser-only hooks and helpers: hydration-safe client values, page origin, in-app browser flag, reduced motion, scroll-to.
'use client'

import { useSyncExternalStore } from 'react'
import { isInAppBrowser } from '@/lib/ua'

const noSubscribe = () => () => {}

// A browser-only value: `server` during SSR and hydration, then `get()` (re-read every render; must return a primitive).
export function useClientValue<T extends string | number | boolean | null>(get: () => T, server: T): T {
  return useSyncExternalStore(noSubscribe, get, () => server)
}

// false during SSR and hydration, true once mounted in the browser.
export function useMounted(): boolean {
  return useClientValue(() => true, false)
}

// window.location.origin after hydration; '' during SSR and hydration (no mismatch).
export function useOrigin(): string {
  return useClientValue(() => window.location.origin, '')
}

// Messenger / Instagram / Facebook webviews: copy instead of share, Google Calendar first.
export function useInAppBrowser(): boolean {
  return useClientValue(isInAppBrowser, false)
}

export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export function scrollToId(id: string, block: ScrollLogicalPosition = 'start'): void {
  if (typeof document === 'undefined') return
  document.getElementById(id)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block })
}
