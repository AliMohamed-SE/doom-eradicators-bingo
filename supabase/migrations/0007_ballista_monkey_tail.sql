-- Doom Eradicators — Monkey Business 3 gains its fourth part.
--
-- "Complete a full ballista" was tracked as three boxes: limbs, spring, frame. That
-- is an UNSTRUNG ballista. The weapon the tile asks for also needs a MONKEY TAIL
-- (1/1,500 from the same demonic gorillas — https://oldschool.runescape.wiki/w/Monkey_tail),
-- so the tile could read 3/3 DONE on a ballista nobody could have built. The box list
-- in lib/board-data.ts now has four entries and the goal is 4.
--
-- Nothing about this un-completes anything: completion is sticky in code
-- (completionAfter in lib/scoring.ts) and tile_completions is never derived downward.
-- But a tile finished at 3/3 would now read "3 / 4" with an empty tail box, so this
-- file does for the tail exactly what migration 0004 did for the goals it raised —
-- give the shortfall, and the box, to whoever is credited with finishing it.
--
-- 0004 itself has been updated in step (its goals list and key list are asserted
-- against the code by lib/scoring.test.ts, so they cannot be left behind). Re-pasting
-- 0004 would do this same top-up; this file exists so a database that already ran it
-- does not have to.
--
-- SAFE TO RE-PASTE. The top-up is a no-op once the total reaches 4, and the tick is
-- skipped once the tail box has an owner.

-- ---------------------------------------------------------------------------
-- 1. Top up the count on a finished ballista — the goal went 3 -> 4
-- ---------------------------------------------------------------------------
with short as (
  select 4 - coalesce((select sum(p.count) from public.tile_progress p
                       where p.tile_id = 'monkey_business_3'), 0) as gap,
         -- whoever is credited with finishing it, else the biggest contributor
         coalesce(
           c.completed_by,
           (select p.player_id from public.tile_progress p
            where p.tile_id = 'monkey_business_3' order by p.count desc, p.player_id limit 1)
         ) as credit_to
  from public.tile_completions c
  where c.tile_id = 'monkey_business_3'
)
insert into public.tile_progress (tile_id, player_id, count, updated_at)
select 'monkey_business_3',
       s.credit_to,
       coalesce((select p.count from public.tile_progress p
                 where p.tile_id = 'monkey_business_3' and p.player_id = s.credit_to), 0) + s.gap,
       now()
from short s
where s.gap > 0 and s.credit_to is not null
on conflict (tile_id, player_id) do update
  set count = excluded.count, updated_at = now();

-- ---------------------------------------------------------------------------
-- 2. Tick the new box for them, so the ticks and the total still agree
--
-- Only on a finished tile, and only if the other three boxes are already ticked: a
-- tile still in progress genuinely has an outstanding tail, and inventing an owner
-- for it would be a lie the board then scores on.
-- ---------------------------------------------------------------------------
insert into public.tile_items (tile_id, item_key, player_id)
select 'monkey_business_3', 'tail',
       coalesce(
         c.completed_by,
         (select p.player_id from public.tile_progress p
          where p.tile_id = 'monkey_business_3' order by p.count desc, p.player_id limit 1)
       )
from public.tile_completions c
where c.tile_id = 'monkey_business_3'
  and (select count(*) from public.tile_items ti
       where ti.tile_id = 'monkey_business_3') = 3
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. What it looks like now — eyeball this before deploying
-- ---------------------------------------------------------------------------
do $$
declare
  total int;
  ticks int;
  fin   boolean;
begin
  select coalesce(sum(count), 0) into total
    from public.tile_progress where tile_id = 'monkey_business_3';
  select count(*) into ticks
    from public.tile_items where tile_id = 'monkey_business_3';
  select exists (select 1 from public.tile_completions where tile_id = 'monkey_business_3')
    into fin;
  raise notice 'monkey_business_3: % / 4, % ticks, finished=%', total, ticks, fin;
end;
$$;
