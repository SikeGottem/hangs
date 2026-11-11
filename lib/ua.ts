// In-app browser detection (Messenger / Instagram / Facebook webviews), safe to import anywhere.

export const IN_APP_RE = /Instagram|FBAN|FBAV|FB_IAB|Messenger/

export function isInAppUserAgent(ua: string): boolean {
  return IN_APP_RE.test(ua)
}

export function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  return isInAppUserAgent(navigator.userAgent || '')
}
