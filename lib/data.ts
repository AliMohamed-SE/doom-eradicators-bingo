import "server-only";
import { cache } from "react";
import { admin } from "./supabase/admin";
import { read } from "./read";
import { getAuthUser } from "./auth";
import { hasLeaderCode } from "./session";
import { isLeaderPlayer } from "./board-data";
import type { EventState, Intent } from "./scoring";
import type { ProofLink } from "./proof";
import type { RivalBoardState } from "./rival";
import type { RareId } from "./board-data";
import type { PlayerRow, CompletionMeta, AppSnapshot } from "./types";

export type { PlayerRow, CompletionMeta } from "./types";

export interface AppData {
  /** signed in with Discord */
  authed: boolean;
  /** the linked character's row, or null if this Discord user hasn't linked one */
  me: PlayerRow | null;
  /** the current character is a designated leader (by name or is_leader column) */
  canBeLeader: boolean;
  /** designated leader AND this device has entered the leader code */
  isLeader: boolean;
  players: PlayerRow[];
  state: EventState;
  /** tileId -> completion timestamp + who forced it (for the drawer completion panel) */
  completionMeta: Record<string, CompletionMeta>;
  /** the tracked rival board, or null when no leader has set tracking up */
  rival: RivalBoardState | null;
  /**
   * Tables whose read failed even after a retry. Empty on a healthy load. Anything
   * in here means everything below is INCOMPLETE rather than empty, and the app
   * says so out loud rather than rendering a confidently wrong board.
   */
  failedReads: string[];
}

/**
 * Load everything the app needs in one pass: the roster of player rows and the
 * live event state, normalised into the shape lib/scoring.ts consumes.
 */
/** Request-scoped: layout and page share a single fetch per request. */
export const getAppData = cache(loadAppData);

