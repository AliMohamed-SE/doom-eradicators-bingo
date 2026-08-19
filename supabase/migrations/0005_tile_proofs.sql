-- Doom Eradicators — proof links attached to a tile.
--
-- Proof that a tile was finished used to live in Discord: somebody posted a
-- screenshot and it scrolled away. Nothing tied the evidence to the tile, so checking
-- a completion weeks later meant digging through chat, and nothing at all told a
-- leader which finished tiles had no proof behind them.
--
-- A leader now attaches the links to the tile itself — a title and a URL per row —
-- and anybody who opens the drawer can see them. The app does NOT host, fetch or
-- thumbnail anything: it stores a label and a URL, and the only thing it claims about
-- the URL is that it is an http(s) one. See lib/proof.ts for that rule; it is enforced
-- in three places (the popup, the server action, and the check constraint below)
-- because the browser is going to be asked to follow whatever is stored here.
--
-- Who may write: leaders only — actingLeader() in app/actions.ts, the same gate as the
-- LEADER CONTROLS panel. Who may read: everyone, like every other table here.
--
-- SAFE TO RE-PASTE. The table, index, policy and publication entry are all guarded,
-- and there is no backfill to re-run: this data has never had a home before.
--
-- APPLY THIS BEFORE DEPLOYING THE CODE. It is purely additive, so the currently live
-- build ignores it; the other order leaves the new build reading a table that does not
-- exist yet, which supabase-js reports as "no rows" rather than as an error.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.tile_proofs (
  -- A synthetic id, deliberately NOT (tile_id, ord). ord is a display position, so
  -- making it the identity means deleting a middle row renumbers everything behind it
  -- — a shuffle that can collide on the key mid-save, and this project has no stored
  -- procedures to give us a transaction. It also makes "re-titled row 2" and
  -- "reordered the rows" indistinguishable, and it leaves the client unable to name a
  -- row it has not saved yet, which the optimistic patch needs. Compare tile_items,
  -- whose natural key exists to enforce one-owner-per-item; a proof link has no such
  -- invariant to protect.
  id         uuid primary key default gen_random_uuid(),
  -- No FK: tile ids come from lib/board-data.ts, not from a table. Same as every
  -- other tile_* table here. The action validates via findTarget().
  tile_id    text not null,
  -- What the screenshot shows. Optional — the UI falls back to the link's host.
  title      text not null default '' check (char_length(title) <= 80),
  -- Checked here as well as in the action for the same reason tile_progress.count is
  -- `check (count >= 0)`: the column is the last line of defence against a
  -- hand-crafted request, and the scheme pattern is what keeps a javascript: URL out
  -- of an href even if the action were bypassed entirely.
  url        text not null
             check (char_length(url) between 1 and 500)
             check (url ~* '^https?://[^[:space:]]+$'),
  -- Display order within the tile, 0-based, rewritten on every save.
  ord        int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- updated_by, not added_by: setTileProofs upserts the whole list in one statement
  -- and cannot conditionally skip a column, so "who attached it" would silently drift
  -- into "who last saved the list". The name is the honest one.
  --
  -- set null, exactly like tile_notes.updated_by: unlinking or deleting a player must
  -- not take the team's evidence with it.
  updated_by uuid null references public.players(id) on delete set null
);

-- The read path is always "one tile's links, in order".
create index if not exists tile_proofs_tile_idx on public.tile_proofs (tile_id, ord);

-- Deliberately NO unique (tile_id, url): a duplicate paste is de-duped by
-- cleanProofRows() in lib/proof.ts, rather than turned into a save-wide error.

alter table public.tile_proofs enable row level security;

-- Read-only for the anon key, like every other table, plus the realtime publication.
-- Neither is optional: RLS enabled with no policy means the browser reads nothing AND
-- realtime silently delivers no events, while the server-side read path keeps looking
-- perfectly fine. "create policy" has no "if not exists", hence the loop.
--
-- The other half of the realtime wiring is the TABLES array in components/realtime.tsx.
-- Both are needed; lib/proof.test.ts asserts this file and that array agree.
do $$
declare
  t text;
begin
  foreach t in array array['tile_proofs'] loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = 'read ' || t
    ) then
      execute format('create policy %I on public.%I for select using (true)', 'read ' || t, t);
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- What just happened — eyeball this before deploying
-- ---------------------------------------------------------------------------
do $$
declare
  links int;
  tiles int;
begin
  select count(*), count(distinct tile_id) into links, tiles from public.tile_proofs;
  raise notice 'tile_proofs: % links across % tiles', links, tiles;
end;
$$;
