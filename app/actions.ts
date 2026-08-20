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
import { cleanProofRows, PROOF_MAX_ROWS, type ProofLink } from "@/lib/proof";
import {
  cleanContribRows,
  cleanItemOwnerRows,
  applyItemOwners,
  type ContribRow,
  type ItemOwnerRow,
} from "@/lib/contrib";
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

// ---------------------------------------------------------------------------
// Leader contribution edits — rewrite WHO did what on a target.
//
// Everything above lets a person log their own work. In practice the board is kept
// straight by the leaders afterwards, because people forget: three crystals dropped
// for three different people, or 50 rumours where one did 10 and another did 20, all
// logged under whoever happened to press the button. These two actions are the only
// way to move credit between players.
//
// Deliberately allowed on a FINISHED target. That is the main use for them — the
// tile is done, the split is wrong, and it has to be fixable without an "Undo done"
// that wipes every count and tick on the way past. Safe because completion is never
// derived downward (see completionAfter): lowering a total can't un-complete a tile,
// and clearTiles stays the single path that does.
//
// One action per shape, because a target holds a contribution in one of two ways and
// the validation for them has nothing in common. Both take the WHOLE list, like
// setTileProofs: the list is the unit of work, the leader edits it as a set, and one
// SAVE replaces the lot.
// ---------------------------------------------------------------------------

/** Every seat on the roster, linked or not. */
async function rosterIds(db: SupabaseClient): Promise<string[]> {
  const { data } = await db.from("players").select("id");
  return (data ?? []).map((r) => r.id as string);
}

/**
 * Leader sets each player's own count on a `count`/`bulk` target — the "some did 10,
 * some did 20" case. Players missing from `rows` (and any sent as 0) end up with no
 * row at all, so this both re-splits and takes credit away.
 *
 * A seat with no Discord linked is a valid recipient: they did the drop, they just
 * haven't signed in to log it.
 */
