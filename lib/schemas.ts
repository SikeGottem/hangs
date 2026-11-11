// Zod v4 request schemas for the v2 API, with text cleaning (NFKC, invisible/bidi stripping, whitespace collapse).
import { z } from 'zod'
import { isRealCalendarDate, isValidTimeZone } from './dates'

// Strips every control (Cc), format (Cf: zero-width, bidi marks/embeddings/overrides/isolates, soft hyphen, BOM,
// tag characters) and line/paragraph separator, plus code points that are not Cf but render blank: the combining
// grapheme joiner, variation selectors (including the Mongolian free variation selectors U+180B-U+180F), the Hangul
// fillers (letters that render blank), the Khmer inherent vowels U+17B4/U+17B5, the Braille blank U+2800, the musical
// null notehead U+1D159 and the Khitan small script filler U+16FE4. The zero-width joiner and VS16 survive only inside
// emoji sequences (see keepInEmoji). Visible-width spaces (U+2000-U+200A, U+3000, ...) are whitespace and collapse.
const STRIP = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\u034F\u115F\u1160\u17B4\u17B5\u180B-\u180F\u2800\u3164\uFFA0\uFE00-\uFE0F\u{16FE4}\u{1D159}\u{E0100}-\u{E01EF}]/gu
const PICTO = /^\p{Extended_Pictographic}$/u
const SKIN = /^[\u{1F3FB}-\u{1F3FF}]$/u
const ZWJ = '\u200D'
const VS16 = '\uFE0F'

// The code point ending just before index i (surrogate-pair aware).
function cpBefore(str: string, i: number): string {
  if (i <= 0) return ''
  const lo = str.charCodeAt(i - 1)
  return i >= 2 && lo >= 0xdc00 && lo <= 0xdfff ? str.slice(i - 2, i) : str.slice(i - 1, i)
}
const cpAt = (str: string, i: number) => String.fromCodePoint(str.codePointAt(i) ?? 0)

// Emoji sequences keep their glue: a zero-width joiner between two pictographs (after an optional skin tone or VS16),
// as in a family or a rainbow flag, and VS16 right after a pictograph. Anywhere else both are stripped like the rest.
function keepInEmoji(str: string, ch: string, i: number): boolean {
  if (ch !== ZWJ && ch !== VS16) return false
  let j = i
  let prev = cpBefore(str, j)
  if (ch === ZWJ) {
    while (prev === VS16 || SKIN.test(prev)) {
      j -= prev.length
      prev = cpBefore(str, j)
    }
    return PICTO.test(prev) && PICTO.test(cpAt(str, i + 1))
  }
  return PICTO.test(prev)
}

export const clean = (s: string) => s.normalize('NFKC').replace(/[\t\n\r\f\v]/g, ' ')
  .replace(STRIP, (ch, i: number, str: string) => (keepInEmoji(str, ch, i) ? ch : ''))
  .replace(/\s+/g, ' ').trim()
// Cyrillic, Greek and Latin letters that render like a different Latin letter (a small UTS #39-style skeleton table).
// Case-specific where only one case looks Latin (Cyrillic capital Н is H, lowercase н is not h).
const CONFUSABLES: Record<string, string> = {
  // Cyrillic capitals
  'А': 'A', 'В': 'B', 'Е': 'E', 'Ѕ': 'S', 'І': 'I', 'Ј': 'J', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P',
  'С': 'C', 'Т': 'T', 'Х': 'X', 'У': 'Y', 'Ү': 'Y', 'Ԛ': 'Q', 'Ԝ': 'W', 'Ӏ': 'I',
  // Cyrillic lowercase
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd',
  'һ': 'h', 'ԛ': 'q', 'ԝ': 'w', 'ӏ': 'l', 'ү': 'y', 'к': 'k',
  // Greek capitals
  'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P',
  'Τ': 'T', 'Υ': 'Y', 'Χ': 'X',
  // Greek lowercase
  'α': 'a', 'ο': 'o', 'ν': 'v', 'ρ': 'p', 'ι': 'i', 'κ': 'k', 'τ': 't', 'υ': 'u', 'ϲ': 'c', 'ϳ': 'j',
  // Latin lookalikes that NFKC keeps (dotless i and j, script a and g)
  'ı': 'i', 'ȷ': 'j', 'ɑ': 'a', 'ɡ': 'g', 'ɩ': 'i',
}
const CONFUSABLE_RE = new RegExp(`[${Object.keys(CONFUSABLES).join('')}]`, 'gu')
// Combining diacritics used on Latin, Greek and Cyrillic letters (not other scripts' vowel signs, which carry meaning).
const DIACRITICS = /[̀-ͯ҃-҉᪰-᫿᷀-᷿⃐-⃿︠-︯]/gu
const fold = (s: string) => s.replace(CONFUSABLE_RE, ch => CONFUSABLES[ch] ?? ch)

