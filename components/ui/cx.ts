// Tiny className joiner for the UI kit (falsy values dropped).
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
