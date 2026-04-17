// Zod schemas for every mutation endpoint. Keep limits tight — these fields
// are user-supplied and go straight into the DB; the server is the only place
// we can enforce them. Update the limits table in the plan if these change.

import { z } from 'zod'

// ── primitives ──
const ShortText = (max: number) =>
  z.string().trim().min(1, 'Required').max(max, `Too long (max ${max})`)
const OptionalShortText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(''))
const HangId = z.string().min(4).max(32)
const ParticipantId = z.string().min(4).max(64)
const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')
const Hour = z.number().int().min(0).max(23)

// Location: allow plain text OR http/https URLs — reject javascript:/data:/etc.
const SafeLocation = z
  .string()
  .trim()
  .max(200)
  .refine(v => !/^javascript:/i.test(v) && !/^data:/i.test(v) && !/^vbscript:/i.test(v), 'Unsafe URL')
  .optional()
  .or(z.literal(''))

// ── POST /api/hangs ──
export const CreateHangSchema = z.object({
  name: ShortText(120),
  creatorName: ShortText(50),
  dateMode: z.enum(['range', 'specific']).default('range'),
  dateRangeStart: DateStr.optional(),
  dateRangeEnd: DateStr.optional(),
  selectedDates: z.array(DateStr).max(31).optional(),
  activities: z
    .array(
      z.union([
        ShortText(60),
        z.object({
          name: ShortText(60),
          costEstimate: OptionalShortText(40),
        }),
      ]),
    )
    .max(50)
    .optional(),
  template: OptionalShortText(40),
  location: SafeLocation,
  duration: z.number().int().min(1).max(24).default(2),
  // Phase 2 Extras — all optional creator-seeded fields
  description: OptionalShortText(300),
  theme: OptionalShortText(60),
  dressCode: OptionalShortText(60),
  responseDeadline: DateStr.optional(),
  askDietary: z.boolean().optional(),
  customQuestion: OptionalShortText(200),
  bringListSeed: z.array(ShortText(100)).max(20).optional(),
  // Crew-scoped hang: when set, creator must be a member of this crew and
  // hangs.crew_id is populated so crew views can roll this hang up.
  crewId: z.string().min(4).max(32).optional(),
})

// ── POST /api/hangs/[id]/join ──
// Name is optional when the caller is a logged-in crew member — the server
// pulls display_name + dietary from their crew profile in that case.
export const JoinSchema = z.object({
  name: ShortText(50).optional(),
})

// ── POST /api/hangs/[id]/availability ──
// Also accepts an optional commitment field — the respond-flow submits both
// together in the final step, so we save a round-trip by bundling them.
export const AvailabilitySchema = z.object({
  slots: z
    .array(
      z.object({
        date: DateStr,
        hour: Hour,
        status: z.enum(['free', 'maybe', 'busy']),
      }),
    )
    .max(500),
  commitment: z.enum(['in', 'probably', 'cant']).optional(),
  dietary: OptionalShortText(60),
  customAnswer: OptionalShortText(300),
})

// ── POST /api/hangs/[id]/vote ──
export const VoteSchema = z.object({
  // bulk shape (preferred) OR legacy single-vote shape
  votes: z
    .array(
      z.object({
        activityId: z.number().int().positive(),
        vote: z.enum(['up', 'meh', 'down']),
      }),
    )
    .max(100)
    .optional(),
  activityId: z.number().int().positive().optional(),
  vote: z.enum(['up', 'meh', 'down']).optional(),
})

// ── POST /api/hangs/[id]/comments ──
export const CommentSchema = z.object({
  text: ShortText(500),
})

// ── POST /api/hangs/[id]/transport ──
export const TransportSchema = z.object({
  mode: z.enum(['driving', 'need_ride', 'own_way']),
  seats: z.number().int().min(0).max(20).optional(),
})

// ── POST /api/hangs/[id]/photos ──
export const PhotoSchema = z.object({
  data: z.string().min(10).max(6_000_000),
  caption: OptionalShortText(200),
})

// ── POST /api/hangs/[id]/bring-list ──
export const BringListSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('add'),
    item: ShortText(100),
    parentId: z.number().int().positive().nullable().optional(),
  }),
  z.object({
    action: z.literal('claim'),
    itemId: z.number().int().positive(),
    note: OptionalShortText(100),
  }),
  z.object({
    action: z.literal('unclaim'),
    itemId: z.number().int().positive(),
  }),
  z.object({
    action: z.literal('remove'),
    itemId: z.number().int().positive(),
  }),
])

// ── POST /api/hangs/[id]/expenses ──
export const ExpenseSchema = z.object({
  description: ShortText(120),
  amount: z.number().positive().max(1_000_000),
  splitBetween: z.array(z.string()).max(50).optional(),
})

// ── POST /api/hangs/[id]/polls ──
export const PollsSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    question: ShortText(200),
    options: z.array(ShortText(60)).min(2).max(10),
  }),
  z.object({
    action: z.literal('vote'),
    optionId: z.number().int().positive(),
  }),
])

// ── POST /api/hangs/[id]/rsvp ──
export const RsvpSchema = z.object({
  status: z.enum(['going', 'maybe', 'cant']),
})

