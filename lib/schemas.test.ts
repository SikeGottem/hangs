// Unit tests for request schemas: cleaning (bidi/zero-width/BOM), caps, defaults and refinements.
import { describe, expect, it } from 'vitest'
import { clean, CreateEventInput, JoinInput, LockInput, Name, nameKey, PatchEventInput, Place, SaveAnswersInput, SetDatesInput, Title } from './schemas'

const RLO = String.fromCharCode(0x202e)
const ZWSP = String.fromCharCode(0x200b)
const ZWJ = String.fromCharCode(0x200d)
const BOM = String.fromCharCode(0xfeff)
const LRI = String.fromCharCode(0x2066)
const LS = String.fromCharCode(0x2028)

const base = { title: 'Picnic at mine', organiserName: 'Ethan', dates: ['2026-11-21'] }

describe('clean', () => {
  it('strips RLO, zero-width, BOM, isolates and line separators', () => {
    expect(clean(`Sam${RLO}moc.evil`)).toBe('Sammoc.evil')
    expect(clean(`${BOM}S${ZWSP}a${ZWJ}m${LRI}`)).toBe('Sam')
    expect(clean(`a${LS}b`)).toBe('ab')
    expect(clean('  lots   of\tspace \n ')).toBe('lots of space')
  })
  it('keeps the zero-width joiner and VS16 inside emoji sequences, and only there', () => {
    const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}'
    const rainbow = '\u{1F3F3}\uFE0F\u200D\u{1F308}'
    const toned = '\u{1F469}\u{1F3FD}\u200D\u{1F4BB}'
    const heart = '\u2764\uFE0F'
    expect(clean(`Sam ${family}`)).toBe(`Sam ${family}`)
    expect(clean(`Jo ${rainbow}`)).toBe(`Jo ${rainbow}`)
    expect(clean(`Ana ${toned}`)).toBe(`Ana ${toned}`)
    expect(clean(`Bo ${heart}`)).toBe(`Bo ${heart}`)
    expect(Name.parse(`Sam ${family}`)).toBe(`Sam ${family}`)
    // Between letters, at the ends, or after a non-emoji they are still invisible spoofing characters.
    expect(clean(`S${ZWJ}am`)).toBe('Sam')
    expect(clean(`Sam${ZWJ}\u{1F600}`)).toBe('Sam\u{1F600}')
    expect(clean(`\u{1F600}${ZWJ}`)).toBe('\u{1F600}')
    expect(clean('Sam\uFE0F')).toBe('Sam')
    expect(nameKey(`sam ${family}`)).toBe(nameKey(`SAM ${family}`))
  })
  it('normalises NFKC (fullwidth letters)', () => {
    expect(clean('Ｓａｍ')).toBe('Sam')
  })
})

