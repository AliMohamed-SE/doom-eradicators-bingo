// All game logic, as pure functions over (boardData, eventState).
//
// Ported 1:1 from the prototype (design-reference/prototype.html). Components must
// not re-derive any of this inline — region unlock, tile state, goal parsing,
// progress totals, points, tile rules, and OSRS-info estimates all live here.
//
// The prototype keys crew/progress/intents by player *name*; in production we key
// by player *id* (uuid). These functions treat the key as an opaque string, so the
// same logic serves both. Name resolution for display is the caller's job.

import {
  REGIONS,
  BRIDGES,
  TILE_RULES,
  TILE_TRACKING,
  FREE_SPACE,
  type Region,
  type Bridge,
  type Tile,
  type OsrsInfo,
  type ItemDef,
  type ItemSet,
  type NoteField,
  type TileTracking,
  type Confidence,
} from "./board-data";
import type { ProofLink } from "./proof";

export type TileState = "locked" | "available" | "working" | "done";
export type Intent = "want" | "ok" | "no";

/** Live, shared event state — the only thing that lives in the database. */
export interface EventState {
  /** tileId -> playerIds claimed ("I'm on this") */
  claims: Record<string, string[]>;
  /** tileId -> playerId -> progress count */
  progress: Record<string, Record<string, number>>;
  /**
   * tileId -> itemKey -> playerId who ticked it. Only checklist tiles (and the
   * `alt` boxes) have entries. This is attribution ONLY — `progress` stays the
   * authoritative total, so legacy rows logged before item tracking still count.
   */
  items: Record<string, Record<string, string>>;
  /** tileId -> the shared free-text note on that tile, for the few that have one */
  notes: Record<string, string>;
  /**
   * tileId -> the proof links a leader attached, in display order. Evidence only:
   * nothing here affects completion, scoring or unlocks, so a tile with no proof is
   * still done. The report is what makes the gap visible.
   */
  proofs: Record<string, ProofLink[]>;
  /** completed tile/bridge ids (free_space is implicitly done, need not be present) */
  done: ReadonlySet<string>;
  /** tileId -> playerId -> intent */
  intents: Record<string, Record<string, Intent>>;
  /** leader-set region focus */
  focusRegions: readonly string[];
  /** leader-set tile focus */
  focusTiles: readonly string[];
}

export type TileTarget = Tile & {
  kind: "tile";
  regionId: string;
  regionName: string;
  row: number;
  col: number;
};
export type BridgeTarget = Bridge & { kind: "bridge" };
export type Target = TileTarget | BridgeTarget;

// ---------------------------------------------------------------------------
// Board traversal
// ---------------------------------------------------------------------------

export function allTiles(regions: readonly Region[] = REGIONS): TileTarget[] {
  const out: TileTarget[] = [];
  regions.forEach((r) =>
    r.tiles.forEach((t, i) => {
      out.push({
        ...t,
        kind: "tile",
        regionId: r.id,
        regionName: r.name,
        row: Math.floor(i / 3),
        col: i % 3,
      });
    }),
  );
  return out;
}

export function findTarget(
  id: string,
  regions: readonly Region[] = REGIONS,
  bridges: readonly Bridge[] = BRIDGES,
): Target | null {
  const t = allTiles(regions).find((x) => x.id === id);
  if (t) return t;
  const b = bridges.find((x) => x.id === id);
  return b ? { ...b, kind: "bridge" } : null;
}

// ---------------------------------------------------------------------------
// Board geometry — the nine regions are a 3x3 grid, in REGIONS order:
//
//     north_west   north    north_east
//     west         central  east
//     south_west   south    south_east
//
// Bridges are the edges of that grid. Every region has up to four (north, east,
// south, west); an edge region has none where it has no neighbour.
// ---------------------------------------------------------------------------

export type Side = "north" | "east" | "south" | "west";

export interface Cell {
  row: number;
  col: number;
}

/** Grid cell of a region, from its position in REGIONS. */
export function regionCell(regionId: string, regions: readonly Region[] = REGIONS): Cell | null {
  const i = regions.findIndex((r) => r.id === regionId);
  return i < 0 ? null : { row: Math.floor(i / 3), col: i % 3 };
}

/** The tile index within a 3x3 region that faces the given side. */
const FACING_INDEX: Record<Side, number> = { north: 1, west: 3, east: 5, south: 7 };

