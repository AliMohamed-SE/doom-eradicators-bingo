import { describe, it, expect } from "vitest";
import {
  cleanContribRows,
  contribSum,
  cleanItemOwnerRows,
  applyItemOwners,
  CONTRIB_MAX_ROWS,
} from "./contrib";

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const C = "cccccccc-0000-4000-8000-000000000003";
const GONE = "dddddddd-0000-4000-8000-000000000004";
const IDS = [A, B, C];

describe("cleanContribRows", () => {
  it("keeps a plain split", () => {
    const rows = cleanContribRows(
      [
        { playerId: A, count: 10 },
        { playerId: B, count: 20 },
        { playerId: C, count: 20 },
      ],
      50,
      IDS,
    );
    expect(rows).toEqual([
      { playerId: A, count: 10 },
      { playerId: B, count: 20 },
      { playerId: C, count: 20 },
    ]);
    expect(contribSum(rows)).toBe(50);
  });

  it("drops zeroes, so nobody is listed as having done nothing", () => {
    expect(cleanContribRows([{ playerId: A, count: 0 }], 50, IDS)).toEqual([]);
  });

  it("clamps to the goal and to zero", () => {
    expect(cleanContribRows([{ playerId: A, count: 999 }], 50, IDS)).toEqual([
      { playerId: A, count: 50 },
    ]);
    expect(cleanContribRows([{ playerId: A, count: -5 }], 50, IDS)).toEqual([]);
  });

  /*
   * tile_progress.count is `int check (count >= 0)`, so a float is a failed write
   * rather than a rounded one. Truncating here is what keeps the save succeeding.
   */
  it("truncates a non-integer instead of failing the write", () => {
    expect(cleanContribRows([{ playerId: A, count: 3.7 }], 50, IDS)).toEqual([
      { playerId: A, count: 3 },
    ]);
  });

  it("rejects players who aren't on the roster", () => {
    expect(cleanContribRows([{ playerId: GONE, count: 5 }], 50, IDS)).toEqual([]);
  });

  it("ignores anything that isn't a usable row", () => {
    expect(
      cleanContribRows(
        [null, "x", 7, {}, { playerId: A }, { playerId: A, count: "5" }, { count: 5 }],
        50,
        IDS,
      ),
    ).toEqual([]);
    expect(cleanContribRows([{ playerId: A, count: NaN }], 50, IDS)).toEqual([]);
    expect(cleanContribRows("not an array", 50, IDS)).toEqual([]);
  });

  it("keeps the last of a duplicated player", () => {
    expect(
      cleanContribRows(
        [
          { playerId: A, count: 5 },
          { playerId: A, count: 9 },
        ],
        50,
        IDS,
      ),
    ).toEqual([{ playerId: A, count: 9 }]);
  });

  it("bounds the payload", () => {
    const many = Array.from({ length: CONTRIB_MAX_ROWS + 20 }, () => ({
      playerId: A,
      count: 1,
    }));
    expect(cleanContribRows(many, 50, IDS)).toEqual([{ playerId: A, count: 1 }]);
  });
});

/*
 * A party target — one run by a fixed group, "Complete a Theatre of Blood 5-man" —
 * is stored as one apiece, and its goal is 1 because the goal only says whether the
 * run happened. That combination has to survive the clamp, or the leader editor's
 * "who was in the group" list could credit exactly one of the five.
 */
describe("a party target's one-apiece rows", () => {
  it("keeps every member at 1 against a goal of 1", () => {
    const rows = cleanContribRows(
      IDS.map((playerId) => ({ playerId, count: 1 })),
      1,
      IDS,
    );
    expect(rows).toEqual([
      { playerId: A, count: 1 },
      { playerId: B, count: 1 },
      { playerId: C, count: 1 },
    ]);
    // Which is over the goal, and that is the correct answer rather than an error:
    // completion is total >= goal (reachesGoal), so the run reads as done.
    expect(contribSum(rows)).toBe(3);
  });
});