describe('Name / Title', () => {
  it('stores names and titles without bidi or zero-width characters (checklist 33)', () => {
    expect(Name.parse(`${RLO}Sam${ZWSP}`)).toBe('Sam')
    expect(Title.parse(`Picnic${BOM} at${ZWJ} mine${RLO}`)).toBe('Picnic at mine')
  })
  it('rejects empty, invisible-only and symbol-only names', () => {
    expect(Name.safeParse('   ').success).toBe(false)
    expect(Name.safeParse(`${ZWSP}${RLO}`).success).toBe(false)
    expect(Name.safeParse('!!!').success).toBe(false)
    expect(Name.safeParse('李').success).toBe(true)
    // 40 characters as people count them: emoji are one each, not two UTF-16 units.
    expect(Name.safeParse('😀🎉🌸'.repeat(12) + 'ab').success).toBe(true)
    expect(Name.safeParse('a'.repeat(40)).success).toBe(true)
    expect(Name.safeParse('a'.repeat(41)).success).toBe(false)
    expect(Name.safeParse('😀'.repeat(40) + 'a').success).toBe(false)
  })
  it('strips the other invisible and format characters, so look-alike names share a name key', () => {
    const invisible = [0x00ad, 0x034f, 0x061c, 0x180e, 0xfe00, 0xfe0f, 0xe0001, 0xe0041, 0xe007f, 0x2064, 0xfff9]
    for (const cp of invisible) {
      const s = String.fromCodePoint(cp)
      expect(clean(`Sa${s}m`), cp.toString(16)).toBe('Sam')
      expect(nameKey(`Sa${s}m`), cp.toString(16)).toBe(nameKey('Sam'))
    }
    expect(nameKey(` ${RLO}SAM${ZWSP} `)).toBe('sam')
  })
  it('gives script homoglyphs and lookalike letters the same name key as the real name', () => {
    const victor = nameKey('Victor')
    const spoofs = [
      'Victоr',   // Cyrillic o
      'Vіctor',   // Cyrillic i
      'Victοr',   // Greek omicron
      'Viсtor',   // Cyrillic es
      'Vıctor',   // dotless i
      'VİCTOR',   // dotted capital I
      'VІCTOR',   // Cyrillic capital I
      'VIСTОR', // Cyrillic capital Es and O
      'VΙCTOR',   // Greek capital iota
      'Víctor',  // combining acute
    ]
    for (const s of spoofs) expect(nameKey(s), JSON.stringify(s)).toBe(victor)
    expect(nameKey('Olіve')).toBe(nameKey('Olive'))
    expect(nameKey('Аре')).toBe(nameKey('Ape'))   // whole-script Cyrillic lookalike
    // Real differences stay distinct, and non-Latin names keep their own keys.
    expect(nameKey('Victor')).not.toBe(nameKey('Viktor'))
    expect(nameKey('Eli')).not.toBe(nameKey('Ell'))
    expect(nameKey('Ian')).not.toBe(nameKey('Lan'))
    expect(nameKey('Дима')).not.toBe(nameKey('Даша'))
    expect(nameKey('민수')).not.toBe(nameKey('민지'))
    expect(nameKey('राम')).not.toBe(nameKey('रम'))
    expect(nameKey('Zoë')).toBe(nameKey('zoe'))
  })
  it('strips blank-rendering code points that are not format characters, so "Ethan" plus one collides with "Ethan"', () => {
    const blanks = [0x2800, 0x17b4, 0x17b5, 0x180b, 0x180c, 0x180d, 0x180e, 0x180f, 0x3164, 0x115f, 0x1160, 0xffa0, 0x034f, 0x16fe4, 0x1d159]
    for (const cp of blanks) {
      const s = String.fromCodePoint(cp)
      for (const variant of [`Ethan${s}`, `${s}Ethan`, `Et${s}han`, `Ethan${s}${s}${s}`]) {
        expect(clean(variant), cp.toString(16)).toBe('Ethan')
        expect(nameKey(variant), cp.toString(16)).toBe(nameKey('Ethan'))
        expect(Name.parse(variant), cp.toString(16)).toBe('Ethan')
      }
      expect(Name.safeParse(s.repeat(3)).success, cp.toString(16)).toBe(false)
    }
    // Visible-width spaces collapse and trim rather than survive as a distinct name.
    for (const cp of [0x00a0, 0x2000, 0x2007, 0x200a, 0x202f, 0x205f, 0x3000, 0x1680]) {
      expect(nameKey(`Ethan${String.fromCodePoint(cp)}`), cp.toString(16)).toBe(nameKey('Ethan'))
    }
  })
  it('rejects names made only of Hangul fillers (letters that render blank)', () => {
    for (const cp of [0x3164, 0x115f, 0x1160, 0xffa0]) {
      expect(Name.safeParse(String.fromCodePoint(cp).repeat(3)).success, cp.toString(16)).toBe(false)
    }
    expect(Name.parse(`${String.fromCodePoint(0x3164)}Sam`)).toBe('Sam')
    expect(Name.parse('민수')).toBe('민수')
  })
  it('caps lengths after cleaning', () => {
    expect(Name.safeParse('x'.repeat(40)).success).toBe(true)
    expect(Name.safeParse('x'.repeat(41)).success).toBe(false)
    expect(Title.safeParse('x'.repeat(60)).success).toBe(true)
    expect(Title.safeParse('x'.repeat(61)).success).toBe(false)
    expect(Title.safeParse(`${'x'.repeat(60)}${ZWSP}${ZWSP}`).success).toBe(true)
  })
})

