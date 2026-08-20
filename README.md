# Doom Eradicators — Celeris August Bingo tracker

A shared, mobile-first OSRS clan bingo tracker. Nine 3×3 regions (81 tiles) laid out as a 3×3 map,
plus a bridge tile on each of the 12 borders between neighbouring regions. Bridges gate region
unlocks and work both ways: you cross from whichever of a bridge's two regions is already open, and
clearing it opens the other. Players claim tiles, log progress, answer a pre-event planning question
per tile, and read tile-specific rules. One leader has extra controls.

Built with **Next.js (App Router, TypeScript)**, **Supabase** (Postgres + Realtime), and
**Tailwind CSS v4**. Rebuilt to the design in `design-reference/` (the working HTML prototype is the
source of truth for look, copy, and behaviour).

## Sign-in: Discord

Players sign in with **Discord** (Supabase OAuth). On first login they **link** their Discord to one
team character — choosing their seat alongside their mega-rares and slayer task. That seat is then
locked to that Discord account and disappears from everyone else's picker. One Discord ↔ one player,
both unique (`players.auth_user_id`).

Because the roster is finite, once every seat is linked a newly-arriving Discord has nothing to claim
and sees an on-theme **TEAM FULL** screen. Existing player rows (e.g. from before this feature) are
claimable — the real person logs in, picks their name, and inherits the row's progress.

Writes still run through **server actions** using the Supabase **service-role key** (the public key
can only read — board + realtime). Identity for those writes comes from the Discord session. The
**leader** additionally unlocks controls with a secret code once per device (nav bar → **UNLOCK
LEADER**), checked server-side against `LEADER_CODE`.

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
  scoring.test.ts       unit tests, incl. a pinned goal for every tile and bridge
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
  board geometry, region unlock, tile state, goal parsing, progress totals, points, tile rules, and
  OSRS estimates. Components never re-derive scoring inline. Run the tests with `npm test`.
- **Bridges are edges, not properties of a region.** Each one stores only `between: [regionA,
  regionB]`; which way it is crossed, which region it opens, its prereq tile (the tile facing it on
  the side you cross from) and where it is drawn on the map are all derived from the 3×3 grid.
  Region unlock is graph reachability from `central`, so a region can be opened from any side.
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
4. Apply the schema: run `supabase/migrations/0001_init.sql`, then `0002_discord_auth.sql`, then
   `0004_tile_items.sql`, then `0005_tile_proofs.sql` in the Supabase **SQL editor** (or
   `supabase db push`). These create the tables + read-only RLS, enable Realtime, add the
   `players.auth_user_id` link column, add the per-item tick table for checklist tiles, and add the
   proof-links table. (`0003` deletes a player who left; skip it on a fresh database.)
5. **Enable Discord auth** (see the Discord setup section below), and add your local + prod URLs under
   **Authentication → URL Configuration** (Site URL + `http://localhost:3000/auth/callback` and
   `https://<your-app>.vercel.app/auth/callback` as Redirect URLs).
6. `npm run dev` and open http://localhost:3000. Sign in with Discord, link your character, play.

### Setting up Discord login