export interface BridgePlacement {
  /** 1-indexed CSS grid row on the 5x5 board map */
  gridRow: number;
  /** 1-indexed CSS grid column */
  gridColumn: number;
  /** true when the two regions are side by side, so the bridge stands on end */
  upright: boolean;
}

/**
 * Where a bridge is drawn on the board map. Regions occupy the odd tracks of a
 * 5x5 grid and the gutters between them are the even ones, so a bridge's cell
 * falls straight out of the two region cells it sits between.
 */
export function bridgePlacement(
  bridge: Bridge,
  regions: readonly Region[] = REGIONS,
): BridgePlacement | null {
  const a = regionCell(bridge.between[0], regions);
  const b = regionCell(bridge.between[1], regions);
  if (!a || !b) return null;
  const upright = a.row === b.row;
  return {
    gridRow: upright ? a.row * 2 + 1 : Math.min(a.row, b.row) * 2 + 2,
    gridColumn: upright ? Math.min(a.col, b.col) * 2 + 2 : a.col * 2 + 1,
    upright,
  };
}

/** Where a region panel sits on that same 5x5 map. */
export function regionPlacement(
  regionId: string,
  regions: readonly Region[] = REGIONS,
): { gridRow: number; gridColumn: number } | null {
  const c = regionCell(regionId, regions);
  return c ? { gridRow: c.row * 2 + 1, gridColumn: c.col * 2 + 1 } : null;
}

/** Every bridge that touches a region, in board order. */
export function bridgesForRegion(
  regionId: string,
  bridges: readonly Bridge[] = BRIDGES,
): Bridge[] {
  return bridges.filter((b) => b.between[0] === regionId || b.between[1] === regionId);
}

/** The region on the far side of a bridge from `regionId` (null if it doesn't touch it). */
export function bridgeOther(bridge: Bridge, regionId: string): string | null {
  const [a, b] = bridge.between;
  return regionId === a ? b : regionId === b ? a : null;
}

/** Which way you travel when crossing a bridge out of `regionId`. */
export function bridgeSideFrom(
  bridge: Bridge,
  regionId: string,
  regions: readonly Region[] = REGIONS,
): Side | null {
  const other = bridgeOther(bridge, regionId);
  if (!other) return null;
  const here = regionCell(regionId, regions);
  const there = regionCell(other, regions);
  if (!here || !there) return null;
  if (there.row < here.row) return "north";
  if (there.row > here.row) return "south";
  if (there.col < here.col) return "west";
  if (there.col > here.col) return "east";
  return null;
}

/**
 * The tile that must be done before a bridge can be worked, approaching from
 * `regionId`: the tile in that region facing the bridge. Not stored on the
 * bridge — a two-way bridge has one prereq per side, and both are geometry.
 */
export function bridgePrereq(
  bridge: Bridge,
  regionId: string,
  regions: readonly Region[] = REGIONS,
): string | null {
  const side = bridgeSideFrom(bridge, regionId, regions);
  if (!side) return null;
  const region = regions.find((r) => r.id === regionId);
  return region?.tiles[FACING_INDEX[side]]?.id ?? null;
}

// ---------------------------------------------------------------------------
// Completion / unlock / state
// ---------------------------------------------------------------------------

export function isDone(done: ReadonlySet<string>, id: string): boolean {
  return id === FREE_SPACE || done.has(id);
}

/**
 * Every region reachable from central over cleared bridges. Bridges are two-way,
 * so this is plain graph reachability, not "one bridge owns one region".
 */
export function unlockedRegions(
  done: ReadonlySet<string>,
  bridges: readonly Bridge[] = BRIDGES,
): ReadonlySet<string> {
  const cached = bridges === BRIDGES ? UNLOCKED_CACHE.get(done) : undefined;
  if (cached) return cached;
  const open = new Set<string>(["central"]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const b of bridges) {
      if (!done.has(b.id)) continue;
      const [a, c] = b.between;
      if (open.has(a) && !open.has(c)) {
        open.add(c);
        grew = true;
      } else if (open.has(c) && !open.has(a)) {
        open.add(a);
        grew = true;
      }
    }
  }
  if (bridges === BRIDGES) UNLOCKED_CACHE.set(done, open);
  return open;
}

// The done-set is rebuilt once per snapshot, so keying the reachability result
// off it keeps the 81 per-tile lookups from re-walking the graph every time.
const UNLOCKED_CACHE = new WeakMap<ReadonlySet<string>, ReadonlySet<string>>();

