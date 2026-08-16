# Doom Eradicators — Celeris August Bingo tracker

A shared, mobile-first OSRS clan bingo tracker. Nine 3×3 regions (81 tiles) plus nine bridge tiles
that gate region unlocks. Players claim tiles, log progress, answer a pre-event planning question
per tile, and read tile-specific rules. One leader has extra controls.

Built with **Next.js (App Router, TypeScript)**, **Supabase** (Postgres + Realtime), and
**Tailwind CSS v4**. Rebuilt to the design in `design-reference/` (the working HTML prototype is the
source of truth for look, copy, and behaviour).

## Sign-in: there isn't one

This is a small, trusted clan event, so there are no accounts, emails, or passwords. Players **tap
their character** and play; a private cookie remembers who they are, and tapping the same name on any
device picks their identity back up. Every write goes through a **server action** using the Supabase
**service-role key**, so the public key can only *read* (the board + realtime) — the database is not
writable with the key shipped to the browser. The **leader** unlocks extra controls by typing a
secret code once (MY SETUP → Leader access), checked server-side against the `LEADER_CODE` env var and
independent of which name they pick.

## Architecture

```
app/                     routes
  (app)/                 shell: layout + header/tabs, one route per tab
    board/ planning/ my-tiles/ setup/ rules/ roster/
  onboarding/            character pick + gear check (first run)
  actions.ts            server actions — every mutation (service-role writes)
components/              client components (tiles, sheets, views, header, provider)
lib/
  board-data.ts         static content, copied verbatim from the design reference
  scoring.ts            ALL game logic as pure functions (unit-tested)
  scoring.test.ts       34 unit tests
  data.ts               server-side event-state loader + serializable snapshot
  session.ts            cookie identity + leader-code check (server only)
  types.ts              client-safe shared types
  supabase/             admin (service-role) + browser (anon, realtime) clients
supabase/migrations/    SQL schema, RLS, realtime publication
public/sprites/         self-hosted OSRS item icons
```

Rules held to:

- **Static content stays static.** Regions, tiles, bridges, drop rates and rule text ship in the
  bundle from `lib/board-data.ts`. Only event state lives in the database. Tile ids in that file are
  the primary keys used everywhere.
- **All game logic lives in `lib/scoring.ts`** as pure functions over `(boardData, eventState)`:
  region unlock, tile state, goal parsing, progress totals, points, tile rules, and OSRS estimates.
  Components never re-derive scoring inline. Run the tests with `npm test`.
- **Server components fetch, client components interact.** The `(app)` layout loads state on the
  server once per request (`React.cache`), hands a serializable snapshot to a client provider, and
  the interactive sheets/buttons call server actions.
- **Optimistic UI + realtime.** Mutations patch a local snapshot immediately; a Supabase Realtime
  subscription refreshes every other player's view within a second.

## Local development

1. `npm install`
2. Create a Supabase project. In **Settings → API** copy the project URL, the **anon** key, and the
   **service_role** key.
3. `cp .env.example .env.local` and fill in all four values:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...        # secret — server only
   LEADER_CODE=some-secret-code         # what the leader types to unlock controls
   ```
4. Apply the schema: paste `supabase/migrations/0001_init.sql` into the Supabase **SQL editor** and
   run it (or `supabase db push` with the CLI). This creates the tables, the read-only RLS policies,
   and enables Realtime. (No auth config is needed — the app has no login.)
5. `npm run dev` and open http://localhost:3000. Tap a character to play.

### The leader

Two conditions must both hold to get leader controls:

1. **Be a designated leader** — either a name in `LEADER_NAMES` (`lib/board-data.ts`, currently
   `Wetfrog1998` and `JustAWeasel`) or a row with `is_leader = true`. `Wetfrog1998` isn't one of the
   16 roster players (it's the organiser), so it's offered on the picker in addition to the roster.
2. **Enter the static `LEADER_CODE`** once on the device — via the **UNLOCK LEADER** button that
   appears in the nav bar for designated leaders. This stops anyone who taps a leader's name from
   using the controls. Tap the **LEADER** badge to lock again (e.g. on a shared device).

To add or change leaders, edit `LEADER_NAMES`, or promote anyone already playing from the SQL editor
(`update public.players set is_leader = true where name = 'SomeName';`). Change the gate by editing
`LEADER_CODE`.

## Data model

Static board content is in code. These tables hold event state (see the migration for full detail):

- `players (id uuid, name unique, is_leader, rares text[], task, created_at)`
- `tile_claims (tile_id, player_id, …)` — "I'm on this"
- `tile_progress (tile_id, player_id, count ≥ 0, …)` — per-player progress
- `tile_completions (tile_id pk, completed_at, completed_by)` — derived from progress or leader-forced
- `tile_intents (tile_id, player_id, intent in ('want','ok','no'))` — planning answers
- `focus (kind in ('region','tile'), target_id)` — leader's team focus

Completion is derived from progress (sum of counts ≥ goal, goal parsed from the objective by
`lib/scoring.ts`). The `logProgress` server action writes/removes the `tile_completions` row right
after updating progress, so `completed_at` and the leader's manual override share one home. Dropping
below the goal (or the leader toggling it off) removes the row.

## Security model

This is a low-stakes, trusted event, and the design goal was zero-friction "tap and play". The
trade-offs, made deliberately:

- **The database is read-only to the public key.** RLS is enabled with `select`-only policies and
  **no** insert/update/delete policies, so the anon key shipped to the browser cannot write anything
  — it only powers the board and the realtime subscription. Every mutation runs server-side through a
  server action using the **service-role key**, which never leaves the server.
- **Identity is by trust, like the prototype.** Anyone can tap any character (that's the whole UX),
  so there's no protection against a clanmate impersonating another player. Acceptable for 17 friends
  running a two-week event; not what you'd ship to strangers.
- **Leader actions are gated server-side** on every call (force-complete, focus, remove crew): the
  action confirms the acting player is a designated leader (`LEADER_NAMES` or the `is_leader` column)
  **and** that the device holds the correct `LEADER_CODE` cookie. So tapping a leader's name is not
  enough — you also need the code.

If you ever needed real per-player enforcement, the move would be Supabase Auth (anonymous or magic
link) with `players.id = auth.uid()` and per-row RLS — see git history for that variant.

## Scripts

| command | what |
| --- | --- |
| `npm run dev` | dev server |
| `npm run build` / `npm start` | production build / serve |
| `npm test` | scoring unit tests (Vitest) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

## Deploy (Vercel)

1. Import the repo into Vercel.
2. Add all four env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `LEADER_CODE`. Mark the last two as sensitive.
3. Deploy, then share the URL with the clan. No auth callback or redirect config needed.

## Out of scope

No image uploads, no Discord integration, no admin CRUD for tiles, no dark/light toggle, no i18n.
To change board content, edit `lib/board-data.ts` (goals are parsed from the objective text at
runtime, so nothing to re-seed).
