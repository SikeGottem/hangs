// Hex mirror of the colour tokens in app/globals.css, for OG images, icons and themeColor.
// A test asserts every value here appears in globals.css, so keep them in sync.

export const BRAND = {
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  sunken: '#F1F1EE',
  hover: '#E8E8E4',
  ink: '#111111',
  ink2: '#454545',
  ink3: '#666666',
  line: '#E2E2DE',
  lineStrong: '#BDBDB8',
  accent: '#F5B700',
  accentPress: '#DFA600',
  onAccent: '#111111',
  free: '#0B5D3F',
  freeBg: '#DFF0E9',
  freeInk: '#0B5D3F',
  onFree: '#FFFFFF',
  maybe: '#8A5A00',
  maybeBg: '#FBEFD0',
  maybeInk: '#6B4600',
  cant: '#666666',
  cantBg: '#ECECE8',
  cantInk: '#454545',
  onCant: '#FFFFFF',
  danger: '#B42318',
  dangerBg: '#FCEBE9',
  white: '#FFFFFF',
  day1: '#1B3FD1',
  day2: '#F5B700',
  day3: '#0B5D3F',
  day4: '#C8321A',
  day5: '#5B1F6E',
  night: '#111111',
} as const

export type BrandColour = keyof typeof BRAND
