-- Doom Eradicators — per-item tracking for composite tiles.
--
-- A few objectives are a SET of distinct, individually identifiable things rather
-- than N of one thing: "Get each Cerberus boot crystal" is three named crystals, a
-- full Angler outfit is four named pieces, a twinflame staff is a fire crown and an
-- ice crown. Those tiles now show one tick box per part, and this table records who
-- ticked what.
--
-- Tiles that just want N pieces stay plain counters, because there is nothing to
-- identify: "3x Bludgeon Pieces", "2x Oathplate Pieces" or "2x any Wilderness Rings"
-- (duplicates allowed) are a number, not a checklist.
--
-- tile_progress stays the authoritative TOTAL. tile_items is attribution layered on
-- top of it, which is what lets progress logged before item tracking existed keep
-- counting. See lib/board-data.ts (TILE_TRACKING) for the item lists and
-- lib/scoring.ts (assignLegacyItems) for the rule the backfill below implements.
--
-- SAFE TO RE-PASTE. Everything is guarded: tables, indexes and policies are
-- "if not exists", the count top-up is a no-op once totals reach their goals, and
-- the item backfill skips any tile that already has ticks, so a second run never
-- reshuffles who owns which box.
--
-- APPLY THIS BEFORE DEPLOYING THE CODE. It is purely additive, so the currently
-- live build ignores it; the other order leaves the new build reading tables that
-- do not exist yet, which supabase-js reports as "no rows" rather than an error.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.tile_items (
  tile_id    text not null,
  item_key   text not null,
  player_id  uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- The primary key deliberately does NOT include player_id: an item has exactly
  -- one owner. Otherwise two players could each tick "Primordial crystal" and the
  -- tile would complete with two of its three crystals.
  primary key (tile_id, item_key)
);

-- Cascade, not set null: a tick with no count behind it would leave the ticks and
-- the totals permanently disagreeing. The tile stays completed either way, because
-- tile_completions is never derived downward.
create index if not exists tile_items_player_idx on public.tile_items (player_id);

-- One shared line of text per tile, for the objectives whose boxes are ambiguous on
-- their own. Right now that is Me and My Brothers: the four pieces have to come from
-- the SAME brother, so which brother is a team decision that belongs on the tile
-- rather than in somebody's head.
create table if not exists public.tile_notes (
  tile_id    text primary key,
  note       text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid null references public.players(id) on delete set null
);

alter table public.tile_items enable row level security;
alter table public.tile_notes enable row level security;

-- Read-only for the anon key, like every other table. Not optional: RLS enabled with
-- no policy means the browser client reads nothing, and realtime would silently
-- deliver no tick events while the server-side read path looked fine.
-- "create policy" has no "if not exists", hence the loop.
do $$
declare
  t text;
begin
  foreach t in array array['tile_items', 'tile_notes'] loop
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
-- 1. Top up already-finished tiles whose goal has gone up
--
-- Nine targets move from a goal of 1 to a higher one (a checklist tile's goal is now
-- the number of its parts, and the grind tiles read their real totals), and
-- lord_of_the_rings has quietly been 4 since its objective text was reworded.
-- A tile finished at 1/1 is still finished — completion is sticky in code — but it
-- would read "1 / 3", so give the shortfall to whoever finished it.
--
-- The list is exactly "every target in TILE_TRACKING, plus the three with a
-- throughput target (i.hr)" — the ones whose goal does NOT come from the "Nx" in
-- their own objective text. Everything else already satisfies the number in its own
-- prose, so it has nothing to top up. lib/scoring.test.ts asserts this list against
-- the code, so the two cannot drift.
-- ---------------------------------------------------------------------------
with goals(tile_id, goal) as (values
  ('clifford_s_revenge', 3),
  ('evil_ass_task', 4),
  ('respect_your_elders', 3),
  ('me_and_my_brothers', 4),
  ('monkey_business_3', 3),
  ('wardn_t_you_believe_it', 3),
  ('cold_and_spicy', 2),
  ('lord_of_the_rings', 4),
  ('masori_chaps_mia', 3),
  ('justmi', 3),
  ('bridge_cheese_and_fire', 3),
  ('astral_projection', 10000),
  ('monkey_business', 500),
  ('i_ve_heard_something', 50)
),
short as (
  select g.tile_id,
         g.goal - coalesce((select sum(p.count) from public.tile_progress p
                            where p.tile_id = g.tile_id), 0) as gap,
         -- whoever is credited with finishing it, else the biggest contributor
         coalesce(
           c.completed_by,
           (select p.player_id from public.tile_progress p
            where p.tile_id = g.tile_id order by p.count desc, p.player_id limit 1)
         ) as credit_to
  from goals g
  join public.tile_completions c on c.tile_id = g.tile_id
)
insert into public.tile_progress (tile_id, player_id, count, updated_at)
select s.tile_id,
       s.credit_to,
       coalesce((select p.count from public.tile_progress p
                 where p.tile_id = s.tile_id and p.player_id = s.credit_to), 0) + s.gap,
       now()
