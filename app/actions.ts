"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { admin } from "@/lib/supabase/admin";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth";
import { hasLeaderCode, verifyLeaderCode, setLeaderCookie } from "@/lib/session";
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

/** The players.id linked to the current Discord user, or null. */
async function requirePlayer(): Promise<string | null> {
  const user = await getAuthUser();
  if (!user) return null;
  const { data } = await admin()
    .from("players")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Is the acting player allowed to use leader controls? They must be a designated
 * leader (name or is_leader column) AND this device must have entered the code.
 */
async function actingLeader(): Promise<boolean> {
  const user = await getAuthUser();
  if (!user) return false;
  if (!(await hasLeaderCode())) return false;
  const { data } = await admin()
    .from("players")
    .select("name, is_leader")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  return data ? isLeaderPlayer(data) : false;
}

// ---------------------------------------------------------------------------
// Leader code (nav bar) — unlock once per device
// ---------------------------------------------------------------------------
export async function unlockLeader(code: string) {
  const user = await getAuthUser();
  if (!user) return { error: "Sign in first." };
  const { data } = await admin()
    .from("players")
    .select("name, is_leader")
    .eq("auth_user_id", user.id)
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
// Identity — link the Discord account to a team character
// ---------------------------------------------------------------------------

/**
 * Claim a team seat for the signed-in Discord user, with the gear-check answers.
 * The seat must be unclaimed. One Discord ↔ one player (both unique).
 */
export async function linkCharacter(input: { name: string; rares: RareId[]; task: string }) {
  const user = await getAuthUser();
  if (!user) return { error: "Sign in first." };
  if (!SELECTABLE_NAMES.includes(input.name)) return { error: "That name isn't on the roster." };

  const db = admin();

  // already linked to a character? nothing to do.
  const already = await db
    .from("players")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (already.data) {
    refresh();
    return { ok: true };
  }

  const validRares = input.rares.filter((r) => RARES.some((x) => x.id === r));
  const isLead = LEADER_NAMES.includes(input.name);
  const task = input.task.slice(0, 200);

  const existing = await db
    .from("players")
    .select("id, auth_user_id")
    .eq("name", input.name)
    .maybeSingle();

  if (existing.data) {
    if (existing.data.auth_user_id) return { error: "That character is already taken." };
    // claim the pre-existing (unlinked) row — guard on auth_user_id still null
    const upd = await db
      .from("players")
      .update({ auth_user_id: user.id, rares: validRares, task, is_leader: isLead })
      .eq("id", existing.data.id)
      .is("auth_user_id", null)
      .select("id")
      .maybeSingle();
    if (upd.error) return { error: upd.error.message };
    if (!upd.data) return { error: "That character was just taken — pick another." };
  } else {
    const ins = await db
      .from("players")
      .insert({ name: input.name, auth_user_id: user.id, rares: validRares, task, is_leader: isLead })
      .select("id")
      .single();
    if (ins.error) {
      if (ins.error.code === "23505") return { error: "That character was just taken — pick another." };
      return { error: ins.error.message };
    }
  }

  refresh();
  return { ok: true };
}

export async function signOut() {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  await setLeaderCookie(false);
  redirect("/login");
}

/**
 * Leader unlinks a player's Discord: the seat frees up and that person must sign
 * in and re-pick their character. Their row (name, progress, gear) is kept.
 */
export async function unlinkPlayer(playerId: string) {
  if (!(await actingLeader())) return { error: "Leader only." };
  const { error } = await admin()
    .from("players")
    .update({ auth_user_id: null })
    .eq("id", playerId);
  if (error) return { error: error.message };
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
