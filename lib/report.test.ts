import { describe, it, expect } from "vitest";
import { REGIONS, BRIDGES, FREE_SPACE } from "./board-data";
import { allTiles, scoreOf, unlockedRegions, type EventState } from "./scoring";
import { buildReport, fmtDate } from "./report";
import type { CompletionMeta, PlayerRow } from "./types";
import type { ProofLink } from "./proof";

const region = (id: string) => REGIONS.find((r) => r.id === id)!;

const emptyState = (over: Partial<EventState> = {}): EventState => ({
  claims: {},
  progress: {},
  items: {},
  notes: {},
  proofs: {},
  done: new Set<string>(),
  intents: {},
  focusRegions: [],
  focusTiles: [],
  ...over,
});

const player = (id: string, name: string): PlayerRow => ({
  id,
  name,
  is_leader: false,
  rares: [],
  task: "",
  linked: true,
});

const PLAYERS = [player("p1", "Wetfrog1998"), player("p2", "JustAWeasel")];

const proof = (url: string, title = ""): ProofLink => ({ id: url, title, url, ord: 0 });

const report = (
  state: EventState,
  completionMeta: Record<string, CompletionMeta> = {},
  players: readonly PlayerRow[] = PLAYERS,
) => buildReport({ state, players, completionMeta });

/** Every tile id in a region, in board order. */
const idsOf = (id: string) => region(id).tiles.map((t) => t.id);

describe("points agree with scoreOf", () => {
  const cases: Array<[string, ReadonlySet<string>]> = [
    ["an empty board", new Set<string>()],
    ["one full row in central", new Set(idsOf("central").slice(0, 3))],
    ["a blackout in central", new Set(idsOf("central"))],
    ["a blackout in the desert", new Set(idsOf("north_west"))],
    ["everything done", new Set(allTiles().map((t) => t.id))],
  ];

  it.each(cases)("matches on %s", (_label, done) => {
    const m = report(emptyState({ done }));
    expect(m.totals.pointsCheck).toBe(m.score.total);
    expect(m.score.total).toBe(scoreOf(done).total);
  });

  /*
   * The whole-board number, pinned. 9 regions x (3 rows + 3 cols) at 5 = 270, plus 8
   * middles at 3 (central's is the Free Space, which never awards it) = 24, plus 9
   * blackouts at 7 = 63.
   */
  it("tops out at 357 with all 81 tiles done", () => {
    const done = new Set(allTiles().map((t) => t.id));
    const m = report(emptyState({ done }));
    expect(m.score).toEqual({ rows: 135, cols: 135, mids: 24, blackouts: 63, total: 357 });
    expect(m.totals.pointsCheck).toBe(357);
  });
});

describe("coverage of completed targets", () => {
  it("lists every completed target exactly once", () => {
    const done = new Set([
      ...idsOf("central").slice(0, 4),
      ...idsOf("north").slice(0, 2),
      "bridge_traditional_start",
      "bridge_lil_champion",
    ]);
    const m = report(emptyState({ done }));
    const listed = [...m.regions.flatMap((r) => r.done), ...m.bridges].map((t) => t.id);

    expect(new Set(listed).size).toBe(listed.length);
    // free_space is implicitly done, so it appears on top of what the set names
    expect(new Set(listed)).toEqual(new Set([...done, FREE_SPACE]));
  });

  it("keeps each region's completions in board order", () => {
    const done = new Set(allTiles().map((t) => t.id));
    const m = report(emptyState({ done }));
    expect(m.regions[0].id).toBe("north_west");
    m.regions.forEach((r) => {
      expect(r.done.map((t) => t.id)).toEqual(idsOf(r.id));
    });
  });

  it("counts the whole board and every bridge", () => {
    const m = report(emptyState());
    expect(m.totals.tilesTotal).toBe(allTiles().length);
    expect(m.totals.tilesTotal).toBe(81);
    expect(m.totals.bridgesTotal).toBe(BRIDGES.length);
    expect(m.totals.bridgesTotal).toBe(12);
  });

  it("reports grid positions so the row/column points can be audited", () => {
    const done = new Set(idsOf("central"));
    const m = report(emptyState({ done }));
    const central = m.regions.find((r) => r.id === "central")!;
    expect(central.done.map((t) => `R${t.row}C${t.col}`)).toEqual([
      "R1C1", "R1C2", "R1C3",
      "R2C1", "R2C2", "R2C3",
      "R3C1", "R3C2", "R3C3",
    ]);
  });

  it("agrees with unlockedRegions", () => {
    const done = new Set(["bridge_traditional_start"]);
    const m = report(emptyState({ done }));
    expect(m.totals.regionsUnlocked).toBe(unlockedRegions(done).size);
    expect(m.regions.filter((r) => r.unlocked).map((r) => r.id).sort()).toEqual(
      [...unlockedRegions(done)].sort(),
    );
  });
});