from short s
where s.gap > 0 and s.credit_to is not null
on conflict (tile_id, player_id) do update
  set count = excluded.count, updated_at = now();

-- ---------------------------------------------------------------------------
-- 2. Turn existing counts into ticked boxes
--
-- Walk each tile's contributors biggest-first and hand each one the next N item keys
-- in declaration order, where N is what they logged. A tile finished at 4/4 comes
-- out with all four boxes ticked and attributed to the people who actually logged
-- it; a half-done tile comes out with that many ticked, ready to be reassigned by
-- hand.
--
-- This runs AFTER the top-up above, so a finished tile whose count was just raised
-- to its new goal gets all of its boxes, not just the one it used to have.
--
-- Only the eight checklist tiles are here. The "or one much rarer item" boxes are
-- deliberately absent: a legacy count of 3 on Masori could have been three pieces or
-- one Shadow, and three pieces is the honest guess.
--
-- ord is the position of the box in TILE_TRACKING. Keep both in the same order.
-- ---------------------------------------------------------------------------
with keys(tile_id, ord, item_key) as (values
  ('clifford_s_revenge',     1, 'primordial'),
  ('clifford_s_revenge',     2, 'pegasian'),
  ('clifford_s_revenge',     3, 'eternal'),
  ('evil_ass_task',          1, 'hat'),
  ('evil_ass_task',          2, 'top'),
  ('evil_ass_task',          3, 'waders'),
  ('evil_ass_task',          4, 'boots'),
  ('respect_your_elders',    1, 'hood'),
  ('respect_your_elders',    2, 'top'),
  ('respect_your_elders',    3, 'robe'),
  ('me_and_my_brothers',     1, 'helm'),
  ('me_and_my_brothers',     2, 'body'),
  ('me_and_my_brothers',     3, 'legs'),
  ('me_and_my_brothers',     4, 'weapon'),
  ('monkey_business_3',      1, 'limbs'),
  ('monkey_business_3',      2, 'spring'),
  ('monkey_business_3',      3, 'frame'),
  ('wardn_t_you_believe_it', 1, 'shard_1'),
  ('wardn_t_you_believe_it', 2, 'shard_2'),
  ('wardn_t_you_believe_it', 3, 'shard_3'),
  ('cold_and_spicy',         1, 'fire_crown'),
  ('cold_and_spicy',         2, 'ice_crown'),
  ('lord_of_the_rings',      1, 'berserker'),
  ('lord_of_the_rings',      2, 'archer'),
  ('lord_of_the_rings',      3, 'warrior'),
  ('lord_of_the_rings',      4, 'seers')
),
seq as (
  select p.tile_id,
         p.player_id,
         p.count,
         -- how many boxes the contributors ahead of this one have already taken
         coalesce(sum(p.count) over (
           partition by p.tile_id
           order by p.count desc, p.player_id
           rows between unbounded preceding and 1 preceding
         ), 0) as taken
  from public.tile_progress p
  where p.tile_id in (select distinct tile_id from keys)
)
insert into public.tile_items (tile_id, item_key, player_id)
select k.tile_id, k.item_key, s.player_id
from keys k
join seq s on s.tile_id = k.tile_id
where k.ord > s.taken
  and k.ord <= s.taken + s.count
  -- never touch a tile someone has already ticked by hand
  and not exists (select 1 from public.tile_items ti where ti.tile_id = k.tile_id)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. What just happened — eyeball this before deploying
-- ---------------------------------------------------------------------------
do $$
declare
  ticks int;
  tiles int;
begin
  select count(*), count(distinct tile_id) into ticks, tiles from public.tile_items;
  raise notice 'tile_items: % ticks across % tiles', ticks, tiles;
end;
$$;

-- Completions must be untouched by all of the above. The score and every region
-- unlock are pure functions of this list, so if it matches what you captured before
-- running this file, neither can have moved.
select tile_id from public.tile_completions order by 1;