export function regionUnlocked(
  regionId: string,
  done: ReadonlySet<string>,
  bridges: readonly Bridge[] = BRIDGES,
): boolean {
  return unlockedRegions(done, bridges).has(regionId);
}

/**
 * `available`/`working` — crossable now, from whichever side is open.
 * `redundant` — both its regions are already open, so it leads nowhere new.
 * `locked` — neither side is open yet, its facing tile isn't done, or it has no
 * objective on record.
 */
export type BridgeStatus = TileState | "redundant";

export interface BridgeApproach {
  status: BridgeStatus;
  /** the open region you would cross from, when there is exactly one */
  from: string | null;
  /** the region this bridge would open */
  to: string | null;
  /** the tile that gates it, from `from` */
  prereq: string | null;
}

export function bridgeApproach(
  bridge: Bridge,
  state: Pick<EventState, "done"> & Partial<Pick<EventState, "claims">>,
  bridges: readonly Bridge[] = BRIDGES,
  regions: readonly Region[] = REGIONS,
): BridgeApproach {
  const [a, b] = bridge.between;
  const open = unlockedRegions(state.done, bridges);
  const aOpen = open.has(a);
  const bOpen = open.has(b);
  const from = aOpen && !bOpen ? a : bOpen && !aOpen ? b : null;
  const to = from ? bridgeOther(bridge, from) : null;
  const prereq = from ? bridgePrereq(bridge, from, regions) : null;

  const status: BridgeStatus = isDone(state.done, bridge.id)
    ? "done"
    : aOpen && bOpen
      ? "redundant"
      : !from || bridge.mystery || (prereq && !isDone(state.done, prereq))
        ? "locked"
        : crewState(bridge.id, state.claims ?? {});

  return { status, from, to, prereq };
}

export function bridgeStatus(
  bridge: Bridge,
  state: Pick<EventState, "done"> & Partial<Pick<EventState, "claims">>,
  bridges: readonly Bridge[] = BRIDGES,
  regions: readonly Region[] = REGIONS,
): BridgeStatus {
  return bridgeApproach(bridge, state, bridges, regions).status;
}

/**
 * The quickest bridge into a locked region, for costing it. A region opens over
 * ANY of its borders, so there is no such thing as "the" way in — this is only
 * the cheapest of them, and nothing should present it as the route to take.
 * Null once the region is open, or when every bridge on its borders is cleared.
 */
export function fastestWayIn(
  regionId: string,
  done: ReadonlySet<string>,
  bridges: readonly Bridge[] = BRIDGES,
): Bridge | null {
  if (regionUnlocked(regionId, done, bridges)) return null;
  // Hours on record first; a bridge with no rate sorts behind one that has a
  // rate, and a mystery bridge — which has nothing to estimate at all — last.
  const cost = (b: Bridge) =>
    b.mystery ? Number.MAX_SAFE_INTEGER : (infoFor(b).best ?? Number.MAX_SAFE_INTEGER - 1);
  return (
    bridgesForRegion(regionId, bridges)
      .filter((b) => !done.has(b.id))
      .sort((a, b) => cost(a) - cost(b))[0] ?? null
  );
}
function crewState(id: string, claims: EventState["claims"]): TileState {
  return (claims[id] || []).length ? "working" : "available";
}

/**
 * The state that drives all tile styling.
 * locked -> available -> working -> done.
 */
export function tileState(
  target: Target,
  state: EventState,
  bridges: readonly Bridge[] = BRIDGES,
): TileState {
  if (isDone(state.done, target.id)) return "done";
  if (target.kind === "bridge") {
    const st = bridgeStatus(target, state, bridges);
    // A redundant bridge is still workable, just pointless — the styling calls
    // that out, but its tile state stays in the normal four-state vocabulary.
    return st === "redundant" ? crewState(target.id, state.claims) : st;
  }
  if (!regionUnlocked(target.regionId, state.done, bridges)) return "locked";
  return crewState(target.id, state.claims);
}

// ---------------------------------------------------------------------------
// Goals & progress
// ---------------------------------------------------------------------------

/** The tracking override for a target, if it has one. */
export function trackingOf(id: string | undefined): TileTracking | undefined {
  return id ? TILE_TRACKING[id] : undefined;
}

/**
 * The tick boxes for a checklist target; empty for a plain counter.
 *
 * A `sets` target has no `items` of its own — its boxes are every piece of every
 * set, flattened in declaration order. That is deliberately what the boxes ARE:
 * validation (toggleItem), leader reassignment (setTileItemOwners) and the mode
 * check all want the full list, and only the goal and the credit rule care about
 * the grouping. Compare goalOf, which reads one set's length instead.
 */
