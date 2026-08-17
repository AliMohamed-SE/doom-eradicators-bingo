import "server-only";
import { cache } from "react";
import { admin } from "./supabase/admin";
import { getAuthUser } from "./auth";
import { hasLeaderCode } from "./session";
import { isLeaderPlayer } from "./board-data";
import type { EventState, Intent } from "./scoring";
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

  const [players, claims, progress, completions, intents, focus] = await Promise.all([
    supabase.from("players").select("id, name, is_leader, rares, task, auth_user_id").order("name"),
    supabase.from("tile_claims").select("tile_id, player_id"),
    supabase.from("tile_progress").select("tile_id, player_id, count"),
    supabase.from("tile_completions").select("tile_id, completed_at, completed_by"),
    supabase.from("tile_intents").select("tile_id, player_id, intent"),
    supabase.from("focus").select("kind, target_id"),
  ]);

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
    done,
    intents: intentMap,
    focusRegions,
    focusTiles,
  };

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
      doneIds: Array.from(data.state.done),
      intents: data.state.intents,
      focusRegions: [...data.state.focusRegions],
      focusTiles: [...data.state.focusTiles],
    },
  };
}
