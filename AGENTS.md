<!-- Agent instructions for the Hangs v2 repo (read by Claude Code via CLAUDE.md and by Codex). -->
<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Hangs v2: agent rules

One job: find the day everyone is free. One link, no sign-up, phone first.

## Safety (hard rules)
- **Never read, print or edit `.env.local`.** It holds production Turso credentials.
- **Never talk to the production database.** Every local run uses `HANGS_LOCAL_DB=1`, which makes `lib/db.ts` use `file:hangs-v2.local.db` and ignore the Turso variables even when `.env.local` sets them. `npm run dev`, `npm test`, `npm start` and `npm run build:local` set it for you.
- **Never run plain `npm run build` locally.** It is for Vercel only (it loads `.env.local`). Local QA: `npm run build:local` then `npm start`.
- Production Turso still holds the v1 tables (`hangs`, `participants`, `availability`, ...). v2 uses only `events`, `event_options`, `people`, `answers`, `rate_limits`, `schema_meta`. Never `DROP`, never `ALTER` a v1 table; schema SQL is `CREATE ... IF NOT EXISTS` only (plus the `schema_meta` version upsert; bump `SCHEMA_VERSION` in `lib/db.ts` when adding a table or index). `tests/safety.test.ts` enforces this.
- Database round trips are the cost that matters on Vercel (Tokyo functions, Tokyo Turso). Keep reads to 1 and mutations to 2 batches; `tests/round-trips.test.ts` asserts the counts via the `Server-Timing` header.

## Stack
Next.js 16.2 App Router, React 19, Tailwind v4 (tokens in `app/globals.css`), libSQL/Turso, zod v4, vitest, lucide-react icons.
- `params` is a Promise in pages, layouts, `generateMetadata` and route handlers (`RouteContext<'/api/events/[id]'>`). Always `await` it.
- Do not enable `cacheComponents` (route `dynamic` config depends on it being off).
- `lib/db.ts` `getDb()` is lazy; never call it at import time.

## Layout
- `lib/` pure logic + server repository (`events.ts`, `db.ts`, `http.ts`, `ratelimit.ts`, `tokens.ts`, `site.ts` are server-only). `lib/client/` is browser-only (`storage.ts`, `api.ts`, `useEvent.ts`, re-exported from `@/lib/client`).
- `app/api/events/**` route handlers. `app/h/[id]` event page. `app/page.tsx` create screen.
- `components/ui/` shared primitives (barrel `@/components/ui`). `components/create`, `components/event`, `components/organiser`, `components/locked` are feature folders. The event page is one of four posters: `SharePoster`, `AnswerFlow`, `ResultPoster`, `LockedInvitation`, all built on `DayGrid`.

## Conventions
- Every new file starts with a one-line comment saying what it does.
- Colours, radii, shadows and font sizes come only from tokens. `npm run lint` runs `scripts/check-tokens.mjs`, which fails on raw hex, `rgb()`, or Tailwind arbitrary colours/radii/font sizes/line heights in `app/**` and `components/**` (only `app/globals.css` is exempt). OG/icon code imports colours from `lib/brand.ts`.
- Look: full-bleed poster colours in Bricolage Grotesque. `components/event/Poster.tsx` sets the two poster colours and `.poster` in `globals.css` remaps every token to them, so shared controls work on any colour (sheets reset to black on white). Each date's colour comes from `lib/poster.ts`.
- Type scale: body `text-md` / `text-lg` / `text-h2`; headings `text-display` / `text-3xl`; poster sizes `text-weekday` / `text-day` / `text-day-sm` / `text-title`.
- Browser-only values (origin, mounted flag, in-app browser, reduced motion) come from `components/ui/hooks.ts` via `useSyncExternalStore`; never `setState` in an effect to read them.
- The viewer's temporary pre-join person has id `LOCAL_PERSON_ID` (`lib/state.ts`); use the constant, and exclude it from "others" counts.
- Each screen has one solid main button (`PosterButton`); yellow appears only on the create and share posters.
- No emoji in UI or generated messages. Icons are lucide-react. Colour is never the only signal.
- Australian English copy.

## Checks (all must pass)
```
npm test            # HANGS_LOCAL_DB=1 vitest run
npm run typecheck   # next typegen && tsc --noEmit
npm run lint        # eslint + token check
npm run build:local # HANGS_LOCAL_DB=1 next build
```

## Manual QA
`npm run build:local && npm start`, then open `http://localhost:3000` as the organiser and `http://127.0.0.1:3000` as a guest: the two origins have separate localStorage, so they behave like two phones. Check 375 px and 320 px widths (no horizontal scroll).

## Out of scope
Cut in v2 and not to be rebuilt without a decision: accounts, magic links, crews, notifications, activity voting, polls, expenses, photos, transport, weather, recaps, comments, reactions, bring lists, cron, templates, Google Calendar sync. Keep the data model generic (an event, its options, people's answers to options) so it can grow later.
