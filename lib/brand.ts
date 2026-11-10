// Hex mirror of the colour tokens in app/globals.css, for OG images, icons and themeColor.
// A test asserts every value here appears in globals.css, so keep them in sync.

export const BRAND = {
  bg: '#FAF8F3',
  surface: '#FFFFFF',
  sunken: '#F2EEE6',
  hover: '#ECE6DA',
  ink: '#1A1915',
  ink2: '#55514A',
  ink3: '#6B665D',
  line: '#E6E0D4',
  lineStrong: '#CBC2B2',
  accent: '#F5C842',
  accentPress: '#E8B92C',
  onAccent: '#1A1915',
  free: '#23804A',
  freeBg: '#E4F3E9',
  freeInk: '#1B6B3D',
  onFree: '#FFFFFF',
  maybe: '#9A6A12',
  maybeBg: '#FAF0DC',
  maybeInk: '#6F4C0B',
  cant: '#6B655B',
  cantBg: '#EDE9E2',
  cantInk: '#55514A',
  onCant: '#FFFFFF',
  danger: '#B42318',
  dangerBg: '#FCEBE9',
  white: '#FFFFFF',
} as const

export type BrandColour = keyof typeof BRAND