export function itemsOf(target: { id?: string } | null | undefined): readonly ItemDef[] {
  const track = trackingOf(target?.id);
  if (track?.items?.length) return track.items;
  return track?.sets?.flatMap((s) => s.items) ?? [];
}

/** The alternative sets on a target; empty for everything else. */
export function setsOf(target: { id?: string } | null | undefined): readonly ItemSet[] {
  return trackingOf(target?.id)?.sets ?? [];
}

/** Row labels for a set grid, index-aligned with each set's items. */
export function slotsOf(target: { id?: string } | null | undefined): readonly string[] {
  return trackingOf(target?.id)?.slots ?? [];
}

/** Boxes that clear the whole objective on their own; usually empty. */
export function altOf(target: { id?: string } | null | undefined): readonly ItemDef[] {
  return trackingOf(target?.id)?.alt ?? [];
}

/**
 * How many of the thing the target asks for, in order of authority:
 *   1. TILE_TRACKING.sets[0]    — one set's length, NOT the total number of boxes
 *   2. TILE_TRACKING.items      — one per named part, all required
 *   3. i.hr.got                 — the throughput objectives (10k runes, 500 laps)
 *   4. the leading "Nx" in the objective text
 *   5. 1
 *
 * Sets come first and count one set, because that is the objective: four pieces of
 * one Barrows brother, not 24 pieces of six. Every set on a tile is the same length
 * (asserted in scoring.test.ts), so which one we measure does not matter.
 *
 * Callers must pass the whole target, not just `{ o }` — the goal has not come
 * from the prose alone since checklist and bulk tiles existed.
 */
export function goalOf(tile: Pick<Tile, "o"> & { id?: string; i?: OsrsInfo }): number {
  const track = trackingOf(tile.id);
  if (track?.sets?.length) return track.sets[0].items.length;
  if (track?.items?.length) return track.items.length;
  if (tile.i?.hr) return tile.i.hr.got;
  const m = /(\d+)\s*x/i.exec(tile.o || "");
  return m ? parseInt(m[1], 10) : 1;
}

/**
 * Above this goal, clicking +1 to the finish is absurd, so the drawer offers a
 * "type how many you did" box instead. 10 is the smallest goal on the board that
 * anyone would want to enter in one go.
 */
export const BULK_THRESHOLD = 10;

export type ProgressMode = "count" | "checklist" | "bulk";

export interface ProgressSpec {
  mode: ProgressMode;
  goal: number;
  items: readonly ItemDef[];
  /**
   * The mutually alternative sets, when the tile has them; empty otherwise. A set
   * tile stays `mode: "checklist"` on purpose — every rule that branches on that
   * mode is really asking "do the counts come from ticks?", and for a set tile they
   * still do. Only the box UI cares about the grouping, so only it reads this.
   */
  sets: readonly ItemSet[];
  /** row labels for the set grid, index-aligned with each set's items */
  slots: readonly string[];
  alt: readonly ItemDef[];
  /** unit word for the bulk readout ("laps"), "" when there isn't one */
  unit: string;
  /** the shared free-text box this target asks for, if any */
  note: NoteField | null;
  /** one-tap increments offered in bulk mode */
  quick: readonly number[];
}

/**
 * The single place that decides how a target's progress is entered. Components
 * must not sniff TILE_TRACKING or i.hr themselves.
 */
export function progressSpec(target: Target | Tile | Bridge): ProgressSpec {
  const t = target as { id?: string; o?: string; i?: OsrsInfo };
  const goal = goalOf({ o: t.o ?? "", id: t.id, i: t.i });
  const items = itemsOf(t);
  const mode: ProgressMode = items.length
    ? "checklist"
    : goal >= BULK_THRESHOLD
      ? "bulk"
      : "count";
  return {
    mode,
    goal,
    items,
    sets: setsOf(t),
    slots: slotsOf(t),
    alt: altOf(t),
    note: trackingOf(t.id)?.note ?? null,
    unit: t.i?.hr?.u ?? "",
    quick: goal >= 1000 ? [100, 1000] : goal >= 100 ? [10, 50] : [1, 5],
  };
}

export function progressTotal(progress: EventState["progress"], id: string): number {
  const c = progress[id] || {};
  return Object.keys(c).reduce((a, k) => a + (c[k] || 0), 0);
}

