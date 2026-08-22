-- Doom Eradicators — Me and My Brothers becomes 24 boxes instead of 4.
--
-- The tile asks for four pieces of one Barrows brother. Until now it was four generic
-- boxes — 'helm', 'body', 'legs', 'weapon' — plus a free-text note where a leader
-- typed which brother the team was going for. That does not describe what happens at
-- Barrows: the chest gives a random piece of a random brother, duplicates are worth
-- nothing, and no amount of planning targets a set. Which brother the team finishes is
-- decided by what fell, so committing to one up front and then ticking "legs" against
-- it was a decision the game never let anybody make.
--
-- Every piece of every brother is now its own box (TILE_TRACKING.sets in
-- lib/board-data.ts), the tile measures whichever set is closest (leadingSet in
-- lib/scoring.ts), and the fourth piece of any brother finishes it and credits the
-- four people who got those pieces.
--
-- NO SCHEMA CHANGE. tile_items.item_key is bare text; this is a data migration, and
-- all it does is rename four keys and re-derive the counts behind them.
--
-- WHAT IT MOVES
--   1. the four generic ticks -> '<brother>_<slot>', reading the brother out of the
--      note the leader typed
--   2. the note row itself -> deleted, because the ticks now say what it said
--   3. tile_progress for the tile -> recomputed from the ticks under the new rule
--
-- WHEN THE NOTE NAMES NOBODY the ticks are DELETED rather than guessed at. A tick that
-- says "some Barrows piece" cannot be turned into a tick that says which one, and
-- putting it on a brother nobody chose would credit a player for a piece they may not
-- have. The cost is that whoever got those pieces re-taps them on the new grid, which
-- is a couple of taps; the alternative is a wrong contributor on a finished tile.
--
-- SAFE TO RE-PASTE. The remap only fires on keys that still exist, the insert is
-- guarded by ON CONFLICT, and the recount is idempotent by construction — it derives
-- the counts from the ticks every time rather than adjusting them.
--
-- APPLY THIS BEFORE DEPLOYING THE CODE. Between the two, the live build reads
-- 'dharok_helm' as an unknown item and renders the tile with nothing ticked; the other
-- order leaves the new build showing an empty grid over a non-zero count.

-- ---------------------------------------------------------------------------
-- 1. Rename the four generic ticks onto the brother the note names
-- ---------------------------------------------------------------------------
with slots(old_key, slot) as (values
  -- The four keys migration 0004 created for this tile, and the slot each one is.
  -- lib/scoring.test.ts asserts this column is exactly what 0004 backfilled: if a box
  -- was ever added to the old generic list, this is the block that has to learn it.
  ('helm',   'helm'),
  ('body',   'body'),
  ('legs',   'legs'),
  ('weapon', 'weapon')
),
brothers(pattern, set_key) as (values
  -- Matched case-insensitively as a substring, so "Full Dharoks" and "dharok set"
  -- both land. The names are the six ItemSet keys in lib/board-data.ts (BARROWS) and
  -- the test asserts all six appear here.
  ('ahrim',  'ahrim'),
  ('dharok', 'dharok'),
  ('guthan', 'guthan'),
  ('karil',  'karil'),
  ('torag',  'torag'),
  ('verac',  'verac'),
  -- Spellings actually found in the live tile_notes row. Not a general typo matcher —
  -- there is no safe way to guess at a name, and a wrong guess credits the wrong
  -- player — just the one string a human can read unambiguously.
  ('dhorak', 'dharok')
),
resolved as (
  select b.set_key
  from public.tile_notes n
  join brothers b on lower(n.note) like '%' || b.pattern || '%'
  where n.tile_id = 'me_and_my_brothers'
  -- One row or none. Ordered so a note mentioning two brothers resolves the same way
  -- every time it is re-pasted rather than picking whichever the planner returned.
  order by b.set_key
  limit 1
)
insert into public.tile_items (tile_id, item_key, player_id, created_at)
select i.tile_id, r.set_key || '_' || s.slot, i.player_id, i.created_at
from public.tile_items i
join slots s on s.old_key = i.item_key
cross join resolved r
where i.tile_id = 'me_and_my_brothers'
on conflict (tile_id, item_key) do nothing;

