// The export report model — one pure function over the same state the board reads.
//
// The report exists to answer two questions a leader used to answer by scrolling
// Discord: what has been completed, with the proof standing behind it, and how the
// points add up. It re-derives NOTHING: every number here comes out of lib/scoring.ts,
// which is where board rules live. `totals.pointsCheck` exists purely so a test can
// assert the per-region breakdown and scoreOf() agree, because a report that disagrees
// with the header's POINTS box is worse than no report.
//
// Client-safe and server-safe: no React, and deliberately no import of lib/data.ts,
// which is "server-only" and would break the node test environment.

import { REGIONS, BRIDGES, FREE_SPACE, type Region, type Bridge } from "./board-data";
import {
  allTiles,
  isDone,
  proofsFor,
  regionStats,
  scoreOf,
  unlockedRegions,
  type EventState,
  type RegionStats,
  type Score,
} from "./scoring";
import { bridgeJoins, bridgeLabel } from "./bridge-text";
import type { ProofLink } from "./proof";
import type { CompletionMeta, PlayerRow } from "./types";

export interface ReportTarget {
  id: string;
  name: string;
  /** null for a bridge, which belongs to a border rather than to a region */
  regionId: string | null;
  /** the region's name, or "Desert ↔ Fremennik" for a bridge */
  regionName: string;
  /** 1-indexed grid position inside the region; null for a bridge */
  row: number | null;
  col: number | null;
  /** raw ISO — formatting is the view's job, via fmtDate */
  completedAt: string | null;
  /** tile_completions.completed_by, resolved to a name; "" when nothing was recorded */
  recordedByName: string;
  proofs: readonly ProofLink[];
  /** completed, not the Free Space, and nothing attached */
  missingProof: boolean;
  isFreeSpace: boolean;
  isBridge: boolean;
}

export interface ReportRegion {
  id: string;
  name: string;
  unlocked: boolean;
  stats: RegionStats;
  /** completed tiles only, in board order */
  done: ReportTarget[];
  remaining: number;
}

export interface ReportTotals {
  tilesDone: number;
  tilesTotal: number;
  bridgesDone: number;
  bridgesTotal: number;
  regionsUnlocked: number;
  regionsTotal: number;
  regionsBlackedOut: number;
  proofCount: number;
  missingProof: number;
  /** Σ regions[].stats.points — must equal score.total; this is the audit trail */
  pointsCheck: number;
}

export interface ReportModel {
  score: Score;
  regions: ReportRegion[];
  /** cleared bridges only, in BRIDGES order */
  bridges: ReportTarget[];
  totals: ReportTotals;
}

/**
 * Fixed en-GB and UTC on purpose. The report is rendered on the server and again on the
 * client, so a locale- or zone-dependent format is both a hydration mismatch and a
 * document that reads differently depending on who opened it. "19 Aug 2026" everywhere.
 */
const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "no date recorded";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "no date recorded";
  return DATE_FMT.format(d);
}

export function buildReport(input: {
  state: EventState;
  players: readonly PlayerRow[];
  completionMeta: Record<string, CompletionMeta>;
  regions?: readonly Region[];
  bridges?: readonly Bridge[];
}): ReportModel {
  const { state, players, completionMeta } = input;
  const regions = input.regions ?? REGIONS;
  const bridges = input.bridges ?? BRIDGES;

  // Same fallback as playerName() in the provider: an id we can't resolve prints as
  // itself rather than vanishing from the record.
  const nameOf = (id: string | null | undefined) =>
    id ? (players.find((p) => p.id === id)?.name ?? id) : "";

  const build = (base: {
    id: string;
    name: string;
    regionId: string | null;
    regionName: string;
    row: number | null;
    col: number | null;
    isBridge: boolean;
  }): ReportTarget => {
    const meta = completionMeta[base.id];
    // Only ever called for a completed target, so proof attached to something still in
    // progress never reaches the report — it is a completion record, not a scrapbook.
    const proofs = proofsFor(state.proofs, base.id);
    const isFreeSpace = base.id === FREE_SPACE;
    return {
      ...base,
      completedAt: meta?.completedAt ?? null,
      recordedByName: nameOf(meta?.completedBy),
      proofs,
      // The Free Space is complete by definition and has no screenshot to take, so
      // flagging it would leave the missing-proof count permanently wrong by one.
      missingProof: !isFreeSpace && !proofs.length,
      isFreeSpace,
    };
  };

  const unlocked = unlockedRegions(state.done, bridges);

  const reportRegions: ReportRegion[] = regions.map((r) => {
    const stats = regionStats(r, state.done);
    const done = r.tiles
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => isDone(state.done, t.id))
      .map(({ t, i }) =>
        build({
          id: t.id,
          name: t.n,
          regionId: r.id,
          regionName: r.name,
          row: Math.floor(i / 3) + 1,
          col: (i % 3) + 1,
          isBridge: false,
        }),
      );
    return {
      id: r.id,
      name: r.name,
      unlocked: unlocked.has(r.id),
      stats,
      done,
      remaining: r.tiles.length - stats.count,
    };
  });

  // Bridges score nothing and belong to no region, so they never appear inside a
  // region's list — they open regions, and the report says so out loud.
  const reportBridges: ReportTarget[] = bridges
    .filter((b) => isDone(state.done, b.id))
    .map((b) =>
      build({
        id: b.id,
        name: bridgeLabel(b),
        regionId: null,
        regionName: bridgeJoins(b),
        row: null,
        col: null,
        isBridge: true,
      }),
    );

  const everyDone = [...reportRegions.flatMap((r) => r.done), ...reportBridges];

  return {
    score: scoreOf(state.done, regions),
    regions: reportRegions,
    bridges: reportBridges,
    totals: {
      tilesDone: reportRegions.reduce((n, r) => n + r.stats.count, 0),
      tilesTotal: allTiles(regions).length,
      bridgesDone: reportBridges.length,
      bridgesTotal: bridges.length,
      regionsUnlocked: regions.filter((r) => unlocked.has(r.id)).length,
      regionsTotal: regions.length,
      regionsBlackedOut: reportRegions.filter((r) => r.stats.blackout).length,
      proofCount: everyDone.reduce((n, t) => n + t.proofs.length, 0),
      missingProof: everyDone.filter((t) => t.missingProof).length,
      pointsCheck: reportRegions.reduce((n, r) => n + r.stats.points, 0),
    },
  };
}