1. **Discord Developer Portal** (https://discord.com/developers/applications) → **New Application**.
2. **OAuth2** tab → copy the **Client ID** and **Client Secret** (reset the secret to reveal it).
3. Still on OAuth2 → **Redirects**, add your Supabase callback:
   `https://<your-project-ref>.supabase.co/auth/v1/callback` (find the exact URL in Supabase →
   Authentication → Providers → Discord). Save.
4. **Supabase → Authentication → Providers → Discord**: enable it, paste the Client ID + Client
   Secret, save.
5. **Supabase → Authentication → URL Configuration**: set Site URL and add the app's
   `/auth/callback` redirect URLs (local + prod).

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

- `players (id uuid, name unique, is_leader, rares text[], task, auth_user_id unique → auth.users, created_at)`
- `tile_claims (tile_id, player_id, …)` — "I'm on this"
- `tile_progress (tile_id, player_id, count ≥ 0, …)` — per-player progress, the authoritative total
- `tile_items (tile_id, item_key, player_id, …)` — who ticked which part of a checklist tile
- `tile_notes (tile_id pk, note, …)` — one shared line of text, on the tiles that need a decision
- `tile_proofs (id uuid pk, tile_id, title, url, ord, updated_by, …)` — the screenshot links behind a
  completion. Leaders write them (the `PROOF` button in the tile drawer header); everyone reads them
- `tile_completions (tile_id pk, completed_at, completed_by)` — derived from progress or leader-forced
- `tile_intents (tile_id, player_id, intent in ('want','ok','no'))` — planning answers
- `focus (kind in ('region','tile'), target_id)` — leader's team focus

### How progress is entered

`progressSpec()` in `lib/scoring.ts` gives every tile one of three shapes, and the drawer dispatches
on it:

| mode | when | how |
| --- | --- | --- |
| `count` | the default | `−` / `+` by one |
| `checklist` | the tile has `items` in `TILE_TRACKING` | one tick box per named part, each owned by whoever ticked it |
| `bulk` | goal ≥ 10 | type an amount and press `+` (10,000 astral runes, 500 laps) |

A tile is a checklist only when its parts are individually identifiable **and all of them are
required** — a full Angler outfit is four named pieces, so it gets four boxes. A tile that just wants
N pieces stays a counter even when the pieces have names, because any of them will do and duplicates
often count: "3× Bludgeon Pieces", "2× Oathplate Pieces", "2× any Wilderness Rings".

Two extras hang off `TILE_TRACKING`:

- `alt` — a box that clears the objective on its own, worth the whole goal. It sits under an
  "…or just one of these" divider and works on counters too: three Masori pieces **or** one Shadow,
  three fire capes **or** one infernal cape.
- `note` — one shared free-text line, for boxes that are ambiguous without a decision beside them.
  Only Me and My Brothers uses it: the four pieces have to be the same brother, so the team records
  which one.

`tile_progress.count` stays the single source of truth for totals — `tile_items` is attribution
layered on top, which is why counts logged before item tracking existed still count. Ticking
recomputes the owner's count from their rows rather than nudging it by a delta, so a double tap on a
slow connection cannot count twice.

Goals come from `goalOf()`, in order: the number of `items`, the throughput target `i.hr.got`, the
leading `Nx` in the objective text, then 1. `scoring.test.ts` pins
the resolved goal of all 81 tiles and 12 bridges, so a reworded objective can't move one silently.

### Fixing who did what

Everything above records whoever pressed the button, which is regularly the wrong person: three
Cerberus crystals drop for three people and one of them logs all three; 50 rumours get split 10/20/20
and nobody says so. **Fix contributions**, in the tile drawer's LEADER CONTROLS, rewrites the
breakdown — and works on a **finished** tile, which is the main use for it. The alternative a leader
would otherwise reach for is *Undo done*, which wipes every count and tick on the way past.

It takes the shape of the tile, rather than offering a mode:

| tile | the editor shows | action |
| --- | --- | --- |
| `checklist` | a player picker per named box; counts follow the boxes (`tickCredit`) | `setTileItemOwners` |
| `count` / `bulk` | a number per player, with a `SUM n / goal` readout | `setTileContribs` |

Notes worth knowing:

- Rows start with everyone who has a count or is on the crew; a picker adds anyone else on the
  roster, including seats with **no Discord linked** — they did the drop, they just haven't signed in.
- Setting someone to 0 (or leaving them out) deletes their row, so "0 logged" and "no contributor"
  stay the same state.
- A counter with an `alt` box is both shapes at once, and they disagree by rule: an `alt` owner is
  credited the whole goal. The numbers grid hides itself while one is assigned rather than showing
  figures the save would overwrite.
- Lowering a total never un-completes anything (see below), and raising it to the goal completes the
  tile exactly as normal logging would.
- The rules both the popup and the actions validate against live in `lib/contrib.ts`
  (`contrib.test.ts`), for the same reason `lib/proof.ts` does.

### Completion is sticky

Reaching the goal records a `tile_completions` row; falling back below it never removes one. Only a
leader un-completes a tile (`forceCompletion` → clears the completion, the counts and the ticks).
That is what makes raising a tile's goal safe: a tile finished at 1/1 whose goal later became 3 keeps
its completion, and since region unlock is reachability over completed bridges, one lost completion
could otherwise re-lock nine tiles. The shared `completionAfter()` is called by both the server action
and the optimistic client patch so the two cannot disagree.

## Security model

This is a low-stakes, trusted event, and the design goal was zero-friction "tap and play". The
trade-offs, made deliberately:

- **The database is read-only to the public key.** RLS is enabled with `select`-only policies and
  **no** insert/update/delete policies, so the anon key shipped to the browser cannot write anything
  — it only powers the board and the realtime subscription. Every mutation runs server-side through a
  server action using the **service-role key**, which never leaves the server.
- **Identity is a Discord account.** Each player links their Discord to one seat, and seats are
  finite, so a clanmate can't impersonate another player or take two seats. Writes are attributed to
  whichever character the acting Discord is linked to (derived server-side, not client-supplied).
- **Leader actions are gated server-side** on every call (force-complete, focus, remove crew, proof links, rewriting contributions): the
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
2. Add all four env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`), `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`),
   `LEADER_CODE`. Mark the secret key and leader code as sensitive.
3. In Supabase → Authentication → URL Configuration, add the deployed URL's `/auth/callback` to the
   redirect allow-list (and set it as Site URL for prod).
4. Deploy and share the URL with the clan.

## Out of scope

No image uploads, no Discord integration, no admin CRUD for tiles, no dark/light toggle, no i18n.
`tile_proofs` keeps that first promise: it stores a title and a URL, and the app never hosts, fetches
or thumbnails an image — it is a link list, not the start of an uploader. The PDF export is likewise
dependency-free: `/report` is an ordinary page with an `@media print` block at the end of
`app/globals.css`, and the browser's "Save as PDF" does the rest.
To change board content, edit `lib/board-data.ts` — nothing to re-seed, because goals are resolved at
runtime. Two caveats when you do:

- **Renaming a tile changes its id**, since `t()` derives the slug from the name, and every DB row
  keys off that slug. Rename only with a migration that moves the rows.
- **Adding a checklist item needs the migration to learn about it too.** `TILE_TRACKING` item keys are
  primary keys in `tile_items`, and `0004_tile_items.sql` names them all for the backfill.
  `scoring.test.ts` fails if the two lists disagree.
- **A new table needs wiring in two places**: the migration's guarded `do $$` loop (read-only RLS
  policy + the `supabase_realtime` publication) *and* the `TABLES` array in `components/realtime.tsx`.
  Miss either half and reads keep working while nothing ever live-updates; `proof.test.ts` guards the
  `tile_proofs` pair.
