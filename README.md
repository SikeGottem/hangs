<!-- Hangs v2 readme: what it is, how to run it safely, and the API. -->
# Hangs

Find the day everyone is free. Pick some days, send one link to the group chat, see who's free. No accounts, no sign-up, built for phones.

## How it works
1. **Create** (`/`): title, optional note, your name, and candidate days on an inline calendar (whole days, or morning / afternoon / evening).
2. **Respond** (`/h/[id]`): everyone taps Free / If need be / Can't for each day. Answers autosave; the device remembers who you are.
3. **Results** (same page, live): a "best day" sentence plus a ranked list (most free, then fewest can't, then most if-need-be, then earliest).
4. **Lock** (organiser): pick the day, optionally a time and place. The page becomes the invitation; each person's answer for that day is their RSVP. Add to calendar via `.ics` or Google Calendar.

Identity is a random per-person token and an organiser key, stored only as sha256 hashes server-side and sent in `x-hangs-person` / `x-hangs-organiser` headers. Recovery links use the URL hash (`/h/{id}#k=...` organiser, `/h/{id}#p=...` personal).

## Running locally
```bash
npm install
npm run dev          # http://localhost:3000, local SQLite file hangs-v2.local.db
npm test
npm run typecheck
npm run lint         # eslint + design-token check
npm run build:local  # production build against the local DB
npm start            # serve the build:local output
```
`HANGS_LOCAL_DB=1` (set by the scripts) forces `file:hangs-v2.local.db` and ignores any Turso variables. Never run plain `npm run build` locally; it is the Vercel build and loads `.env.local`.

### Environment (`.env.example`)
| Var | Use |
|---|---|
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Production database (Vercel only) |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin for metadata, OG and ICS links |
| `HANGS_RL_SECRET` | Key for the rate-limit IP hash (falls back to `TURSO_AUTH_TOKEN`) |
| `HANGS_LOCAL_DB=1` | Local file DB; must not be set on Vercel |

## Data
Tables: `events`, `event_options`, `people`, `answers`, `rate_limits`, `schema_meta`, created idempotently on first use: the first batch on each instance carries a `schema_meta` version check (no extra round trip); a missing table creates the schema and retries, an older version re-runs the idempotent schema once. They never collide with the v1 tables still present in production, and nothing drops or alters v1 tables. Every mutation bumps `events.version`, which is also the ETag.

## API
| Method and path | Auth | Purpose |
|---|---|---|
| `POST /api/events` | none | Create; returns `organiserKey`, `personToken`, state |
| `GET /api/events/[id]` | optional | State; `ETag` / `If-None-Match` -> 304 |
| `PATCH /api/events/[id]` | organiser | Edit title / note |
| `PUT /api/events/[id]/options` | organiser | Set candidate dates |
| `POST /api/events/[id]/people` | none | Join with a name (+ held answers) |
| `PATCH /api/events/[id]/people/me` | person | Rename yourself |
| `DELETE /api/events/[id]/people/[personId]` | organiser | Remove someone's response |
| `PUT /api/events/[id]/answers` | person | Save answers (`null` clears) |
| `POST /api/events/[id]/lock` / `DELETE` | organiser | Lock (or change) / unlock |
| `GET /api/events/[id]/ics` | none | Calendar file for a locked hang |
| `GET /api/events/[id]/og`, `GET /api/og` | none | Link-preview images |

Errors are `{ "error": { "code", "message" } }` with human-readable messages. Writes require `Content-Type: application/json`. The event GET's etag is `{version}-{today in the event tz}`.

### Speed and privacy
- Functions run in Tokyo (`vercel.json` `regions: ["hnd1"]`) next to the Turso database; Turso is reached over HTTPS (a `libsql://` URL is rewritten), one request per batch.
- Round trips per request: GET state 1 (the 304 path too: a conditional batch returns only the event row when the version is unchanged); `/h/[id]` render 1 (page and metadata share a React `cache()`); OG and ICS 1; every mutation 2 (a preflight batch with rate limits, event, identity rows and options, then the write batch that also reads the new state). Every API response carries `Server-Timing: db;dur=…;desc="N trips"`; the page logs the same as `[hangs:timing]`.
- Rate limits are counted inside the preflight batch: fixed windows per IP (and per event), keyed by an HMAC of the IP with a server secret and the UTC day (never the raw IP); unknown ids never write per-event rows; expired rows (older than the longest window, 1 hour) are pruned in the same batch. Reads never write: only an in-memory, per-instance limit on repeated 404s, shared by the state GET, `/ics`, `/og` and the `/h/[id]` page (a blocked IP gets 429, the brand card or not-found with no database read). Names are unique per hang by a confusable skeleton (`lib/schemas.ts` `nameKey`: diacritics dropped, Cyrillic/Greek lookalikes and dotless i folded to Latin, case folded).
- Event pages and `/api` send `X-Robots-Tag: noindex, nofollow` and `Referrer-Policy: no-referrer` (plus robots/referrer meta); `app/robots.ts` keeps crawlers out of `/api` except the OG images. An inline script in the root layout moves `#k=` / `#p=` out of the address bar before first paint.

## Pages
`/` create · `/h/[id]` event (planning, results and the locked invitation on one URL; `?l=` is a preview cache-buster) · `/privacy` · not-found and error pages. `/h/[id]` sets state-aware Open Graph metadata (planning vs locked) pointing at `/api/events/[id]/og?v={version}`.

## Code map
| Path | What |
|---|---|
| `lib/rank.ts`, `lib/state.ts`, `lib/next-action.ts` | Pure ranking, derived state, and which control gets the yellow |
| `lib/events.ts`, `lib/db.ts`, `lib/ratelimit.ts` | Server repository (preflight batch + write batch per mutation), DB selection, lazy schema and the round-trip counter, rate limits |
| `lib/client/` | Browser-only: `storage.ts` (identity in memory first, then localStorage; hash links; pending answers), `api.ts` (fetch wrappers), `useEvent.ts` (optimistic answers, join, save queue, polling), `poll.ts` (poll pace: paused while hidden, slower while unchanged, backoff with jitter and Retry-After) |
| `components/ui` | Shared primitives and browser hooks |
| `components/create`, `event`, `organiser`, `locked` | The create screen, event page, organiser tools and locked invitation |
| `app/api/og/og-kit.tsx` | Satori cards for link previews (fonts from `assets/fonts`) |