export interface Contributor {
  playerId: string;
  count: number;
}

/** Contributors with a positive count, highest first. */
export function contributors(progress: EventState["progress"], id: string): Contributor[] {
  const c = progress[id] || {};
  return Object.keys(c)
    .filter((k) => c[k] > 0)
    .sort((a, b) => c[b] - c[a])
    .map((k) => ({ playerId: k, count: c[k] }));
}

/** Whether a progress total reaches the tile's goal (auto-completion rule). */
export function reachesGoal(total: number, goal: number): boolean {
  return total >= goal;
}

/**
 * Whether a target is done after a progress write — the ONE completion rule,
 * shared by the server action and the optimistic client patch so the two cannot
 * drift.
 *
 * Completion is STICKY: reaching the goal records it, but falling back below the
 * goal never un-records it. That is what makes raising a tile's goal safe. Before
 * this rule existed, a tile finished at 1/1 whose goal later became 3 lost its
 * completion the next time anyone touched it — and since region unlocking is
 * reachability over completed bridges, losing one completion could re-lock nine
 * tiles. Un-completing is a leader action (forceCompletion -> clearTile), never a
 * side effect. It also closes a race: two players writing at once could both
 * re-sum stale totals, one inserting the completion and the other deleting it.
 */
export function completionAfter(alreadyDone: boolean, total: number, goal: number): boolean {
  return alreadyDone || reachesGoal(total, goal);
}

// ---------------------------------------------------------------------------
// Checklist items
// ---------------------------------------------------------------------------

/** The proof links on one target, in display order; empty for an untouched one. */
export function proofsFor(
  proofs: EventState["proofs"],
  id: string,
): readonly ProofLink[] {
  return proofs[id] ?? [];
}

/** itemKey -> playerId for one target. */
export function itemOwners(
  items: EventState["items"],
  id: string,
): Record<string, string> {
  return items[id] || {};
}

/** One set's standing on a target: how many of its pieces are ticked. */
export interface SetProgress {
  set: ItemSet;
  /** pieces of this set with an owner */
  ticks: number;
  /** every piece ticked — this set alone finishes the tile */
  complete: boolean;
}

/** Every set's standing, in declaration order. Empty for a target without sets. */
export function setProgress(
  target: { id?: string },
  owners: Record<string, string>,
): SetProgress[] {
  return setsOf(target).map((set) => {
    const ticks = set.items.reduce((a, i) => a + (owners[i.k] ? 1 : 0), 0);
    return { set, ticks, complete: ticks >= set.items.length };
  });
}

/**
 * The set the team is closest to finishing — the one the tile's progress readout
 * and every count on it are measured against.
 *
 * Ties go to declaration order. That is arbitrary but it has to be SOMETHING and it
 * has to be stable, because this decides whose contribution counts: while two
 * brothers are level on two pieces each, only one of them can be "2/4" without the
 * total on the tile becoming a number that means nothing. A completed set always
 * wins outright, since complete is the highest score available.
 *
 * Null when the target has no sets, so callers can use it as the "is this a set
 * tile" test as well.
 */
export function leadingSet(
  target: { id?: string },
  owners: Record<string, string>,
): SetProgress | null {
  let best: SetProgress | null = null;
  for (const p of setProgress(target, owners)) {
    if (!best || p.ticks > best.ticks) best = p;
  }
  return best;
}

/** The set that is finished, if one is. First declared wins the (impossible) tie. */
export function completedSet(
  target: { id?: string },
  owners: Record<string, string>,
): ItemSet | null {
  return setProgress(target, owners).find((p) => p.complete)?.set ?? null;
}

/**
 * What ticks are worth against the goal — all of them, or one player's when
 * `playerId` is given. An `alt` tick is worth the whole goal, which is how "or a
 * Shadow" beats three Masori pieces without giving individual boxes weights;
 * weights would quietly redefine what a "count" means in the crew list and in the
 * contributions ranking.
 *
 * On a `sets` target only the LEADING set's pieces are worth anything. A player
 * holding Dharok's helm and Ahrim's staff has one piece of two different grinds and
 * has moved the objective forward by one, not two — crediting both would let a tile
 * whose goal is 4 read 6/4 with no set anywhere near done, and completion is a
 * re-sum of exactly these numbers (syncCompletion in app/actions.ts). The pieces
 * outside the leading set are not lost: they are still ticked, still attributed, and
 * still there the moment their own set takes the lead.
 *
 * The consequence worth knowing about: one person's tick can move every OTHER
 * player's count, because it can change which set leads. Whatever writes a set
 * tile's counts must therefore recompute the whole tile, not one row — see
 * derivedCounts, and recountItems in app/actions.ts.
 *
 * The one place this rule lives — the server recomputes counts with it, the drawer
 * decides which boxes are still live with it.
 */
