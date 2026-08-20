/**
 * Doom Eradicators — leader-side contribution editing.
 *
 * Everyone logs their own progress as they go, but the board is really kept
 * straight by the leaders after the fact: three crystals dropped for three
 * different people, or 50 rumours where one person did 10 and another did 20, and
 * whoever pressed + does not match who actually did the work. These are the rules
 * for rewriting that breakdown wholesale.
 *
 * Two shapes, because a tile has two ways of holding a contribution and the editor
 * must not offer the wrong one:
 *
 *  - counts  — `count`/`bulk` targets. A number per player, and the numbers ARE the
 *              record. See cleanContribRows.
 *  - owners  — `checklist` targets. Each named box has exactly one owner and the
 *              counts are derived from that (lib/scoring.ts tickCredit), so the
 *              leader reassigns boxes, never numbers. See cleanItemOwnerRows.
 *
 * Both rules live here so the popup that edits them and the action that stores them
 * share one implementation: the popup can only offer a save the server would accept,
 * and vitest.config.ts collects lib/**\/*.test.ts only, so a rule outside lib/ is a
 * rule nothing tests. Client-safe — no imports, no DOM, no database.
 */

/** One player's count on a `count`/`bulk` target. */
export interface ContribRow {
  playerId: string;
  count: number;
}

/** One checklist box and who owns it, `null` meaning nobody. */
export interface ItemOwnerRow {
  itemKey: string;
  playerId: string | null;
}

/**
 * Payload bound, not a roster rule. The roster is 17 seats, so anything past this
 * is a hand-crafted request rather than a leader editing a tile.
 */
export const CONTRIB_MAX_ROWS = 60;

/**
 * Clean an untrusted count list against a target's goal and the real roster.
 *
 * Every clamp here matches logProgress in app/actions.ts, because a leader
 * rewriting a breakdown must not be able to put a value in tile_progress.count that
 * the normal + button could not: integers only, never negative, never past the goal
 * (`count` is `int check (count >= 0)` in SQL, so a float or a negative is a failed
 * write, not a smaller number).
 *
 * Zero rows are DROPPED rather than kept, mirroring setCount() deleting a row at
 * zero — "0 logged" and "no row" have to be the same state or the contributions page
 * would list people who did nothing.
 *
 * Duplicates keep the LAST occurrence. The editor renders one row per player so it
 * cannot produce them; this only decides what a malformed payload means.
 */
export function cleanContribRows(
  rows: unknown,
  goal: number,
  validIds: readonly string[],
): ContribRow[] {
  if (!Array.isArray(rows)) return [];
  const allowed = new Set(validIds);
  const byPlayer = new Map<string, number>();
  for (const r of rows.slice(0, CONTRIB_MAX_ROWS)) {
    if (!r || typeof r !== "object") continue;
    const { playerId, count } = r as { playerId?: unknown; count?: unknown };
    if (typeof playerId !== "string" || !allowed.has(playerId)) continue;
    if (typeof count !== "number" || !Number.isFinite(count)) continue;
    const n = Math.min(goal, Math.max(0, Math.trunc(count)));
    byPlayer.set(playerId, n);
  }
  return [...byPlayer]
    .filter(([, count]) => count > 0)
    .map(([playerId, count]) => ({ playerId, count }));
}

/** What a breakdown adds up to, for the editor's "SUM x / goal" readout. */
export function contribSum(rows: readonly ContribRow[]): number {
  return rows.reduce((a, r) => a + r.count, 0);
}

/**
 * Clean an untrusted owner list against a target's real box keys and the roster.
 *
 * `item_key` is bare text with no foreign key, so an unknown key would create a row
 * nothing can render or clear — the same reason toggleItem validates it. An unknown
 * or unlinked player id becomes `null` (nobody) rather than being dropped, so a
 * leader clearing a box whose owner has since left the team still clears it.
 *
 * Duplicates keep the last occurrence, and the result is ordered by `keys` so the
 * caller writes rows in board order.
 */
export function cleanItemOwnerRows(
  rows: unknown,
  keys: readonly string[],
  validIds: readonly string[],
): ItemOwnerRow[] {
  if (!Array.isArray(rows)) return [];
  const allowedKeys = new Set(keys);
  const allowedIds = new Set(validIds);
  const byKey = new Map<string, string | null>();
  for (const r of rows.slice(0, CONTRIB_MAX_ROWS)) {
    if (!r || typeof r !== "object") continue;
    const { itemKey, playerId } = r as { itemKey?: unknown; playerId?: unknown };
    if (typeof itemKey !== "string" || !allowedKeys.has(itemKey)) continue;
    const owner =
      typeof playerId === "string" && allowedIds.has(playerId) ? playerId : null;
    byKey.set(itemKey, owner);
  }
  return keys.filter((k) => byKey.has(k)).map((k) => ({ itemKey: k, playerId: byKey.get(k)! }));
}

/**
 * Fold an owner edit onto the tile's current owners.
 *
 * `touched` is the point of this function: reassigning a box changes the count of
 * BOTH the player who had it and the player who now does, and a checklist count is
 * only ever recomputed from ticks (recountItems). Miss either side and the tile
 * shows ticked boxes against a stale number. Keys absent from `rows` are left alone,
 * so the caller may send only what changed.
 */
export function applyItemOwners(
  before: Readonly<Record<string, string>>,
  rows: readonly ItemOwnerRow[],
): { owners: Record<string, string>; touched: string[] } {
  const owners = { ...before };
  const touched = new Set<string>();
  for (const r of rows) {
    const was = owners[r.itemKey] ?? null;
    if (was === r.playerId) continue;
    if (was) touched.add(was);
    if (r.playerId) {
      owners[r.itemKey] = r.playerId;
      touched.add(r.playerId);
    } else {
      delete owners[r.itemKey];
    }
  }
  return { owners, touched: [...touched] };
}