export async function setTileContribs(tileId: string, rows: ContribRow[]) {
  const id = await requirePlayer();
  if (!id) return { error: "Pick a character first." };
  if (!(await actingLeader())) return { error: "Leader only." };
  if (tileId === FREE_SPACE) return { error: "Free space isn't trackable." };

  const target = findTarget(tileId);
  if (!target) return { error: "Unknown tile." };
  const spec = progressSpec(target);
  // Same refusal as logProgress, for the same reason: on a checklist tile the counts
  // ARE the ticks (recountItems), so a number written here would be overwritten by
  // the next tick and disagree with the boxes until then.
  if (spec.mode === "checklist") {
    return { error: "Assign this tile's boxes instead — its counts come from those." };
  }

  const db = admin();
  // Validated against the live roster rather than the payload, so a stale client
  // cannot credit a seat that has since been deleted.
  const clean = cleanContribRows(rows, spec.goal, await rosterIds(db));

  if (clean.length) {
    const up = await db.from("tile_progress").upsert(
      clean.map((r) => ({
        tile_id: tileId,
        player_id: r.playerId,
        count: r.count,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "tile_id,player_id" },
    );
    if (up.error) return { error: up.error.message };
  }

  // Delete LAST and only what is gone, the same ordering as setTileProofs: there is
  // no transaction here, so a failure between the two calls has to leave a stale
  // extra contributor rather than a target whose progress has vanished.
  const keep = clean.map((r) => `"${r.playerId}"`).join(",");
  const del = clean.length
    ? await db
        .from("tile_progress")
        .delete()
        .eq("tile_id", tileId)
        .not("player_id", "in", `(${keep})`)
    : await db.from("tile_progress").delete().eq("tile_id", tileId);
  if (del.error) return { error: del.error.message };

  await syncCompletion(db, target, id);
  refresh();
  return { ok: true };
}

/**
 * Leader sets who owns each named box — the "three crystals dropped for three
 * different people" case. `playerId: null` clears a box.
 *
 * Only the keys present in `rows` are touched, and every player on either side of a
 * move is recounted from their ticks, because a reassignment changes two people's
 * numbers at once.
 */
export async function setTileItemOwners(tileId: string, rows: ItemOwnerRow[]) {
  const id = await requirePlayer();
  if (!id) return { error: "Pick a character first." };
  if (!(await actingLeader())) return { error: "Leader only." };

  const target = findTarget(tileId);
  if (!target) return { error: "Unknown tile." };
  const spec = progressSpec(target);
  // `alt` boxes are included: they exist on plain counters too ("…or just a Shadow"),
  // and whoever owns one is credited the whole goal, so they need reassigning most.
  const keys = [...spec.items, ...spec.alt].map((i) => i.k);
  if (!keys.length) return { error: "This tile has no boxes to assign." };

  const db = admin();
  const clean = cleanItemOwnerRows(rows, keys, await rosterIds(db));
  if (!clean.length) return { ok: true };

  const before = await db
    .from("tile_items")
    .select("item_key, player_id")
    .eq("tile_id", tileId);
  if (before.error) return { error: before.error.message };
  const beforeOwners: Record<string, string> = Object.fromEntries(
    (before.data ?? []).map((r) => [r.item_key as string, r.player_id as string]),
  );

  const { touched } = applyItemOwners(beforeOwners, clean);
  if (!touched.length) return { ok: true }; // nothing actually moved

  const assigned = clean.filter((r) => r.playerId);
  if (assigned.length) {
    const up = await db.from("tile_items").upsert(
      assigned.map((r) => ({ tile_id: tileId, item_key: r.itemKey, player_id: r.playerId })),
      { onConflict: "tile_id,item_key" },
    );
    if (up.error) return { error: up.error.message };
  }

  const cleared = clean.filter((r) => !r.playerId).map((r) => r.itemKey);
  if (cleared.length) {
    const del = await db
      .from("tile_items")
      .delete()
      .eq("tile_id", tileId)
      .in("item_key", cleared);
    if (del.error) return { error: del.error.message };
  }

  // Recompute rather than nudge, for the reason toggleItem gives: with no locking and
  // no stored procedures, an idempotent recount is the only thing stopping two tabs
  // from leaving ticks and counts permanently out of step.
  for (const pid of touched) await recountItems(db, target, pid);
  await syncCompletion(db, target, id);
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
  // tile_proofs is deliberately NOT wiped. Undoing a completion resets what the team
  // logged; the screenshots behind it are the one artefact that existed to outlive
  // exactly this kind of correction, and a leader who wants them gone can empty the
  // list from the tile.
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
// Tile proof — the screenshot links behind a completion, attached by a leader.
//
// One action for the whole list, because the list is the unit of work: the popup opens
// on every row a tile has, the leader edits them together, and one SAVE replaces the
// lot. That also keeps the URL rule, the leader gate and the optimistic patch each in
// exactly one place. The cost is last-writer-wins between two leaders editing the same
// tile at the same moment, which is precisely what setTileNote already does.
// ---------------------------------------------------------------------------
export async function setTileProofs(tileId: string, rows: ProofLink[]) {
  const id = await requirePlayer();
  if (!id) return { error: "Pick a character first." };
  // Leader-only, the same gate as the LEADER CONTROLS panel. Everyone can read proof;
  // only a leader decides what counts as proof.
  if (!(await actingLeader())) return { error: "Leader only." };

  const target = findTarget(tileId);
  if (!target) return { error: "Unknown tile." };

  // Bound the work before doing any of it — `rows` is wholly untrusted. The generous
  // multiple is so a leader who pasted duplicates gets them de-duped below rather than
  // rejected outright.
  if (!Array.isArray(rows) || rows.length > PROOF_MAX_ROWS * 4) {
    return { error: "Too many links." };
  }

  // The SAME normaliser the popup runs, so a client that validated its rows can only
  // get an error back for something genuinely exceptional.
  const clean = cleanProofRows(rows);

  const db = admin();
  const now = new Date().toISOString();

  if (clean.length) {
    const up = await db.from("tile_proofs").upsert(
      clean.map((r) => ({
        id: r.id,
        tile_id: tileId,
        title: r.title,
        url: r.url,
        ord: r.ord,
        updated_at: now,
        updated_by: id,
      })),
      { onConflict: "id" },
    );
    if (up.error) return { error: up.error.message };
  }

  // Delete LAST, and only the rows that are gone. There is no transaction here — this
  // project has no stored procedures, so an action is N independent round trips — so
  // the ordering IS the safety story: a failure between the two calls leaves a stale
  // extra link, never a tile whose evidence has vanished. Upserting rather than
  // replacing also preserves created_at on rows nobody touched.
  const keep = clean.map((r) => `"${r.id}"`).join(",");
  const del = clean.length
    ? await db.from("tile_proofs").delete().eq("tile_id", tileId).not("id", "in", `(${keep})`)
    : await db.from("tile_proofs").delete().eq("tile_id", tileId);
  if (del.error) return { error: del.error.message };

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