export function tickCredit(
  target: { id?: string; o?: string; i?: OsrsInfo },
  owners: Record<string, string>,
  playerId?: string,
): number {
  const goal = goalOf({ o: target.o ?? "", id: target.id, i: target.i });
  const altKeys = new Set(altOf(target).map((a) => a.k));
  const mine = (owner: string | undefined) =>
    !!owner && (playerId === undefined || owner === playerId);

  let credit = 0;
  // `alt` is orthogonal to the rest: it is one item that replaces the whole grind,
  // whichever shape the grind has.
  for (const key of altKeys) if (mine(owners[key])) credit += goal;

  const lead = leadingSet(target, owners);
  if (lead) {
    for (const item of lead.set.items) if (mine(owners[item.k])) credit += 1;
    return credit;
  }

  for (const [key, owner] of Object.entries(owners)) {
    if (altKeys.has(key) || !mine(owner)) continue;
    credit += 1;
  }
  return credit;
}

/**
 * Everyone's count on a target, derived from its box owners alone.
 *
 * The whole breakdown at once, because on a set tile that is the only correct unit:
 * one tick can change which set leads and so change what everybody else's ticks are
 * worth. Shared by the server's recount, the leader editor's read-only figures and
 * the optimistic patch, so all three agree about who is owed what.
 *
 * Players whose ticks are worth nothing are omitted, not zeroed — "no row" and
 * "0 logged" are the same state everywhere else (see setCount in app/actions.ts).
 */
export function derivedCounts(
  target: { id?: string; o?: string; i?: OsrsInfo },
  owners: Record<string, string>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const pid of new Set(Object.values(owners))) {
    const n = tickCredit(target, owners, pid);
    if (n > 0) out[pid] = n;
  }
  return out;
}

/**
 * The boxes a leader's force-done should tick, so a finished tile never shows a full
 * count against empty boxes. One whole set on a set tile — any of them would do, and
 * the first is the one the grid reads left to right.
 */
export function completingItems(
  target: { id?: string; o?: string; i?: OsrsInfo },
): readonly ItemDef[] {
  const sets = setsOf(target);
  if (sets.length) return sets[0].items;
  return itemsOf(target).slice(0, goalOf({ o: target.o ?? "", id: target.id, i: target.i }));
}

/**
 * How legacy progress becomes tick boxes: walk the contributors biggest-first and
 * hand each one the next `count` keys in declaration order. A tile finished at
 * 4/4 before item tracking existed comes out with all four boxes ticked and
 * attributed to the people who actually logged it; a half-done tile comes out
 * with that many ticked, which someone can then reassign by hand.
 *
 * Mirrored by the backfill in supabase/migrations/0004_tile_items.sql — the two
 * must agree, so keep both to this one rule.
 */
