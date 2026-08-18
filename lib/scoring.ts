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
  FREE_SPACE,
  type Region,
  type Bridge,
  type Tile,
  type OsrsInfo,
  type Confidence,
} from "./board-data";

export type TileState = "locked" | "available" | "working" | "done";
export type Intent = "want" | "ok" | "no";

/** Live, shared event state — the only thing that lives in the database. */
export interface EventState {
  /** tileId -> playerIds claimed ("I'm on this") */
  claims: Record<string, string[]>;
  /** tileId -> playerId -> progress count */
  progress: Record<string, Record<string, number>>;
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

/** goal = the leading "Nx" number in the objective text, else 1. */
export function goalOf(tile: Pick<Tile, "o">): number {
  const m = /(\d+)\s*x/i.exec(tile.o || "");
  return m ? parseInt(m[1], 10) : 1;
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