describe('CreateEventInput', () => {
  it('applies defaults', () => {
    expect(CreateEventInput.parse(base)).toEqual({ ...base, note: '', mode: 'days', tz: 'Australia/Sydney' })
  })
  it('rejects bad dates, duplicates, too many and bad zones', () => {
    expect(CreateEventInput.safeParse({ ...base, dates: [] }).success).toBe(false)
    expect(CreateEventInput.safeParse({ ...base, dates: ['2026-02-30'] }).success).toBe(false)
    expect(CreateEventInput.safeParse({ ...base, dates: ['21/11/2026'] }).success).toBe(false)
    expect(CreateEventInput.safeParse({ ...base, dates: ['2026-11-21', '2026-11-21'] }).success).toBe(false)
    const many = Array.from({ length: 63 }, (_, i) => new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10))
    expect(CreateEventInput.safeParse({ ...base, dates: many }).success).toBe(false)
    expect(CreateEventInput.safeParse({ ...base, dates: many.slice(0, 62) }).success).toBe(true)
    expect(CreateEventInput.safeParse({ ...base, tz: 'Nowhere/Land' }).success).toBe(false)
    expect(CreateEventInput.safeParse({ ...base, mode: 'hours' }).success).toBe(false)
    expect(CreateEventInput.safeParse({ ...base, note: 'n'.repeat(141) }).success).toBe(false)
  })
})

describe('other inputs', () => {
  it('PatchEventInput needs at least one field', () => {
    expect(PatchEventInput.safeParse({}).success).toBe(false)
    expect(PatchEventInput.parse({ note: '' })).toEqual({ note: '' })
  })
  it('SetDatesInput needs 1..62 unique dates', () => {
    expect(SetDatesInput.safeParse({ dates: [] }).success).toBe(false)
    expect(SetDatesInput.safeParse({ dates: ['2026-11-21'] }).success).toBe(true)
  })
  it('JoinInput defaults answers and validates option ids', () => {
    expect(JoinInput.parse({ name: 'Sam' })).toEqual({ name: 'Sam', answers: [] })
    expect(JoinInput.safeParse({ name: 'Sam', answers: [{ optionId: 'BAD', value: 'free' }] }).success).toBe(false)
    expect(JoinInput.safeParse({ name: 'Sam', answers: [{ optionId: 'abcd2345', value: 'yes' }] }).success).toBe(false)
  })
  it('SaveAnswersInput allows null to clear', () => {
    expect(SaveAnswersInput.parse({ answers: [{ optionId: 'abcd2345', value: null }] }).answers[0].value).toBeNull()
    expect(SaveAnswersInput.safeParse({ answers: [] }).success).toBe(false)
  })
  it('LockInput defaults and time format', () => {
    expect(LockInput.parse({ optionId: 'abcd2345' })).toEqual({ optionId: 'abcd2345', time: null, place: '' })
    expect(LockInput.safeParse({ optionId: 'abcd2345', time: '24:00' }).success).toBe(false)
    expect(LockInput.safeParse({ optionId: 'abcd2345', time: '9:00' }).success).toBe(false)
    expect(LockInput.parse({ optionId: 'abcd2345', time: '18:30', place: ' My  place ' }).place).toBe('My place')
  })
  it('Place blocks script-ish URLs', () => {
    expect(Place.safeParse('javascript:alert(1)').success).toBe(false)
    expect(Place.safeParse('Data:text/html,hi').success).toBe(false)
    expect(Place.safeParse('Centennial Park').success).toBe(true)
  })
})