export function assignLegacyItems(
  contribs: readonly Contributor[],
  itemKeys: readonly string[],
): { itemKey: string; playerId: string }[] {
  const out: { itemKey: string; playerId: string }[] = [];
  let i = 0;
  for (const c of contribs) {
    for (let n = 0; n < c.count && i < itemKeys.length; n++, i++) {
      out.push({ itemKey: itemKeys[i], playerId: c.playerId });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface Score {
  rows: number;
  cols: number;
  mids: number;
  blackouts: number;
  total: number;
}

/**
 * Per region, summed: row of 3 = 5, column of 3 = 5, middle tile = 3,
 * full blackout = +7. Diagonals and bridges score nothing. The Free Space
 * middle never awards the 3-point bonus.
 */
export function scoreOf(
  done: ReadonlySet<string>,
  regions: readonly Region[] = REGIONS,
): Score {
  let rows = 0,
    cols = 0,
    mids = 0,
    blackouts = 0;
  regions.forEach((r) => {
    const d = r.tiles.map((t) => isDone(done, t.id));
    for (let i = 0; i < 3; i++) if (d[i * 3] && d[i * 3 + 1] && d[i * 3 + 2]) rows += 5;
    for (let c = 0; c < 3; c++) if (d[c] && d[c + 3] && d[c + 6]) cols += 5;
    if (d[4] && !(r.tiles[4] && r.tiles[4].id === FREE_SPACE)) mids += 3;
    if (d.every(Boolean)) blackouts += 7;
  });
  return { rows, cols, mids, blackouts, total: rows + cols + mids + blackouts };
}

export interface RegionStats {
  count: number;
  rows: number;
  cols: number;
  mid: boolean;
  blackout: boolean;
  points: number;
}

export function regionStats(region: Region, done: ReadonlySet<string>): RegionStats {
  const d = region.tiles.map((t) => isDone(done, t.id));
  let rows = 0,
    cols = 0;
  for (let i = 0; i < 3; i++) if (d[i * 3] && d[i * 3 + 1] && d[i * 3 + 2]) rows++;
  for (let c = 0; c < 3; c++) if (d[c] && d[c + 3] && d[c + 6]) cols++;
  const midFree = !!(region.tiles[4] && region.tiles[4].id === FREE_SPACE);
  const points = rows * 5 + cols * 5 + (d[4] && !midFree ? 3 : 0) + (d.every(Boolean) ? 7 : 0);
  return {
    count: d.filter(Boolean).length,
    rows,
    cols,
    mid: d[4] && !midFree,
    blackout: d.every(Boolean),
    points,
  };
}

export function regionFullyDone(region: Region, done: ReadonlySet<string>): boolean {
  return region.tiles.every((t) => isDone(done, t.id));
}

// ---------------------------------------------------------------------------
// Tile rules (two derived at runtime, not stored)
// ---------------------------------------------------------------------------

/**
 * Rules that belong to one tile: the stored TILE_RULES plus two derived rules —
 * the 5th tile of a region (index 4) gets the middle-tile rule, and any `ch:1`
 * tile gets the challenge-screenshot rule.
 */
export function tileRuleList(
  id: string,
  regions: readonly Region[] = REGIONS,
  tileRules: Record<string, string[]> = TILE_RULES,
): string[] {
  if (!id || id === FREE_SPACE) return [];
  const base = (tileRules[id] || []).slice();
  for (const region of regions) {
    const tiles = region.tiles;
    for (let j = 0; j < tiles.length; j++) {
      if (tiles[j].id !== id) continue;
      if (j === 4)
        base.push(
          tiles[j].ch
            ? "Middle challenge tile — worth 3 points, and it cannot be completed with a pet."
            : "Middle tile — worth 3 points on its own.",
        );
      if (tiles[j].ch) base.push("Challenge tile: screenshot your gear / inventory beforehand.");
      return base;
    }
  }
  return base;
}

// ---------------------------------------------------------------------------
// Planning intents
// ---------------------------------------------------------------------------

export interface IntentCounts {
  want: number;
  ok: number;
  no: number;
  total: number;
}

export function intentCounts(intents: EventState["intents"], id: string): IntentCounts {
  const row = intents[id] || {};
  const c: IntentCounts = { want: 0, ok: 0, no: 0, total: 0 };
  Object.keys(row).forEach((k) => {
    const v = row[k];
    if (v === "want" || v === "ok" || v === "no") {
      c[v]++;
      c.total++;
    }
  });
  return c;
}

export function intentPlayers(intents: EventState["intents"], id: string, v: Intent): string[] {
  const row = intents[id] || {};
  return Object.keys(row).filter((k) => row[k] === v);
}

export interface IntentBar {
  has: boolean;
  counts: IntentCounts;
  wantW: string;
  okW: string;
  noW: string;
}

export function intentBar(intents: EventState["intents"], id: string): IntentBar {
  const c = intentCounts(intents, id);
  const pct = (n: number) => (c.total ? (n / c.total) * 100 + "%" : "0%");
  return { has: c.total > 0, counts: c, wantW: pct(c.want), okW: pct(c.ok), noW: pct(c.no) };
}

// ---------------------------------------------------------------------------
// OSRS info & time estimates
// ---------------------------------------------------------------------------

export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/**
 * Short count for the board cells, where "4000/10000" does not fit at 10px.
 * 4k, 1.5k, 10k. The drawer has room for the exact number, so it uses fmtNum.
 */
export function fmtCompact(n: number): string {
  if (n < 1000) return String(Math.round(n));
  const k = n / 1000;
  return (k < 10 ? Math.round(k * 10) / 10 : Math.round(k)) + "k";
}

export function fmtHrs(h: number | null | undefined): string {
  if (h == null || !isFinite(h) || h <= 0) return "—";
  if (h < 1) return Math.round(h * 60) + " min";
  if (h < 10) return Math.round(h * 10) / 10 + " h";
  if (h < 100) return Math.round(h) + " h";
  return Math.round(h / 5) * 5 + " h";
}

export interface ConfMeta {
  label: string;
  color: string;
  border: string;
}

const CONF: Record<Confidence, ConfMeta> = {
  w: { label: "WIKI RATE", color: "#7fd695", border: "#4f8a3c" },
  e: { label: "COMMUNITY EST.", color: "#ffe08a", border: "#a8862c" },
  u: { label: "UNCONFIRMED", color: "#f0b8a8", border: "#8a4a3a" },
};

export interface InfoRow {
  name: string;
  hours: number | null;
  detail: string;
}

export interface TileInfo {
  rows: InfoRow[];
  best: number | null;
  bestName: string;
  fixed: boolean;
  kind: "none" | "challenge" | "drops" | "rate" | "fixed";
  need: number;
  note: string;
  conf: ConfMeta | null;
}

/** Build the OSRS-info block (rate rows + best estimate) for a tile or bridge. */
export function infoFor(target: { i?: OsrsInfo; ch?: number } | null | undefined): TileInfo {
  const i = target?.i;
  const out: TileInfo = {
    rows: [],
    best: null,
    bestName: "",
    fixed: false,
    kind: "none",
    need: (i && i.need) || 1,
    note: (i && i.note) || "",
    conf: i ? CONF[i.c || "u"] : null,
  };
  if (!i) {
    out.kind = target && target.ch ? "challenge" : "none";
    return out;
  }
  if (i.d && i.d.length) {
    out.kind = "drops";
    i.d.forEach((d) => {
      const u = d.u || "kills";
      const actions = d.r * out.need;
      out.rows.push({
        name: d.n,
        hours: d.k ? actions / d.k : null,
        detail:
          "1/" +
          fmtNum(d.r) +
          " · ~" +
          d.k +
          " " +
          u +
          "/hr · " +
          fmtNum(actions) +
          " " +
          u +
          " for " +
          out.need +
          "×",
      });
    });
  }
  if (i.hr) {
    out.kind = "rate";
    out.rows.push({
      name: i.hr.u.charAt(0).toUpperCase() + i.hr.u.slice(1),
      hours: i.hr.got / i.hr.per,
      detail:
        fmtNum(i.hr.got) +
        " " +
        i.hr.u +
        " at ~" +
        fmtNum(i.hr.per) +
        " " +
        i.hr.u +
        " per hour",
    });
  }
  const timed = out.rows.filter((r) => r.hours);
  if (timed.length) {
    const fastest = timed.slice().sort((a, b) => (a.hours as number) - (b.hours as number))[0];
    out.best = fastest.hours;
    out.bestName = fastest.name;
  }
  if (i.fix) {
    out.best = i.fix;
    out.fixed = true;
    if (out.kind === "none") out.kind = "fixed";
  }
  return out;
}

export interface RegionEstimate {
  hours: number;
  rated: number;
  unknown: number;
  challenges: number;
  left: number;
  bridgeHours: number;
}

/** Sum of every open tile's best estimate (plus its bridge, if open), one player per tile. */
export function regionEstimate(
  region: Region,
  done: ReadonlySet<string>,
  bridges: readonly Bridge[] = BRIDGES,
): RegionEstimate {
  let hours = 0,
    rated = 0,
    unknown = 0,
    challenges = 0,
    left = 0,
    bridgeHours = 0;
  const tally = (target: { i?: OsrsInfo; ch?: number }): number => {
    const info = infoFor(target);
    if (info.best) {
      hours += info.best;
      rated++;
      return info.best;
    }
    if (info.kind === "challenge") challenges++;
    else unknown++;
    return 0;
  };
  // Costed over the quickest border in, not all of them — you only ever need to
  // clear one bridge to open a region.
  const b = fastestWayIn(region.id, done, bridges);
  if (b) {
    left++;
    bridgeHours = tally(b);
  }
  region.tiles.forEach((t) => {
    if (isDone(done, t.id)) return;
    left++;
    tally(t);
  });
  return { hours, rated, unknown, challenges, left, bridgeHours };
}

// ---------------------------------------------------------------------------
// Convenience: the mega-rares confidence palette re-exported for the info chip.
// ---------------------------------------------------------------------------

export { CONF };