export async function loadAppData(): Promise<AppData> {
  const supabase = admin();
  const [user, codeOk] = await Promise.all([getAuthUser(), hasLeaderCode()]);

  const [
    players,
    claims,
    progress,
    items,
    notes,
    completions,
    intents,
    focus,
    proofs,
    rivalBoard,
    rivalMarks,
  ] = await Promise.all([
    read("players", "", () =>
      supabase.from("players").select("id, name, is_leader, rares, task, auth_user_id").order("name"),
    ),
    read("tile_claims", "", () => supabase.from("tile_claims").select("tile_id, player_id")),
    read("tile_progress", "", () =>
      supabase.from("tile_progress").select("tile_id, player_id, count"),
    ),
    read("tile_items", "is migration 0004 applied?", () =>
      supabase.from("tile_items").select("tile_id, item_key, player_id"),
    ),
    read("tile_notes", "is migration 0004 applied?", () =>
      supabase.from("tile_notes").select("tile_id, note"),
    ),
    read("tile_completions", "", () =>
      supabase.from("tile_completions").select("tile_id, completed_at, completed_by"),
    ),
    read("tile_intents", "", () =>
      supabase.from("tile_intents").select("tile_id, player_id, intent"),
    ),
    read("focus", "", () => supabase.from("focus").select("kind, target_id")),
    // Ordered here so the grouping below preserves display order without sorting.
    read("tile_proofs", "is migration 0005 applied?", () =>
      supabase.from("tile_proofs").select("id, tile_id, title, url, ord").order("tile_id").order("ord"),
    ),
    // Singleton by construction (see migration 0008), so maybeSingle is the honest
    // read: no row means no leader has set rival tracking up.
    read<{ name: string; updated_at: string }>("rival_board", "is migration 0008 applied?", () =>
      supabase.from("rival_board").select("name, updated_at").maybeSingle(),
    ),
    read("rival_completions", "is migration 0008 applied?", () =>
      supabase.from("rival_completions").select("tile_id"),
    ),
  ]);

  // Which reads came back broken, after the retry inside read(). Anything in here
  // means the snapshot below is INCOMPLETE, not empty — see the note on read().
  const failedReads = [
    players,
    claims,
    progress,
    items,
    notes,
    completions,
    intents,
    focus,
    proofs,
    rivalBoard,
    rivalMarks,
  ]
    .map((r) => r.failed)
    .filter((t): t is string => !!t);

  const rawPlayers = players.data ?? [];
  const playerRows: PlayerRow[] = rawPlayers.map((p) => ({
    id: p.id,
    name: p.name,
    is_leader: p.is_leader,
    rares: (p.rares ?? []) as RareId[],
    task: p.task ?? "",
    linked: !!p.auth_user_id,
  }));
  const myId = user
    ? (rawPlayers.find((p) => p.auth_user_id === user.id)?.id ?? null)
    : null;

  const claimMap: Record<string, string[]> = {};
  (claims.data ?? []).forEach((c) => {
    (claimMap[c.tile_id] ??= []).push(c.player_id);
  });

  const progressMap: Record<string, Record<string, number>> = {};
  (progress.data ?? []).forEach((p) => {
    (progressMap[p.tile_id] ??= {})[p.player_id] = p.count;
  });

  const itemMap: Record<string, Record<string, string>> = {};
  (items.data ?? []).forEach((i) => {
    (itemMap[i.tile_id] ??= {})[i.item_key] = i.player_id;
  });

  const noteMap: Record<string, string> = {};
  (notes.data ?? []).forEach((n) => {
    if (n.note) noteMap[n.tile_id] = n.note;
  });

  const proofMap: Record<string, ProofLink[]> = {};
  (proofs.data ?? []).forEach((p) => {
    (proofMap[p.tile_id] ??= []).push({
      id: p.id,
      title: p.title ?? "",
      url: p.url,
      ord: p.ord,
    });
  });

  const done = new Set<string>((completions.data ?? []).map((c) => c.tile_id));

  const intentMap: Record<string, Record<string, Intent>> = {};
  (intents.data ?? []).forEach((i) => {
    (intentMap[i.tile_id] ??= {})[i.player_id] = i.intent as Intent;
  });

  const focusRegions: string[] = [];
  const focusTiles: string[] = [];
  (focus.data ?? []).forEach((f) => {
    if (f.kind === "region") focusRegions.push(f.target_id);
    else focusTiles.push(f.target_id);
  });

  const completionMeta: Record<string, CompletionMeta> = {};
  (completions.data ?? []).forEach((c) => {
    completionMeta[c.tile_id] = { completedAt: c.completed_at, completedBy: c.completed_by };
  });

  const state: EventState = {
    claims: claimMap,
    progress: progressMap,
    items: itemMap,
    notes: noteMap,
    proofs: proofMap,
    done,
    intents: intentMap,
    focusRegions,
    focusTiles,
  };

  // The board row is the switch: no row, no rival board, and the marks (which
  // cascade off it) cannot outlive it.
  const rival: RivalBoardState | null = rivalBoard.data
    ? {
        name: rivalBoard.data.name,
        doneIds: (rivalMarks.data ?? []).map((m) => m.tile_id),
        updatedAt: rivalBoard.data.updated_at,
      }
    : null;

  const me = myId ? (playerRows.find((p) => p.id === myId) ?? null) : null;
  const canBeLeader = me ? isLeaderPlayer(me) : false;

  return {
    authed: !!user,
    me,
    canBeLeader,
    isLeader: canBeLeader && codeOk,
    players: playerRows,
    state,
    completionMeta,
    rival,
    failedReads,
  };
}

/** Serializable snapshot for passing to client components. */
export function toSnapshot(data: AppData): AppSnapshot {
  return {
    me: data.me,
    isLeader: data.isLeader,
    canBeLeader: data.canBeLeader,
    players: data.players,
    completionMeta: data.completionMeta,
    state: {
      claims: data.state.claims,
      progress: data.state.progress,
      items: data.state.items,
      notes: data.state.notes,
      proofs: data.state.proofs,
      doneIds: Array.from(data.state.done),
      intents: data.state.intents,
      focusRegions: [...data.state.focusRegions],
      focusTiles: [...data.state.focusTiles],
    },
    rival: data.rival,
    failedReads: data.failedReads,
  };
}
