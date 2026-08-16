"use server";

import { revalidatePath } from "next/cache";
import { admin } from "@/lib/supabase/admin";
import {
  getPlayerId,
  setPlayerId,
  clearPlayer,
  hasLeaderCode,
  verifyLeaderCode,
  setLeaderCookie,
} from "@/lib/session";
import {
  REGIONS,
  RARES,
  FREE_SPACE,
  SELECTABLE_NAMES,
  LEADER_NAMES,
  isLeaderPlayer,
  type RareId,
} from "@/lib/board-data";
import { goalOf, findTarget } from "@/lib/scoring";
import type { SupabaseClient } from "@supabase/supabase-js";

function refresh() {
  revalidatePath("/", "layout");
}

async function requirePlayer() {
  const id = await getPlayerId();
  if (!id) return null;
  return id;
}

/**
 * Is the acting player allowed to use leader controls? They must be a designated
 * leader (name or is_leader column) AND this device must have entered the code.
 */
async function actingLeader(): Promise<boolean> {
  const id = await getPlayerId();
  if (!id) return false;
  if (!(await hasLeaderCode())) return false;
  const { data } = await admin()
    .from("players")
    .select("name, is_leader")
    .eq("id", id)
    .maybeSingle();
  return data ? isLeaderPlayer(data) : false;
}

// ---------------------------------------------------------------------------
// Leader code (nav bar) — unlock once per device
// ---------------------------------------------------------------------------
export async function unlockLeader(code: string) {
  const id = await getPlayerId();
  if (!id) return { error: "Pick a character first." };
  const { data } = await admin()
    .from("players")
    .select("name, is_leader")
    .eq("id", id)
    .maybeSingle();
  if (!data || !isLeaderPlayer(data)) return { error: "This character isn't a leader." };
  if (!verifyLeaderCode(code.trim())) return { error: "Wrong code." };
  await setLeaderCookie(true);
  refresh();
  return { ok: true };
}