-- The generic rows go whether or not the note resolved: if it did they have a named
-- twin now, and if it did not they are the ticks with nothing behind them.
delete from public.tile_items
where tile_id = 'me_and_my_brothers'
  and item_key in ('helm', 'body', 'legs', 'weapon');

-- The note said which brother; the ticks say it now. Left behind it would be a second,
-- editable answer to a question the grid has already answered — and TILE_TRACKING no
-- longer gives this tile a note field, so nothing would render or clear it.
delete from public.tile_notes where tile_id = 'me_and_my_brothers';

-- ---------------------------------------------------------------------------
-- 2. Re-derive the counts from the ticks
--
-- Only the LEADING set's pieces are worth anything — see tickCredit in
-- lib/scoring.ts for why: a player holding one Dharok piece and one Ahrim piece has
-- moved one grind forward by one, not two, and completion is a re-sum of this column.
-- Ties go to the alphabetically first set key, which is the declaration order of
-- BARROWS (asserted in lib/scoring.test.ts, because this SQL cannot see that array).
--
-- Written as a full re-derivation rather than a fix-up so it is safe to re-paste, and
-- so it repairs the same drift the server's recountSetTile exists to prevent.
-- ---------------------------------------------------------------------------
with ticks as (
  select split_part(item_key, '_', 1) as set_key, player_id
  from public.tile_items
  where tile_id = 'me_and_my_brothers'
),
leader_set as (
  -- Named around `lead`, which is a window function.
  select set_key from ticks group by set_key order by count(*) desc, set_key limit 1
),
credited as (
  select t.player_id, count(*) as n
  from ticks t join leader_set l on l.set_key = t.set_key
  group by t.player_id
)
insert into public.tile_progress (tile_id, player_id, count, updated_at)
select 'me_and_my_brothers', c.player_id, c.n, now()
from credited c
on conflict (tile_id, player_id)
  -- Quoted: `count` is a function name as well as this column's name, and the SET
  -- clause is the one place the two can be confused for each other.
  do update set "count" = excluded."count", updated_at = now();

-- Delete LAST and only what is gone, the same ordering as setTileContribs: with no
-- transaction here, a failure between the two has to leave a stale extra contributor
-- rather than a tile whose progress vanished.
delete from public.tile_progress p
where p.tile_id = 'me_and_my_brothers'
  and not exists (
    select 1
    from public.tile_items i
    where i.tile_id = p.tile_id
      and i.player_id = p.player_id
      and split_part(i.item_key, '_', 1) = (
        select split_part(item_key, '_', 1) as set_key
        from public.tile_items
        where tile_id = 'me_and_my_brothers'
        group by set_key
        order by count(*) desc, set_key
        limit 1
      )
  );

-- ---------------------------------------------------------------------------
-- 3. What just happened — eyeball this before deploying
--
-- Expect: "0 generic left", every remaining key named '<brother>_<slot>', and the
-- counts totalling the leading set's tick count. If "generic left" is not 0 the delete
-- did not run; if "named ticks" dropped to 0 on a tile that had some, the note resolved
-- to no brother and whoever got those pieces re-taps them on the new grid.
-- ---------------------------------------------------------------------------
do $$
declare
  generic_left int;
  named        int;
  lead_set     text;
  lead_ticks   int;
  total        int;
begin
  select count(*) into generic_left
  from public.tile_items
  where tile_id = 'me_and_my_brothers'
    and item_key in ('helm', 'body', 'legs', 'weapon');

  select count(*) into named
  from public.tile_items where tile_id = 'me_and_my_brothers';

  select split_part(item_key, '_', 1), count(*)
    into lead_set, lead_ticks
  from public.tile_items
  where tile_id = 'me_and_my_brothers'
  group by 1
  order by count(*) desc, 1
  limit 1;

  select coalesce(sum(count), 0) into total
  from public.tile_progress where tile_id = 'me_and_my_brothers';

  raise notice 'me_and_my_brothers: % named ticks, % generic left, leading set % at %/4, counts total %',
    named, generic_left, coalesce(lead_set, '(none)'), coalesce(lead_ticks, 0), total;
end;
$$;
