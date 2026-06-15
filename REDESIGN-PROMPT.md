# Hangs — Frontend Redesign Brief

You are redesigning the frontend of **Hangs**, a group-hangout planning web app. The product works. The goal is to make the interface beautiful enough that people actually want to send a Hangs link in their group chat — because in this category, **ugliness is the distribution killer**. The top cross-category user complaint about LettuceMeet / When2Meet / Doodle is *"it looks ugly enough to embarrass the sender."* Fix that.

Repo: `~/Developer/hangs`. Stack: Next.js 16 (App Router) · React 19 · Tailwind v4 · Framer Motion 12 · Turso/libSQL.

---

## 1. The product in one breath

One link → everyone drags across a grid to mark when they're free → votes on activities → app synthesises the best time + thing → group locks it in. Plus a post-decision hub for bring-list, transport, expenses, photos.

**The wedge is the pre-decision flow.** Logistics (bring-list, expenses, transport) are optional add-ons and should feel like it — never headline them.

**The defensible moat is the COMBO, not any single feature**: drag-paint grid + activity voting + three-tier commitment (in / probably / can't) + mobile-first + cross-platform. Every screen should feel like these pieces belong to the same product, not bolted on.

---

## 2. Who this is for

- 18–25, university students, friend groups of 3–8.
- Plan via **Messenger** (AU) and group chats. iMessage is NOT the primary channel in the target market.
- Plan on their phone first, laptop second.
- Using this because LettuceMeet feels like tax software.
- Least-interested person in the group is the adoption gate — the tool has to be fast and pretty enough that they bother.

**"Tonight?" spontaneous hangouts are ~30% of the job** — the creation flow needs a path that is <10 seconds end-to-end. Messenger polls win this today because they're instant. Matching that speed is a design constraint, not an aspiration.

---

## 3. Visual direction — keep and sharpen

**Existing system** (in `app/globals.css`, keep the spirit, refine the execution):

- **Mood:** Amie Calendar × Field Notes notebook. Warm, editorial, a little analog. Zero corporate SaaS feel. This must look **obviously-not-for-work** on first glance — if it reads like a Calendly clone, we've lost.
- **Palette:**
  - Background `#FAF8F3` (warm off-white, not pure)
  - Surface `#FFFFFF`, surface-dim `#F2EFE8`
  - Text `#1A1A1A` / `#6B6B6B` / `#A3A3A3`
  - **One accent, used sparingly:** yellow `#F5C842`
  - Availability signal: free `#34C26A`, maybe `#F5C842`, busy `#E8E3D9`
  - Destructive `#E05252`, celebrate `#FF6B2B`
- **Type:** Plus Jakarta Sans (display), Inter (body), JetBrains Mono (eyebrow labels, grid headers, timestamps). Keep the monospace-for-metadata detail — it's the Field Notes half of the identity.
- **Shape:** Generous radii (8/12/16/20), soft shadows, no hairline strokes that disappear on phone OLEDs.

**Where to push further:**
- The landing page currently looks like a product demo. It should feel like a **small, confident indie product** — closer to Partiful's warmth and Arc's restraint than a SaaS homepage. Less "features grid," more one beautiful thing that animates on load.
- Give the grid character. Right now it's technically fine but visually generic. Think about subtle paper/notebook texture, a micro-ruler on the time axis, soft shadow under the current-time cursor — details that only show up on a second look.
- Yellow accent should be **earned, not decorative**. Reserve it for the one thing the user should tap next. If every page has five yellow things, none of them are the answer.
- Avoid emoji-driven UI. If an icon is needed, use a real icon system (Lucide or a hand-drawn set that matches the notebook feel). Emoji should only appear where the user typed them.

---

## 4. Screens to redesign (priority order)

### A. `/` — landing
Currently animated demo cards. Make this **the single most share-safe link in the friend group.** It's what someone lands on when they tap the link a friend pasted. First impression sells the whole product.

- Above-the-fold must answer: "what is this, and can I start without signing up?"
- One visible CTA, one secondary action (e.g. "see an example hang").
- Live mini-demo of the grid filling in — keep this idea but make it *quiet*; right now it can feel busy.
- Zero testimonials/logos/waitlists. Nothing that feels corporate.
- Social proof ok as *soft* signal — "12 hangs planned this week at UNSW" vibe, not "trusted by 500k teams."

### B. `/create` — 5-step wizard
This is where creators build a hang. It already has 5 steps (name → dates → activities → extras → done). Keep the stepper, but:

- Step transitions should feel like flipping a page, not a web form.
- The "Extras" step (theme / dress code / dietary toggle / bring-list seed / deadline) is optional — make it look optional. Collapsible, not mandatory-looking.
- Final "Done" screen has a QR code + share buttons. This is the **launchpad** — design it to make sharing feel inevitable. Add a "Copy for Messenger" primary, "Copy for WhatsApp" secondary, with tap-to-preview of the OG card as it will render on the platform.

### C. `/h/[id]` — respond flow
The responder journey: context card → grid → activity votes → (optional dietary) → (optional custom) → commitment → submit. This is where the least-engaged friend gives up if we aren't fast enough.

- **Grid is the heart of the app.** It must work flawlessly on a 375px-wide thumb. Drag-paint, not tap-each-cell. Range mode AND specific-days mode both need to feel native.
- The three-tier commitment step (`in` / `probably` / `can't`) is the product's moat vs. LettuceMeet — give it the weight of a real decision, not a throwaway radio. Big pill buttons, warm copy ("Are you actually coming?"), feel of pressing a physical switch.
- Progress indicator must feel like a small trail ("3 of 5") not a hospital form.
- Context card at the top (description / theme / dress code / bring list seed) should read like a party invite, not a spec sheet.

### D. `/h/[id]/results`
The synthesis screen — "best time" + "recommended activity" + who's in. This is the **second share moment**: the group sees the plan forming.

- The top recommendation should feel like a card someone could screenshot and paste into the group chat. Design it to be screenshot-worthy.
- Show the commitment breakdown cleanly (e.g. "4 in · 2 probably · 1 can't"). Per-participant chips with commitment state.
- Soft warning if `<3` "I'm in" — never hard-block.
- Confirm CTA is the only yellow thing on the screen.

### E. `/h/[id]/confirmed`
Locked-in plan view — calendar export, bring-list, transport, comments, photos, expenses. This is the **post-decision hub** and it's where 90% of other tools die. Right now the features exist but the screen can feel like a dashboard. Re-frame it as a **digital invitation that keeps updating** — not a project tracker. One-tap `.ics` / Google Cal export has to be visually prominent.

### F. `/crews/*`, `/login`
Exist but lower priority. Keep consistent with the system; don't over-invest yet.

---

## 5. Interaction & motion principles

- **Framer Motion is already in the stack.** Use it for state transitions, not decoration. Every animation should communicate causality (cell fills → count updates → best-slot shifts).
- **Optimistic UI** on every mutation: RSVP, vote, commitment, bring-list claim. Server confirm is a quiet toast, not a blocking spinner.
- **Skeleton loaders** on first paint — the consolidated `/api/hangs/[id]/state` endpoint can be 1–2s cold. Don't show a blank screen.
- **Undo toasts** for destructive actions (remove participant, delete activity) — replace every native `confirm()`/`alert()` with soft-delete + 5s undo.
- **Reduced-motion media query is respected already — keep it that way.** Any new animation must have a reduced-motion fallback.
- **Haptics on mobile** (where supported) for drag-paint grid and commitment pill selection. Small but disproportionately pleasant.

---

## 6. Accessibility — a real requirement, not a sweep

The grid currently has **zero aria labels / roles**. Fix this properly:

- `role="grid"`, `role="gridcell"`, arrow-key navigation, Space to toggle.
- Every interactive element needs a visible `:focus-visible` state (the baseline is already in `globals.css` — extend it consistently).
- Colour-is-not-the-only-signal: the free/maybe/busy states need an additional glyph or pattern for colourblind users. Today they're pure colour.
- Screen-reader summary of the current grid state ("You are free on Mon 3pm; 4 other people also free") on focus.
- Touch targets 44×44 minimum for every tap-target on mobile.

A11y is **not separate from the design** — bake it in as you go, don't bolt it on.

---

## 7. Social / OG / share surfaces

This product lives or dies by how it renders **in a Messenger group chat preview.** The redesign must include:

- `/api/og` (already exists via `@vercel/og`) — redesign the OG card. It should render the hang name, day/time if confirmed, who's in so far, in the same visual language as the site. **Test it in a real Messenger preview, not just Twitter.**
- The share sheet on the "Done" screen should let the creator preview the OG card *as the crawler sees it* before pasting. This is a real feature, not a nice-to-have.
- If a hang is confirmed, the OG card should change to reflect the locked plan ("Sat 6pm · Bondi · 7 going").

---

## 8. What to avoid (explicit anti-patterns)

- Do **not** make it look like Calendly / Doodle / LettuceMeet. If someone opens the tab and thinks "work," we've failed.
- Do **not** add a navbar with Features / Pricing / Login / Docs. This is a consumer product.
- Do **not** over-decorate with gradients, glassmorphism, or generic 2024 AI-SaaS chrome. The Field Notes half of the identity is an anti-AI-aesthetic on purpose.
- Do **not** introduce a second accent colour. The single yellow is the brand.
- Do **not** expand the feature surface. Every redesign change should map to one of: clearer pre-decision flow, cleaner share moment, better mobile, better accessibility.
- Do **not** ship pixel-tweaks without testing on a real 375px Android Chrome. Emulators lie about touch feel.

---

## 9. Competitive reference points

Look at, but don't copy:

- **Partiful** — brand warmth, consumer energy, event-hub polish. Weakness: still discrete-options scheduling, no drag-paint.
- **Amie** — the calendar aesthetic we're borrowing. Look at their microcopy and grid density.
- **Field Notes** — the notebook half of the mood board. Monospace labels, dotted rules, warmth without kitsch.
- **Arc (browser)** — restraint, confident whitespace.
- **blob.day** — the closest indie peer building right now. Study what they don't do.
- **Push** (shut Nov 2024) — read Justin Guo's post-mortem (`justinguo.substack.com/p/a-hangout-app-that-never-went-viral`) before making any growth-oriented design decisions. Key lesson: 20% of users create 80% of hangouts — design for the returning creator, not just the first-time responder.

---

## 10. Deliverables

- Redesigned components for the five priority screens (A–E above).
- Updated `globals.css` (don't fork the token system — evolve it).
- A design pass on the `/api/og` route rendered card.
- A11y audit notes inline in code comments where decisions were made.
- Before/after screenshots at 375px (iPhone 12 mini) and 1440px (MBA 13) for every screen.
- A short written rationale for any token change (don't just move `--accent` without saying why).

Success criteria: **Ethan can paste a `/h/[id]` link into a UNSW society Messenger group chat of 200 people and not feel embarrassed.** That's the bar.
