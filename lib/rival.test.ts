import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  cleanRivalName,
  rivalDone,
  rivalMarkableIds,
  isRivalMarkable,
  compareState,
  compareCounts,
  compareBoards,
  RIVAL_NAME_MAX,
} from "./rival";
import { REGIONS, BRIDGES, FREE_SPACE } from "./board-data";
import { scoreOf } from "./scoring";

describe("cleanRivalName", () => {
  it("trims and keeps an ordinary name whole", () => {
    expect(cleanRivalName("  Celeris Red  ")).toBe("Celeris Red");
  });

  /*
   * The reason this collapses rather than only trims: the name is rendered into a
   * header, and a pasted two-line name would push the board down the page on every
   * device that reads it.
   */
  it("collapses inner whitespace, newlines and tabs to single spaces", () => {
    expect(cleanRivalName("Celeris\n\nRed")).toBe("Celeris Red");
    expect(cleanRivalName("Celeris\t  Red")).toBe("Celeris Red");
  });

  it("slices at the cap, which is also the SQL check constraint", () => {
    const long = "x".repeat(RIVAL_NAME_MAX + 40);
    expect(cleanRivalName(long)).toHaveLength(RIVAL_NAME_MAX);
  });

  it("returns '' for anything unusable — which both callers read as reject", () => {
    expect(cleanRivalName("")).toBe("");
    expect(cleanRivalName("   \n\t ")).toBe("");
    expect(cleanRivalName(null)).toBe("");
    expect(cleanRivalName(undefined)).toBe("");
    expect(cleanRivalName(42)).toBe("");
    expect(cleanRivalName({ name: "x" })).toBe("");
  });
});

describe("rivalDone", () => {
  it("is empty when tracking is off", () => {
    expect(rivalDone(null).size).toBe(0);
  });

  it("carries the marked ids", () => {
    const set = rivalDone({ name: "Them", doneIds: ["a", "b"], updatedAt: null });
    expect(set.has("a")).toBe(true);
    expect(set.has("c")).toBe(false);
  });
});

describe("rivalMarkableIds", () => {
  it("is every board tile except the free space", () => {
    const ids = rivalMarkableIds();
    const total = REGIONS.reduce((n, r) => n + r.tiles.length, 0);
    expect(ids).toHaveLength(total - 1);
    expect(ids).not.toContain(FREE_SPACE);
  });

  /*
   * Bridges score nothing and only gate OUR unlocks, so there is no such thing as
   * the rival "having" one. If a bridge ever became markable this is the test that
   * has to change first.
   */
  it("contains no bridges", () => {
    const ids = new Set(rivalMarkableIds());
    BRIDGES.forEach((b) => expect(ids.has(b.id)).toBe(false));
  });

  it("agrees with isRivalMarkable", () => {
    expect(isRivalMarkable(REGIONS[0].tiles[0].id)).toBe(true);
    expect(isRivalMarkable(FREE_SPACE)).toBe(false);
    expect(isRivalMarkable(BRIDGES[0].id)).toBe(false);
    expect(isRivalMarkable("not_a_tile")).toBe(false);
  });
});

describe("compareState", () => {
  const ours = new Set(["a", "shared"]);
  const theirs = new Set(["b", "shared"]);

  it("names all four cases", () => {
    expect(compareState(ours, theirs, "shared")).toBe("both");
    expect(compareState(ours, theirs, "a")).toBe("us");
    expect(compareState(ours, theirs, "b")).toBe("them");
    expect(compareState(ours, theirs, "nobody")).toBe("none");
  });

  /*
   * The free space is complete for every team by rule, not by effort — going
   * through isDone on BOTH sides is what stops it reading as a one-point lead for
   * whichever board happens to hold a row for it.
   */
  it("reads the free space as 'both' on two empty boards", () => {
    expect(compareState(new Set(), new Set(), FREE_SPACE)).toBe("both");
  });
});

