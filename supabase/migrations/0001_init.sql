-- Doom Eradicators — Celeris August Bingo
-- Event state schema. Static board content lives in code (lib/board-data.ts);
-- only mutable event state lives here.
--
-- Auth model: NONE. This is a small, trusted clan event — players tap their
-- character (no login). Identity is a private cookie holding their players.id,
-- and every mutation runs through a server action using the service-role key.
-- The public anon key can only READ (for the board + realtime); RLS blocks all
-- direct writes with it. The leader unlocks controls with a secret code
-- (LEADER_CODE env var), checked server-side.
--
-- Safe to re-run: it drops and recreates the event tables. There is no real data
-- until the event starts.

drop table if exists public.tile_claims      cascade;
drop table if exists public.tile_progress    cascade;
drop table if exists public.tile_completions cascade;
drop table if exists public.tile_intents     cascade;
drop table if exists public.focus            cascade;
drop table if exists public.tile_goals       cascade;
drop table if exists public.players          cascade;
drop function if exists public.is_leader()          cascade;
drop function if exists public.guard_leader_flag()  cascade;
drop function if exists public.log_progress(text, int)      cascade;
drop function if exists public.set_completion(text, boolean) cascade;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.players (
  id         uuid primary key default gen_random_uuid(),
  name       text unique not null,
  is_leader  boolean not null default false,
  rares      text[] not null default '{}',
  task       text not null default '',
  created_at timestamptz not null default now()
);

create table public.tile_claims (
  tile_id    text not null,
  player_id  uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tile_id, player_id)
);

create table public.tile_progress (
  tile_id    text not null,
  player_id  uuid not null references public.players(id) on delete cascade,
  count      int not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (tile_id, player_id)
);

create table public.tile_completions (
  tile_id      text primary key,
  completed_at timestamptz not null default now(),
  completed_by uuid null references public.players(id) on delete set null
);

create table public.tile_intents (
  tile_id   text not null,
  player_id uuid not null references public.players(id) on delete cascade,
  intent    text not null check (intent in ('want', 'ok', 'no')),
  primary key (tile_id, player_id)
);

create table public.focus (
  kind      text not null check (kind in ('region', 'tile')),
  target_id text not null,
  primary key (kind, target_id)
);

-- ---------------------------------------------------------------------------
-- RLS: everyone (the public anon key) may READ everything, for the board and
-- realtime. No write policies exist, so the anon key cannot write directly —
-- all writes happen server-side with the service-role key, which bypasses RLS.
-- ---------------------------------------------------------------------------
alter table public.players          enable row level security;
alter table public.tile_claims      enable row level security;
alter table public.tile_progress    enable row level security;
alter table public.tile_completions enable row level security;
alter table public.tile_intents     enable row level security;
alter table public.focus            enable row level security;

create policy "read players"     on public.players          for select using (true);
create policy "read claims"      on public.tile_claims      for select using (true);
create policy "read progress"    on public.tile_progress    for select using (true);
create policy "read completions" on public.tile_completions for select using (true);
create policy "read intents"     on public.tile_intents     for select using (true);
create policy "read focus"       on public.focus            for select using (true);

-- ---------------------------------------------------------------------------
-- Realtime: broadcast changes on the mutable tables so other players' views
-- refresh within a second. Guarded so re-running the script is safe.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'players', 'tile_claims', 'tile_progress', 'tile_completions', 'tile_intents', 'focus'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