// Per-event name uniqueness key: a confusable skeleton of the cleaned name. Diacritics drop (so İ is I and é is e),
// lookalike Cyrillic/Greek letters and ı become their Latin twins, then case folds. Two names with the same key would
// look the same in the people list, so the second is refused as name_taken. Folded twice so a capital whose
// lowercase is the lookalike (Ү, Ԁ) is caught too.
export const nameKey = (name: string) =>
  fold(fold(clean(name).normalize('NFD').replace(DIACRITICS, '')).toLocaleLowerCase('en'))
const uniq = (a: string[]) => new Set(a).size === a.length

export const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date.').refine(isRealCalendarDate, 'That date does not exist.')
export const Title = z.string().transform(clean).pipe(z.string().min(1, 'Add a title.').max(60, 'Keep the title to 60 characters.'))
export const Note = z.string().transform(clean).pipe(z.string().max(140, 'Keep the note to 140 characters.'))
export const Name = z.string().transform(clean).pipe(
  z.string().min(1, 'Add your name.').regex(/[\p{L}\p{N}]/u, 'Names need at least one letter or number.')
    // Characters as people count them (code points), matching the name inputs' counter: an emoji is one, not two.
    .refine(s => Array.from(s).length <= 40, 'Keep names to 40 characters.'),
)
export const Place = z.string().transform(clean).pipe(z.string().max(80, 'Keep the place to 80 characters.'))
  .refine(s => !/^(javascript|data|vbscript):/i.test(s), 'That place is not allowed.')
export const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 13:30.')
export const TimeZone = z.string().max(64).refine(isValidTimeZone, 'Unknown timezone.')
export const AnswerValueSchema = z.enum(['free', 'maybe', 'cant'])
export const OptionKind = z.enum(['date'])   // enforced here, not by a DB CHECK
export const OptionId = z.string().regex(/^[a-z0-9]{8}$/)
export const AnswerUpdate = z.object({ optionId: OptionId, value: AnswerValueSchema.nullable() })

const Dates = z.array(DateStr).min(1, 'Pick at least one day.').max(62, "That's the max: 62 days.").refine(uniq, 'Each day can only be picked once.')

export const CreateEventInput = z.object({
  title: Title,
  note: Note.default(''),
  organiserName: Name,
  mode: z.enum(['days', 'parts']).default('days'),
  dates: Dates,
  tz: TimeZone.default('Australia/Sydney'),
})
export const PatchEventInput = z.object({ title: Title.optional(), note: Note.optional() })
  .refine(o => o.title !== undefined || o.note !== undefined, 'Nothing to change.')
export const SetDatesInput = z.object({ dates: Dates })   // parts-mode x3 cap checked in the repository
export const JoinInput = z.object({ name: Name, answers: z.array(AnswerUpdate).max(62).default([]) })
export const RenameInput = z.object({ name: Name })
export const SaveAnswersInput = z.object({ answers: z.array(AnswerUpdate).min(1).max(62) })
export const LockInput = z.object({ optionId: OptionId, time: Time.nullable().default(null), place: Place.default('') })

export type CreateEventInputT = z.output<typeof CreateEventInput>
export type PatchEventInputT = z.output<typeof PatchEventInput>
export type SetDatesInputT = z.output<typeof SetDatesInput>
export type JoinInputT = z.output<typeof JoinInput>
export type RenameInputT = z.output<typeof RenameInput>
export type SaveAnswersInputT = z.output<typeof SaveAnswersInput>
export type LockInputT = z.output<typeof LockInput>

// First human-readable zod issue message, for 400 responses.
export function firstIssueMessage(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return "Something in that request wasn't right."
  if (issue.code === 'invalid_type' || issue.message.startsWith('Invalid')) {
    const field = issue.path.join('.') || 'request'
    return `Check the ${field} and try again.`
  }
  return issue.message
}
