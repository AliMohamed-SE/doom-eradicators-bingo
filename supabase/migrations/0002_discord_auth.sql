-- Link players to Supabase Auth (Discord) users.
-- A player row is claimed by exactly one Discord account; a Discord account can
-- claim exactly one player. Nullable until claimed. Non-destructive: existing
-- rows (auth_user_id null) remain claimable by whoever logs in and picks them.
alter table public.players
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;