// ── POST /api/hangs/[id]/commitment ──
export const CommitmentSchema = z.object({
  level: z.enum(['in', 'probably', 'cant']),
  dietary: OptionalShortText(60),
  customAnswer: OptionalShortText(300),
})

// ── PATCH /api/hangs/[id] ──  creator-only editable fields
// Dates are NOT in here — they require a destructive confirmation path.
export const EditHangSchema = z
  .object({
    name: ShortText(120).optional(),
    description: OptionalShortText(300),
    theme: OptionalShortText(60),
    dressCode: OptionalShortText(60),
    location: SafeLocation,
    customQuestion: OptionalShortText(200),
    askDietary: z.boolean().optional(),
    responseDeadline: DateStr.optional().or(z.literal('')),
  })
  .refine(v => Object.values(v).some(x => x !== undefined), 'No fields to update')

// ── POST /api/hangs/[id]/activities ──
export const AddActivitySchema = z.object({
  name: ShortText(60),
  costEstimate: OptionalShortText(40),
})

// ── POST /api/hangs/[id]/settings ──
export const SettingsSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('lock') }),
  z.object({ action: z.literal('unlock') }),
  z.object({ action: z.literal('cancel') }),
  z.object({ action: z.literal('uncancel') }),
])

// ── POST /api/hangs/[id]/reactions ──
export const ReactionSchema = z.object({
  emoji: ShortText(40),
})

// ── POST /api/hangs/[id]/confirm ──
// Three modes: unconfirm (creator), force-confirm (creator override), or cast a vote (guest)
export const ConfirmSchema = z.union([
  z.object({ action: z.literal('unconfirm') }),
  z.object({
    action: z.literal('force'),
    date: DateStr,
    hour: Hour,
    activityName: OptionalShortText(60),
  }),
  z.object({
    vote: z.enum(['yes', 'no']).optional(),
    date: DateStr.optional(),
    hour: Hour.optional(),
    activityName: OptionalShortText(60),
  }),
])

// ── DELETE /api/hangs/[id]/participants ──
export const ParticipantDeleteSchema = z.object({
  targetParticipantId: ParticipantId.optional(), // optional = self-delete
})

// ── Crew pivot schemas ──

const Email = z.string().trim().toLowerCase().email('Invalid email').max(200)

// POST /api/auth/request-magic-link
export const RequestMagicLinkSchema = z.object({
  email: Email,
  // Optional redirect after verification (must be a relative path to prevent open-redirect)
  redirect: z
    .string()
    .max(300)
    .regex(/^\/[^/]/, 'Must be a relative path')
    .optional(),
})

// POST /api/crews
export const CreateCrewSchema = z.object({
  name: ShortText(80),
  description: OptionalShortText(400),
  inviteEmails: z.array(Email).max(50).optional(),
})

// PATCH /api/crews/[id]
export const UpdateCrewSchema = z
  .object({
    name: ShortText(80).optional(),
    description: OptionalShortText(400),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9-]{2,40}$/, 'Slug must be 2-40 chars: lowercase letters, numbers, hyphens')
      .optional(),
    // Recurring rule: "weekly:dow:hour" or "biweekly:dow:hour". Empty string clears.
    // dow = mon|tue|wed|thu|fri|sat|sun, hour = 0-23
    recurringRule: z
      .string()
      .regex(/^(?:|(?:weekly|biweekly):(?:mon|tue|wed|thu|fri|sat|sun):(?:[0-9]|1[0-9]|2[0-3]))$/, 'Invalid recurring rule')
      .optional(),
    recurringTemplateHangId: z.string().min(4).max(32).optional(),
    coverColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be #RRGGBB').optional().or(z.literal('')),
    coverEmoji: z.string().max(8).optional().or(z.literal('')),
  })
  .refine(v => Object.values(v).some(x => x !== undefined), 'No fields to update')

// POST /api/crews/[id]/members
export const InviteMembersSchema = z.object({
  emails: z.array(Email).min(1).max(50),
})

// PATCH /api/crews/[id]/members/[userId]
export const UpdateMemberProfileSchema = z
  .object({
    displayName: ShortText(60).optional(),
    dietary: OptionalShortText(60),
    transportPreference: z
      .enum(['own_way', 'driving', 'need_ride', 'passenger', 'none'])
      .optional(),
    contactPhone: OptionalShortText(40),
    notes: OptionalShortText(400),
    role: z.enum(['exec', 'member']).optional(),
    // Availability shape: weekday+hour → status. Bounded to prevent abuse.
    availabilityShape: z
      .record(z.string().regex(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\|\d{1,2}$/), z.enum(['free', 'maybe', 'busy']))
      .optional(),
  })
  .refine(v => Object.values(v).some(x => x !== undefined), 'No fields to update')

// POST /api/crews/[id]/hangs — same as CreateHangSchema but scoped to crew
// (crew context is inferred from the path, not the body, so schema is reused)

// Helper: run a schema.safeParse and return either the data or a 400 NextResponse.
export function parseBody<T extends z.ZodTypeAny>(
  body: unknown,
  schema: T,
): { data: z.infer<T> } | { error: string } {
  const result = schema.safeParse(body)
  if (!result.success) {
    const first = result.error.issues[0]
    const path = first.path.join('.')
    return { error: path ? `${path}: ${first.message}` : first.message }
  }
  return { data: result.data }
}
