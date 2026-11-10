// Random short ids for events, people and options, plus format validators.

const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'
const LIMIT = 256 - (256 % ALPHABET.length) // rejection sampling keeps the distribution uniform

function randomId(length: number): string {
  let out = ''
  while (out.length < length) {
    const bytes = new Uint8Array(length * 2)
    crypto.getRandomValues(bytes)
    for (const b of bytes) {
      if (b >= LIMIT) continue
      out += ALPHABET[b % ALPHABET.length]
      if (out.length === length) break
    }
  }
  return out
}

export const newEventId = () => randomId(10)
export const newPersonId = () => randomId(10)
export const newOptionId = () => randomId(8)

export const isEventId = (s: unknown): s is string => typeof s === 'string' && /^[a-z0-9]{10}$/.test(s)
export const isPersonId = (s: unknown): s is string => typeof s === 'string' && /^[a-z0-9]{10}$/.test(s)
