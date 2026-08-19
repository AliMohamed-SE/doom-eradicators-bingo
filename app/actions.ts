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
import {
  goalOf,
  findTarget,
  progressSpec,
  completionAfter,
  tickCredit,
  type Target,
} from "@/lib/scoring";
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

/**
 * Who may log on a target: a leader, someone who claimed it, or someone who
 * already has a count on it. Shared by logProgress and toggleItem — two copies of
 * this gate would drift.
 *
 * Note the third clause deliberately outlives removeWorker: dropping someone's
 * claim keeps their credit, so they can still adjust what they logged.
 */
async function canTouch(
  db: SupabaseClient,
  tileId: string,
  playerId: string,
  leader: boolean,
): Promise<{ ok: boolean; cur: number }> {
  const [claim, mine] = await Promise.all([
    db
      .from("tile_claims")
      .select("tile_id")
      .eq("tile_id", tileId)
      .eq("player_id", playerId)
      .maybeSingle(),
    db
      .from("tile_progress")
      .select("count")
      .eq("tile_id", tileId)
      .eq("player_id", playerId)
      .maybeSingle(),
  ]);
  const cur = mine.data?.count ?? 0;
  return { ok: leader || !!claim.data || cur > 0, cur };
}

/** Write one player's count for a target, deleting the row when it hits zero. */
async function setCount(db: SupabaseClient, tileId: string, playerId: string, count: number) {
  if (count <= 0) {
    return db.from("tile_progress").delete().eq("tile_id", tileId).eq("player_id", playerId);
  }
  return db
    .from("tile_progress")
    .upsert({ tile_id: tileId, player_id: playerId, count, updated_at: new Date().toISOString() });
}

/**
 * Re-sum a target and record the completion if it has reached its goal. Never
 * deletes one — see completionAfter() in lib/scoring.ts for why completion is
 * sticky and why that is what makes changing a goal safe.
 */
async function syncCompletion(db: SupabaseClient, target: Target, byPlayerId: string) {
  const totalRes = await db.from("tile_progress").select("count").eq("tile_id", target.id);
  const total = (totalRes.data ?? []).reduce((a, r) => a + (r.count ?? 0), 0);
  const existing = await db
    .from("tile_completions")
    .select("tile_id")
    .eq("tile_id", target.id)
    .maybeSingle();
  if (completionAfter(!!existing.data, total, goalOf(target))) {
    await completeTile(target.id, byPlayerId);
  }
}

export async function logProgress(tileId: string, delta: number) {
  const id = await requirePlayer();
  if (!id) return { error: "Pick a character first." };
  if (tileId === FREE_SPACE) return { error: "Free space isn't trackable." };

  const target = findTarget(tileId);
  if (!target) return { error: "Unknown tile." };
  const spec = progressSpec(target);
  if (spec.mode === "checklist") {
    return { error: "Tick the items on this tile instead — its count comes from those." };
  }

  // `delta` arrives from a client that now has a free-text number box, so it is
  // wholly untrusted. tile_progress.count is `int check (count >= 0)`: a float or
  // an out-of-range value is rejected by Postgres, and an unchecked failure here
  // used to be followed by a re-sum that acted on unchanged data.
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > spec.goal) {
    return { error: "That isn't a usable amount." };
  }

  const db = admin();
  const leader = await actingLeader();
  const gate = await canTouch(db, tileId, id, leader);
  if (!gate.ok) return { error: "Claim the tile first (I'm on this), or ask the leader." };

  // Clamped at the goal as well as at zero — nobody needs a count past the goal,
  // and it bounds what a hand-crafted request can put in the column.
  const next = Math.min(spec.goal, Math.max(0, gate.cur + delta));
  const { error } = await setCount(db, tileId, id, next);
  if (error) return { error: error.message };

  await syncCompletion(db, target, id);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Checklist items — tick one named part of a composite objective
// ---------------------------------------------------------------------------
export async function toggleItem(tileId: string, itemKey: string, on: boolean) {
  const id = await requirePlayer();
  if (!id) return { error: "Pick a character first." };

  const target = findTarget(tileId);
  if (!target) return { error: "Unknown tile." };
  const spec = progressSpec(target);

  // tile_items.item_key is bare text with no foreign key, so an unvalidated key
  // would create a row nothing can render or clear.
  const isAlt = spec.alt.some((a) => a.k === itemKey);
  if (!isAlt && !spec.items.some((i) => i.k === itemKey)) {
    return { error: "That isn't one of this tile's items." };
  }

  const db = admin();
  const leader = await actingLeader();

  const done = await db
    .from("tile_completions")
    .select("tile_id")
    .eq("tile_id", tileId)
    .maybeSingle();
  if (done.data) {
    return { error: "This tile is already finished — a leader has to undo it first." };
  }

  const gate = await canTouch(db, tileId, id, leader);
  if (!gate.ok) return { error: "Claim the tile first (I'm on this), or ask the leader." };

  const existing = await db
    .from("tile_items")
    .select("player_id")
    .eq("tile_id", tileId)
    .eq("item_key", itemKey)
    .maybeSingle();

  // The owner of the row is the player whose count has to be recomputed, which is
  // not the caller when a leader clears someone else's tick.
  const ownerId = existing.data?.player_id ?? id;

  if (on) {
    // Already ticked is a no-op, not an error: a double tap on a slow connection
    // must not be able to count twice.
    if (existing.data) return { ok: true };
    const { error } = await db.from("tile_items").insert({
      tile_id: tileId,
      item_key: itemKey,
      player_id: id,
    });
    if (error) return { error: error.message };
  } else {
    if (!existing.data) return { ok: true };
    if (ownerId !== id && !leader) return { error: "Only the person who ticked it can untick it." };
    const { error } = await db
      .from("tile_items")
      .delete()
      .eq("tile_id", tileId)
      .eq("item_key", itemKey);
    if (error) return { error: error.message };
  }

  // Recompute the owner's count from their rows rather than nudging it by a delta.
  // logProgress is a read-modify-write with no locking and this project has no
  // stored procedures to give us a transaction, so an idempotent recompute is the
  // only defence against two tabs leaving ticks and counts permanently disagreeing.
  await recountItems(db, target, on ? id : ownerId);
  await syncCompletion(db, target, on ? id : ownerId);
  refresh();
  return { ok: true };
}