describe("the Free Space", () => {
  it("is listed as done in central without a date, and never flagged for proof", () => {
    const m = report(emptyState());
    const central = m.regions.find((r) => r.id === "central")!;
    const free = central.done.find((t) => t.id === FREE_SPACE);

    expect(free).toBeDefined();
    expect(free!.isFreeSpace).toBe(true);
    expect(free!.completedAt).toBeNull();
    expect(free!.missingProof).toBe(false);
    expect(m.totals.missingProof).toBe(0);
    // still counted, so the report agrees with isDone() and scoreOf()
    expect(central.stats.count).toBe(1);
    expect(m.totals.tilesDone).toBe(1);
  });
});

describe("bridges", () => {
  it("score nothing and sit outside every region", () => {
    const bare = report(emptyState());
    const withBridge = report(emptyState({ done: new Set(["bridge_traditional_start"]) }));

    expect(withBridge.score.total).toBe(bare.score.total);
    expect(withBridge.bridges.map((b) => b.id)).toEqual(["bridge_traditional_start"]);
    expect(withBridge.regions.flatMap((r) => r.done.map((t) => t.id))).not.toContain(
      "bridge_traditional_start",
    );
    expect(withBridge.bridges[0].isBridge).toBe(true);
    expect(withBridge.bridges[0].regionId).toBeNull();
    expect(withBridge.bridges[0].regionName).toContain("↔");
  });

  it("never prints a bare ??? for a mystery bridge", () => {
    const mystery = BRIDGES.find((b) => b.mystery)!;
    const m = report(emptyState({ done: new Set([mystery.id]) }));
    expect(m.bridges[0].name).not.toBe("???");
    expect(m.bridges[0].name).toBe("Mystery bridge");
  });
});

describe("proof", () => {
  const done = new Set([...idsOf("central").slice(0, 2), "bridge_traditional_start"]);
  const first = idsOf("central")[0];
  const second = idsOf("central")[1];

  it("flags exactly the completed targets with nothing attached", () => {
    const m = report(
      emptyState({
        done,
        proofs: { [first]: [proof("https://imgur.com/a/1", "Purple")] },
      }),
    );

    const flagged = [...m.regions.flatMap((r) => r.done), ...m.bridges]
      .filter((t) => t.missingProof)
      .map((t) => t.id);

    expect(m.totals.proofCount).toBe(1);
    expect(m.totals.missingProof).toBe(2);
    expect(flagged.sort()).toEqual([second, "bridge_traditional_start"].sort());
  });

  it("ignores proof attached to something still in progress", () => {
    const unfinished = idsOf("north")[0];
    const m = report(
      emptyState({ done, proofs: { [unfinished]: [proof("https://imgur.com/a/9")] } }),
    );
    expect(m.totals.proofCount).toBe(0);
    expect(m.totals.missingProof).toBe(3);
  });

  it("has nothing to flag on an untouched board", () => {
    const m = report(emptyState());
    expect(m.totals.missingProof).toBe(0);
    expect(m.totals.proofCount).toBe(0);
  });
});

describe("attribution", () => {
  const tile = idsOf("central")[0];

  it("resolves who recorded the completion to a name", () => {
    const m = report(emptyState({ done: new Set([tile]) }), {
      [tile]: { completedAt: null, completedBy: "p1" },
    });
    const t = m.regions.find((r) => r.id === "central")!.done.find((x) => x.id === tile)!;
    expect(t.recordedByName).toBe("Wetfrog1998");
  });

  it("leaves recordedByName empty when nothing was recorded", () => {
    const m = report(emptyState({ done: new Set([tile]) }));
    const t = m.regions.find((r) => r.id === "central")!.done.find((x) => x.id === tile)!;
    expect(t.recordedByName).toBe("");
  });

  it("falls back to the id for a player who is no longer on the roster", () => {
    const m = report(
      emptyState({ done: new Set([tile]) }),
      { [tile]: { completedAt: null, completedBy: "ghost" } },
    );
    const t = m.regions.find((r) => r.id === "central")!.done.find((x) => x.id === tile)!;
    expect(t.recordedByName).toBe("ghost");
  });

  it("carries the raw completion timestamp through unformatted", () => {
    const m = report(
      emptyState({ done: new Set([tile]) }),
      { [tile]: { completedAt: "2026-08-19T23:30:00Z", completedBy: "p1" } },
    );
    const t = m.regions.find((r) => r.id === "central")!.done.find((x) => x.id === tile)!;
    expect(t.completedAt).toBe("2026-08-19T23:30:00Z");
    expect(t.recordedByName).toBe("Wetfrog1998");
  });
});

describe("fmtDate", () => {
  /*
   * Pinned to UTC on purpose: 23:30Z on the 19th is the 20th in Sydney, and a report
   * that changes date depending on who opened it is not a record of anything.
   */
  it("is the same date whatever the reader's zone", () => {
    expect(fmtDate("2026-08-19T23:30:00Z")).toBe("19 Aug 2026");
    expect(fmtDate("2026-08-19T00:30:00Z")).toBe("19 Aug 2026");
  });

  it("says so plainly when there is no date", () => {
    expect(fmtDate(null)).toBe("no date recorded");
    expect(fmtDate(undefined)).toBe("no date recorded");
    expect(fmtDate("")).toBe("no date recorded");
    expect(fmtDate("not a date")).toBe("no date recorded");
  });
});
