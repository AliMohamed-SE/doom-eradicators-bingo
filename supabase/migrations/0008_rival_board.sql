-- Doom Eradicators — tracking the rival team's board.
--
-- The other clan runs the same nine-region board. Until now the only record of how
-- they were doing was a leader eyeballing screenshots in Discord and doing the
-- points arithmetic in their head, which is exactly the sort of thing this app was
-- built to stop.
--
-- A leader names the board they are tracking and ticks off the tiles they see
-- completed; everyone else reads it, and either side can open COMPARE for a
-- side-by-side of the two boards. That is the entire feature. There is deliberately
-- no per-player progress, no claims, no checklists and no proof: none of it is
-- knowable from outside their clan, and a table shaped for it would imply the app
-- knows more about their board than a screenshot can tell it.
--
-- TWO TABLES, AND THE FIRST ONE IS A SWITCH
--   rival_board       a SINGLETON row. Its existence IS "tracking is set up" — which
--                     is what reveals the RIVAL tab to the team. No row, no tab.
--   rival_completions the ticked tiles. Cascades off the board row, so STOP TRACKING
--                     is one delete and cannot leave orphaned marks behind to
--                     reappear the next time somebody sets tracking up.
--
-- WHY A BOOLEAN PRIMARY KEY. `id boolean primary key default true check (id)` is the
-- standard single-row idiom: `true` is the only value that satisfies both the check
-- and the key, so a second board cannot be inserted even by a hand-crafted request.
-- One tracked board is the feature; a list of them is a different one.
--
-- ON VISIBILITY. The read policies below are `using (true)`, like every other table
-- here — the anon key reads the whole event so realtime works. Hiding the tab is a UI
-- rule, not a security one, and it does not need to be a security one: before a
-- leader sets tracking up these tables are EMPTY, so there is nothing to leak, and
-- after they do the whole team is meant to see it.
--
-- SAFE TO RE-PASTE. Table, index, policies and publication entries are all guarded,
-- and nothing here is backfilled — this data has never had a home before.
--
-- APPLY THIS BEFORE DEPLOYING THE CODE. It is purely additive, so the currently live
-- build ignores it; the other order leaves the new build reading tables that do not
-- exist yet, which supabase-js reports as "no rows" rather than as an error — i.e.
-- indistinguishable from "no leader has set tracking up".

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.rival_board (
  -- Singleton. See the note above.
  id         boolean primary key default true check (id),
  -- What the leader called the board they are tracking. Never blank: a nameless
  -- rival board is indistinguishable from a half-finished setup, and the setup form
  -- is the one place a name is required. Bound matches RIVAL_NAME_MAX in lib/rival.ts.
  name       text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now(),
  -- Bumped by every mark, unmark and rename, so the page can say how stale the
  -- intel is. Screenshots arrive in bursts and "last updated 3 days ago" is the
  -- difference between reading this board and trusting it.
  updated_at timestamptz not null default now(),
  -- set null, like tile_notes.updated_by and tile_proofs.updated_by: unlinking or
  -- deleting a leader must not take the team's intel with it.
  updated_by uuid null references public.players(id) on delete set null
);

create table if not exists public.rival_completions (
  -- No FK on tile_id: tile ids come from lib/board-data.ts, not from a table, same
  -- as every other tile_* table here. The action validates via isRivalMarkable().
  tile_id   text primary key,
  -- The cascade handle. Always true (it points at the singleton), and it exists
  -- solely so deleting the board deletes the marks in the same statement — this
  -- project has no transactions to do it in two.
  board     boolean not null default true
            references public.rival_board(id) on delete cascade,
  marked_at timestamptz not null default now(),
  marked_by uuid null references public.players(id) on delete set null
);

-- ---------------------------------------------------------------------------
-- RLS + realtime. Neither half is optional: RLS enabled with no policy means the
-- browser reads nothing AND realtime silently delivers no events, while the
-- server-side read path (service-role) keeps looking perfectly fine.
--
-- The other half of the realtime wiring is the TABLES array in
-- components/realtime.tsx. Both are needed; lib/rival.test.ts asserts this file
-- and that array agree.
-- ---------------------------------------------------------------------------
alter table public.rival_board       enable row level security;
alter table public.rival_completions enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['rival_board', 'rival_completions'] loop
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
--
-- Expect "(none)" on a fresh database: tracking starts off, and a leader turns it
-- on from the RIVAL tab.
-- ---------------------------------------------------------------------------
do $$
declare
  board text;
  marks int;
begin
  select name into board from public.rival_board limit 1;
  select count(*) into marks from public.rival_completions;
  raise notice 'rival board: % · % tiles marked', coalesce(board, '(none)'), marks;
end;
$$;
