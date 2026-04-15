# hangs

Group hangout planner. One link — everyone fills in when they're free, votes on what to do, picks if they're actually coming. The creator gets a plan with an honest headcount.

## Stack

- **Next.js 16** (App Router, Turbopack)
- **React 19**
- **Turso / libSQL** for the database (SQLite wire protocol, edge-replicated)
- **jose** for participant-identity JWTs
- **zod** for input validation
- **@upstash/ratelimit** for IP-level rate limiting (optional — falls back to no-op if env missing)
- **Framer Motion** for step transitions
- **Tailwind v4** via PostCSS (design tokens in `app/globals.css`)

## Local dev

```bash
npm install
```

Create a Turso database:

```bash
turso db create hangs-dev --group default
turso db show hangs-dev --url
turso db tokens create hangs-dev
```

Copy `.env.example` to `.env.local` and fill in:

```
TURSO_DATABASE_URL=libsql://hangs-dev-<org>.turso.io
TURSO_AUTH_TOKEN=<token>
PARTICIPANT_SECRET=$(openssl rand -base64 32)
```

Run:

```bash
npm run dev
```

Open <http://localhost:3000>.

Schema is created automatically on first request (`ensureSchema` in `lib/db.ts`).

## Deploy

Deploys on Vercel. Required env vars:

- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` — database
- `PARTICIPANT_SECRET` — JWT signing secret (generate fresh for production)

Optional:

- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — enables IP rate limiting via `middleware.ts`

## Architecture

The results page polls `/api/hangs/[id]/state` every 5s — a single batched read (~15 queries) returning everything the page needs in one round-trip. See `app/api/hangs/[id]/state/route.ts` and `lib/db.ts::synthesiseFromData`.

Identity: every participant gets a signed JWT on join. Every mutation route verifies the token and uses `payload.sub` as the authoritative participantId — **the server never trusts `participantId` in a request body**. See `lib/auth.ts`.

Pure synthesis: `synthesiseFromData(participants, availability, activities, commitments)` takes pre-fetched data and returns the recommended time/activity/confidence weighted by each participant's commitment level. No DB access.

## Routes

- `/` — landing
- `/create` — 5-step wizard (template → basics → activities → extras → review → done)
- `/h/[id]` — respond flow (name → availability → votes → dietary? → custom? → commitment)
- `/h/[id]/results` — synthesis + heatmap + bring list + comments + polls + etc.
- `/api/hangs/[id]/state` — batched read for the results page

## Where things live

| Concern | File |
|---|---|
| DB client + schema | `lib/db.ts` |
| JWT auth helpers | `lib/auth.ts` |
| zod schemas | `lib/schemas.ts` |
| Sanitized error helpers | `lib/errors.ts` |
| Rate limiting | `middleware.ts` |
| Design tokens | `app/globals.css` |