/**
 * Set a player's count on a target to what their ticks are worth.
 *
 * On a checklist tile that is the whole story: counts come from ticks and nowhere
 * else, because logProgress refuses those tiles. On a plain counter with an `alt`
 * box it overwrites the manual count — but ticking an `alt` is worth the full goal,
 * so the tile completes on the same call and becomes read-only, which means there is
 * no path back that could strip a count someone typed.
 */
async function recountItems(db: SupabaseClient, target: Target, playerId: string) {
  const rows = await db
    .from("tile_items")
    .select("item_key")
    .eq("tile_id", target.id)
    .eq("player_id", playerId);
  const owners = Object.fromEntries((rows.data ?? []).map((r) => [r.item_key, playerId]));
  await setCount(db, target.id, playerId, tickCredit(target, owners));
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

/**
 * Wipe everyone's logged progress on one or more targets. Ticks go with the counts
 * — leaving them behind would show every box ticked above a 0/3 readout.
 * Batched by design: a whole-region force ran ~45 sequential round trips before,
 * and each target now touches one more table.
 */
async function wipeProgress(db: SupabaseClient, tileIds: string[]) {
  if (!tileIds.length) return;
  await db.from("tile_progress").delete().in("tile_id", tileIds);
  await db.from("tile_items").delete().in("tile_id", tileIds);
  await db.from("tile_notes").delete().in("tile_id", tileIds);
}

/** Leader force-done: fill progress to the goal, credited to the leader (0/N -> N/N). */
async function fillDoneTile(db: SupabaseClient, tileId: string, leaderId: string | null) {
  const target = findTarget(tileId);
  const goal = target ? goalOf(target) : 1;
  if (leaderId) {
    await db
      .from("tile_progress")
      .insert({ tile_id: tileId, player_id: leaderId, count: goal, updated_at: new Date().toISOString() });
    // Keep ticks and counts in step: a checklist tile forced done shows its boxes
    // ticked, not a full count against empty boxes.
    const items = target ? progressSpec(target).items.slice(0, goal) : [];
    if (items.length) {
      await db
        .from("tile_items")
        .insert(items.map((i) => ({ tile_id: tileId, item_key: i.k, player_id: leaderId })));
    }
  }
  await db
    .from("tile_completions")
    .upsert({ tile_id: tileId, completed_by: leaderId, completed_at: new Date().toISOString() });
  await db.from("tile_claims").delete().eq("tile_id", tileId);
  await db.from("focus").delete().eq("kind", "tile").eq("target_id", tileId);
}

/**
 * Leader un-done: clear the completion and reset progress to 0. This is the ONLY
 * path that un-completes a target — logProgress and toggleItem never do, so a goal
 * change can't silently drop a completion and re-lock a region.
 */
async function clearTiles(db: SupabaseClient, tileIds: string[]) {
  if (!tileIds.length) return;
  await db.from("tile_completions").delete().in("tile_id", tileIds);
  await wipeProgress(db, tileIds);
}

// ---------------------------------------------------------------------------
// Tile note — one shared line of text on the few tiles that need a decision
// recorded next to their boxes (which Barrows brother the team is going for)
// ---------------------------------------------------------------------------
const NOTE_MAX = 80;

export async function setTileNote(tileId: string, note: string) {
  const id = await requirePlayer();
  if (!id) return { error: "Pick a character first." };

  const target = findTarget(tileId);
  if (!target) return { error: "Unknown tile." };
  if (!progressSpec(target).note) return { error: "This tile has no note field." };

  const db = admin();
  const leader = await actingLeader();
  const gate = await canTouch(db, tileId, id, leader);
  if (!gate.ok) return { error: "Claim the tile first (I'm on this), or ask the leader." };

  const text = note.trim().slice(0, NOTE_MAX);
  const { error } = text
    ? await db
        .from("tile_notes")
        .upsert({ tile_id: tileId, note: text, updated_by: id, updated_at: new Date().toISOString() })
    : await db.from("tile_notes").delete().eq("tile_id", tileId);
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
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
  if (done) {
    await wipeProgress(db, [tileId]);
    await fillDoneTile(db, tileId, id);
  } else {
    await clearTiles(db, [tileId]);
  }
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
  const ids = region.tiles.map((t) => t.id).filter((tid) => tid !== FREE_SPACE);
  if (done) {
    await wipeProgress(db, ids);
    for (const tileId of ids) await fillDoneTile(db, tileId, id);
  } else {
    await clearTiles(db, ids);
  }
  refresh();
  return { ok: true };
}