export async function lockLeader() {
  await setLeaderCookie(false);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Identity — tap your character, no login
// ---------------------------------------------------------------------------

/**
 * Step 1 of onboarding. If the character already exists, adopt it (returning
 * player, any device) — the caller sends them to the board. If it does not
 * exist yet, do NOT create it here; the caller shows the gear check and calls
 * createProfile() to finish. (Creating + cookie-setting here would make the
 * onboarding page redirect to /board before the gear step could render.)
 */
export async function chooseCharacter(name: string) {
  if (!SELECTABLE_NAMES.includes(name)) return { error: "That name isn't on the roster." };
  const existing = await admin().from("players").select("id").eq("name", name).maybeSingle();
  if (existing.error) return { error: existing.error.message };
  if (existing.data) {
    await setPlayerId(existing.data.id);
    refresh();
    return { ok: true, exists: true };
  }
  return { ok: true, exists: false };
}

/** Step 2 of onboarding: create the new character with its gear check answers. */
export async function createProfile(input: { name: string; rares: RareId[]; task: string }) {
  if (!SELECTABLE_NAMES.includes(input.name)) return { error: "That name isn't on the roster." };
  const validRares = input.rares.filter((r) => RARES.some((x) => x.id === r));
  const created = await admin()
    .from("players")
    .insert({
      name: input.name,
      rares: validRares,
      task: input.task.slice(0, 200),
      is_leader: LEADER_NAMES.includes(input.name),
    })
    .select("id")
    .single();
  if (created.error) {
    if (created.error.code === "23505") return { error: "Someone just took that name — go back and pick another." };
    return { error: created.error.message };
  }
  await setPlayerId(created.data.id);
  refresh();
  return { ok: true };
}

export async function saveProfile(input: { rares: RareId[]; task: string }) {
  const id = await requirePlayer();
  if (!id) return { error: "Pick a character first." };
  const validRares = input.rares.filter((r) => RARES.some((x) => x.id === r));
  const { error } = await admin()
    .from("players")
    .update({ rares: validRares, task: input.task.slice(0, 200) })
    .eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}

export async function switchCharacter() {
  await clearPlayer();
  refresh();
}

// ---------------------------------------------------------------------------
// Claims ("I'm on this")
// ---------------------------------------------------------------------------
export async function toggleClaim(tileId: string, on: boolean) {
  const id = await requirePlayer();
  if (!id) return { error: "Pick a character first." };
  const db = admin();
  const { error } = on
    ? await db.from("tile_claims").upsert({ tile_id: tileId, player_id: id })
    : await db.from("tile_claims").delete().eq("tile_id", tileId).eq("player_id", id);
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}

/** Leader removes another player from a tile's crew. */
export async function removeWorker(tileId: string, playerId: string) {
  if (!(await actingLeader())) return { error: "Leader only." };
  const { error } = await admin()
    .from("tile_claims")
    .delete()
    .eq("tile_id", tileId)
    .eq("player_id", playerId);
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Progress — add/subtract the caller's own count and derive completion
// ---------------------------------------------------------------------------
export async function logProgress(tileId: string, delta: number) {
  const id = await requirePlayer();
  if (!id) return { error: "Pick a character first." };
  if (tileId === FREE_SPACE) return { error: "Free space isn't trackable." };

  const db = admin();
  const leader = await actingLeader();

  // permission: leader, claimed on the tile, or already has a count
  const [claim, mine] = await Promise.all([
    db.from("tile_claims").select("tile_id").eq("tile_id", tileId).eq("player_id", id).maybeSingle(),
    db.from("tile_progress").select("count").eq("tile_id", tileId).eq("player_id", id).maybeSingle(),
  ]);
  const cur = mine.data?.count ?? 0;
  if (!leader && !claim.data && cur <= 0) {
    return { error: "Claim the tile first (I'm on this), or ask the leader." };
  }

  const next = Math.max(0, cur + delta);
  if (next === 0) {
    await db.from("tile_progress").delete().eq("tile_id", tileId).eq("player_id", id);
  } else {
    await db
      .from("tile_progress")
      .upsert({ tile_id: tileId, player_id: id, count: next, updated_at: new Date().toISOString() });
  }

  // recompute total and derive completion
  const totalRes = await db.from("tile_progress").select("count").eq("tile_id", tileId);
  const total = (totalRes.data ?? []).reduce((a, r) => a + (r.count ?? 0), 0);
  const target = findTarget(tileId);
  const goal = target ? goalOf({ o: target.o }) : 1;

  if (total >= goal) {
    await completeTile(tileId, id);
  } else {
    await db.from("tile_completions").delete().eq("tile_id", tileId);
  }

  refresh();
  return { ok: true };
}

async function completeTile(tileId: string, byPlayerId: string | null) {
  const db = admin();
  const existing = await db
    .from("tile_completions")
    .select("tile_id")
    .eq("tile_id", tileId)
    .maybeSingle();
  if (existing.data) return; // keep the original completion timestamp/author
  await db
    .from("tile_completions")
    .insert({ tile_id: tileId, completed_by: byPlayerId, completed_at: new Date().toISOString() });
  // reaching the goal clears the crew and any tile focus (the prototype's finish()).
  await db.from("tile_claims").delete().eq("tile_id", tileId);
  await db.from("focus").delete().eq("kind", "tile").eq("target_id", tileId);
}

/** Leader force-done: fill progress to the goal, credited to the leader (0/N -> N/N). */
async function forceDoneTile(db: SupabaseClient, tileId: string, leaderId: string | null) {
  const target = findTarget(tileId);
  const goal = target ? goalOf({ o: target.o }) : 1;
  // clear everyone's progress, then credit the whole goal to the leader
  await db.from("tile_progress").delete().eq("tile_id", tileId);
  if (leaderId) {
    await db
      .from("tile_progress")
      .insert({ tile_id: tileId, player_id: leaderId, count: goal, updated_at: new Date().toISOString() });
  }
  await db
    .from("tile_completions")
    .upsert({ tile_id: tileId, completed_by: leaderId, completed_at: new Date().toISOString() });
  await db.from("tile_claims").delete().eq("tile_id", tileId);
  await db.from("focus").delete().eq("kind", "tile").eq("target_id", tileId);
}

/** Leader un-done: clear the completion and reset progress to 0. */
async function clearTile(db: SupabaseClient, tileId: string) {
  await db.from("tile_completions").delete().eq("tile_id", tileId);
  await db.from("tile_progress").delete().eq("tile_id", tileId);
}

// ---------------------------------------------------------------------------
// Planning intents
// ---------------------------------------------------------------------------
export async function setIntent(tileId: string, intent: "want" | "ok" | "no" | null) {
  const id = await requirePlayer();
  if (!id) return { error: "Pick a character first." };
  const db = admin();
  const { error } =
    intent === null
      ? await db.from("tile_intents").delete().eq("tile_id", tileId).eq("player_id", id)
      : await db.from("tile_intents").upsert({ tile_id: tileId, player_id: id, intent });
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Leader controls
// ---------------------------------------------------------------------------
export async function toggleFocus(kind: "region" | "tile", targetId: string, on: boolean) {
  if (!(await actingLeader())) return { error: "Leader only." };
  const db = admin();
  const { error } = on
    ? await db.from("focus").upsert({ kind, target_id: targetId })
    : await db.from("focus").delete().eq("kind", kind).eq("target_id", targetId);
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}

export async function forceCompletion(tileId: string, done: boolean) {
  const id = await requirePlayer();
  if (!(await actingLeader())) return { error: "Leader only." };
  if (tileId === FREE_SPACE) return { error: "Free space can't be toggled." };
  const db = admin();
  if (done) await forceDoneTile(db, tileId, id);
  else await clearTile(db, tileId);
  refresh();
  return { ok: true };
}

/**
 * Leader force-completes or clears a whole region at once (all 9 tiles). Works
 * even on a locked region. Each tile is filled to its goal and credited to the
 * leader (or cleared to 0). The Free Space tile is left alone.
 */
export async function forceRegionCompletion(regionId: string, done: boolean) {
  const id = await requirePlayer();
  if (!(await actingLeader())) return { error: "Leader only." };
  const region = REGIONS.find((r) => r.id === regionId);
  if (!region) return { error: "Unknown region." };
  const db = admin();
  for (const tile of region.tiles) {
    if (tile.id === FREE_SPACE) continue;
    if (done) await forceDoneTile(db, tile.id, id);
    else await clearTile(db, tile.id);
  }
  refresh();
  return { ok: true };
}