describe("cleanItemOwnerRows", () => {
  const KEYS = ["prim", "pegasian", "eternal"];

  it("gives each crystal to a different person, in board order", () => {
    expect(
      cleanItemOwnerRows(
        [
          { itemKey: "eternal", playerId: C },
          { itemKey: "prim", playerId: A },
          { itemKey: "pegasian", playerId: B },
        ],
        KEYS,
        IDS,
      ),
    ).toEqual([
      { itemKey: "prim", playerId: A },
      { itemKey: "pegasian", playerId: B },
      { itemKey: "eternal", playerId: C },
    ]);
  });

  it("drops keys the tile doesn't have", () => {
    expect(cleanItemOwnerRows([{ itemKey: "made_up", playerId: A }], KEYS, IDS)).toEqual([]);
  });

  /*
   * Not dropped: a box owned by someone who has since left the roster still has to
   * be clearable, and "clear it" is exactly a null owner.
   */
  it("turns an unknown owner into nobody rather than skipping the row", () => {
    expect(cleanItemOwnerRows([{ itemKey: "prim", playerId: GONE }], KEYS, IDS)).toEqual([
      { itemKey: "prim", playerId: null },
    ]);
    expect(cleanItemOwnerRows([{ itemKey: "prim", playerId: null }], KEYS, IDS)).toEqual([
      { itemKey: "prim", playerId: null },
    ]);
  });

  it("keeps the last of a duplicated key", () => {
    expect(
      cleanItemOwnerRows(
        [
          { itemKey: "prim", playerId: A },
          { itemKey: "prim", playerId: B },
        ],
        KEYS,
        IDS,
      ),
    ).toEqual([{ itemKey: "prim", playerId: B }]);
  });

  it("ignores junk", () => {
    expect(cleanItemOwnerRows([null, 3, {}, { playerId: A }], KEYS, IDS)).toEqual([]);
    expect(cleanItemOwnerRows(undefined, KEYS, IDS)).toEqual([]);
  });
});

describe("applyItemOwners", () => {
  it("reports both sides of a reassignment", () => {
    const { owners, touched } = applyItemOwners({ prim: A }, [{ itemKey: "prim", playerId: B }]);
    expect(owners).toEqual({ prim: B });
    expect(touched.sort()).toEqual([A, B].sort());
  });

  it("reports the old owner when a box is cleared", () => {
    const { owners, touched } = applyItemOwners({ prim: A, eternal: B }, [
      { itemKey: "prim", playerId: null },
    ]);
    expect(owners).toEqual({ eternal: B });
    expect(touched).toEqual([A]);
  });

  it("reports the new owner when an empty box is filled", () => {
    const { owners, touched } = applyItemOwners({}, [{ itemKey: "prim", playerId: A }]);
    expect(owners).toEqual({ prim: A });
    expect(touched).toEqual([A]);
  });

  it("treats a no-op edit as touching nobody", () => {
    const { owners, touched } = applyItemOwners({ prim: A }, [{ itemKey: "prim", playerId: A }]);
    expect(owners).toEqual({ prim: A });
    expect(touched).toEqual([]);
  });

  it("leaves keys the edit didn't mention alone", () => {
    const { owners } = applyItemOwners({ prim: A, eternal: C }, [
      { itemKey: "prim", playerId: B },
    ]);
    expect(owners).toEqual({ prim: B, eternal: C });
  });

  it("counts a three-way shuffle once per person", () => {
    const { owners, touched } = applyItemOwners({ prim: A, pegasian: A, eternal: A }, [
      { itemKey: "prim", playerId: A },
      { itemKey: "pegasian", playerId: B },
      { itemKey: "eternal", playerId: C },
    ]);
    expect(owners).toEqual({ prim: A, pegasian: B, eternal: C });
    expect(touched.sort()).toEqual([A, B, C].sort());
  });
});
