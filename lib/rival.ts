/**
 * Doom Eradicators — the rival board.
 *
 * A second, read-only-ish copy of the same nine-region board, tracking what the
 * OTHER team has finished. It is deliberately the thinnest thing that can be
 * scored: a name, and a set of completed tile ids a leader ticks off screenshots.
 * No claims, no per-player progress, no checklists, no bridges, no unlocks — none
 * of that is knowable from the outside, and inventing it would make the rival
 * board look like a source of truth it is not.
 *
 * Scoring is NOT re-implemented here. `scoreOf` in lib/scoring.ts is the one
 * points rule this event has, and pointing it at the rival's done-set is the whole
 * reason the two totals are comparable at all.
 *
 * Client-safe: pure functions over board data, no DOM, no database, no
 * server-only imports — same contract as lib/proof.ts, so the page that ticks a
 * tile and the action that stores it share one implementation of every rule.
 */

import { REGIONS, FREE_SPACE, type Region } from "./board-data";
import { isDone, scoreOf, type Score } from "./scoring";

/** Matches the check constraint on rival_board.name. */
export const RIVAL_NAME_MAX = 60;

/**
 * The whole rival board, as the client sees it. `null` on the snapshot means no
 * leader has set tracking up yet — which is also what hides the tab.
 */
export interface RivalBoardState {
  /** what the leader called the team / board being tracked */
  name: string;
  /** tile ids the leader has marked complete */
  doneIds: string[];
  /** last mark or rename, ISO — shown so a stale board reads as stale */
  updatedAt: string | null;
}

/**
 * The one name rule, run by the setup form (to disable START) and by the server
 * action (because the client is untrusted and the two must agree).
 *
 * Collapses runs of whitespace so a pasted name cannot smuggle newlines into a
 * header, then slices. Returns "" when there is nothing usable, which is what
 * both callers treat as "reject".
 */
export function cleanRivalName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, RIVAL_NAME_MAX);
}

/** Runtime done-set for the rival board, in the shape every scoring function takes. */
export function rivalDone(rival: RivalBoardState | null): ReadonlySet<string> {
  return new Set(rival?.doneIds ?? []);
}

/**
 * Every tile id a leader is allowed to mark on the rival board: the 81 board
 * tiles, minus the free space (which `isDone` already treats as complete for
 * everyone, so storing it would be a row that changes nothing).
 *
 * Bridges are absent on purpose. They score nothing, they only gate OUR unlocks,
 * and a screenshot of somebody else's board does not say which of theirs are open.
 */
export function rivalMarkableIds(regions: readonly Region[] = REGIONS): string[] {
  return regions.flatMap((r) => r.tiles.map((t) => t.id)).filter((id) => id !== FREE_SPACE);
}

/** Is `id` a tile a leader may mark on the rival board? */
export function isRivalMarkable(id: string, regions: readonly Region[] = REGIONS): boolean {
  return rivalMarkableIds(regions).includes(id);
}

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------

/**
 * One tile, seen from both boards at once.
 *
 *   both — everybody has it; nothing to do
 *   us   — we finished it and they have not: our lead, defend it
 *   them — they finished it and we have not: the gap, and the only actionable one
 *   none — nobody has it: still up for grabs
 */
export type CompareState = "both" | "us" | "them" | "none";

export function compareState(
  ourDone: ReadonlySet<string>,
  theirDone: ReadonlySet<string>,
  tileId: string,
): CompareState {
  // Through isDone on both sides, so the free space reads "both" rather than
  // "us" — it is complete for every team by rule, not by anybody's effort.
  const a = isDone(ourDone, tileId);
  const b = isDone(theirDone, tileId);
  if (a && b) return "both";
  if (a) return "us";
  if (b) return "them";
  return "none";
}

export interface CompareCounts {
  both: number;
  us: number;
  them: number;
  none: number;
  total: number;
}

export function compareCounts(
  ourDone: ReadonlySet<string>,
  theirDone: ReadonlySet<string>,
  regions: readonly Region[] = REGIONS,
): CompareCounts {
  const counts: CompareCounts = { both: 0, us: 0, them: 0, none: 0, total: 0 };
  regions.forEach((r) =>
    r.tiles.forEach((t) => {
      counts[compareState(ourDone, theirDone, t.id)]++;
      counts.total++;
    }),
  );
  return counts;
}

export interface CompareSummary {
  us: Score;
  them: Score;
  /** our total minus theirs — positive means we are ahead */
  lead: number;
  counts: CompareCounts;
}

/**
 * Everything the compare view puts in its header. Purely derived: the compare
 * feature never writes anything, on either board.
 */
export function compareBoards(
  ourDone: ReadonlySet<string>,
  theirDone: ReadonlySet<string>,
  regions: readonly Region[] = REGIONS,
): CompareSummary {
  const us = scoreOf(ourDone, regions);
  const them = scoreOf(theirDone, regions);
  return { us, them, lead: us.total - them.total, counts: compareCounts(ourDone, theirDone, regions) };
}