describe("compareCounts", () => {
  it("totals every board tile exactly once", () => {
    const total = REGIONS.reduce((n, r) => n + r.tiles.length, 0);
    const c = compareCounts(new Set(), new Set());
    expect(c.total).toBe(total);
    expect(c.both + c.us + c.them + c.none).toBe(total);
  });

  it("puts two empty boards in 'none', bar the free space", () => {
    const c = compareCounts(new Set(), new Set());
    expect(c.both).toBe(1);
    expect(c.us).toBe(0);
    expect(c.them).toBe(0);
  });

  it("splits a tile we have and they do not", () => {
    const id = REGIONS[0].tiles[0].id;
    const c = compareCounts(new Set([id]), new Set());
    expect(c.us).toBe(1);
    expect(c.them).toBe(0);
  });

  it("is symmetric — swapping the boards swaps us and them", () => {
    const a = new Set([REGIONS[0].tiles[0].id, REGIONS[1].tiles[2].id]);
    const b = new Set([REGIONS[0].tiles[0].id, REGIONS[3].tiles[5].id]);
    const one = compareCounts(a, b);
    const other = compareCounts(b, a);
    expect(other.us).toBe(one.them);
    expect(other.them).toBe(one.us);
    expect(other.both).toBe(one.both);
    expect(other.none).toBe(one.none);
  });
});

describe("compareBoards", () => {
  /*
   * The whole reason the two totals are comparable: this is scoreOf, not a second
   * points rule that happens to agree with it today.
   */
  it("scores both sides with the event's own scoring rule", () => {
    const theirs = new Set(REGIONS[0].tiles.map((t) => t.id));
    const { us, them, lead } = compareBoards(new Set(), theirs);
    expect(us).toEqual(scoreOf(new Set()));
    expect(them).toEqual(scoreOf(theirs));
    expect(lead).toBe(us.total - them.total);
  });

  it("reports a negative lead when they are ahead", () => {
    const theirs = new Set(REGIONS[0].tiles.map((t) => t.id));
    expect(compareBoards(new Set(), theirs).lead).toBeLessThan(0);
  });

  it("is level on two identical boards", () => {
    const same = new Set(REGIONS[2].tiles.map((t) => t.id));
    const { lead, counts } = compareBoards(same, same);
    expect(lead).toBe(0);
    expect(counts.us).toBe(0);
    expect(counts.them).toBe(0);
  });
});

describe("migration 0008 agrees with the code", () => {
  const sql = readFileSync(
    new URL("../supabase/migrations/0008_rival_board.sql", import.meta.url),
    "utf8",
  );

  it("caps the name at the same length lib/rival.ts does", () => {
    expect(sql).toContain(`char_length(name) between 1 and ${RIVAL_NAME_MAX}`);
  });

  /*
   * The singleton and the cascade are the two structural promises this feature
   * rests on: one board only, and STOP TRACKING taking the marks with it in a
   * single statement (there is no transaction here to do it in two).
   */
  it("keeps rival_board a singleton", () => {
    expect(sql).toContain("id         boolean primary key default true check (id)");
  });

  it("cascades the marks off the board row", () => {
    expect(sql).toContain("references public.rival_board(id) on delete cascade");
  });

  /*
   * Both halves of the realtime wiring, the same trap lib/proof.test.ts guards for
   * tile_proofs: with the publication but no TABLES entry nothing ever live-updates;
   * with the TABLES entry but no publication, the same.
   */
  it("grants the select policies and joins the realtime publication", () => {
    expect(sql).toContain("for select using (true)");
    expect(sql).toContain("supabase_realtime");
  });

  it("is subscribed to by components/realtime.tsx", () => {
    // Read as text, not imported: realtime.tsx is a "use client" module that pulls
    // in next/navigation, which does not load under vitest's node environment.
    const rt = readFileSync(new URL("../components/realtime.tsx", import.meta.url), "utf8");
    expect(rt).toContain('"rival_board"');
    expect(rt).toContain('"rival_completions"');
  });
});
