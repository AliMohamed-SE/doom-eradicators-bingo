import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { REGIONS, BRIDGES, FREE_SPACE, TILE_TRACKING } from "./board-data";
import {
  goalOf,
  progressSpec,
  completionAfter,
  assignLegacyItems,
  tickCredit,
  itemOwners,
  allTiles,
  fmtCompact,
  progressTotal,
  contributors,
  reachesGoal,
  scoreOf,
  regionStats,
  regionFullyDone,
  regionUnlocked,
  tileState,
  tileRuleList,
  intentCounts,
  intentBar,
  intentPlayers,
  fmtHrs,
  fmtNum,
  infoFor,
  regionEstimate,
  findTarget,
  bridgesForRegion,
  bridgeOther,
  bridgeSideFrom,
  bridgePrereq,
  bridgeStatus,
  unlockedRegions,
  fastestWayIn,
  regionCell,
  bridgePlacement,
  regionPlacement,
  type EventState,
  type Target,
} from "./scoring";

const region = (id: string) => REGIONS.find((r) => r.id === id)!;
const target = (id: string): Target => {
  const t = findTarget(id);
  if (!t) throw new Error(`no target ${id}`);
  return t;
};

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

describe("goalOf", () => {
  it("reads the leading Nx number when nothing overrides it", () => {
    expect(goalOf({ o: "Get 3x Masori from TOA" })).toBe(3);
    expect(goalOf({ o: "Get 10x Chewed Bones" })).toBe(10);
    expect(goalOf({ o: "Complete 50x Hunter Rumours" })).toBe(50);
  });
  it("defaults to 1 when there is no Nx", () => {
    expect(goalOf({ o: "Get a Beef pet" })).toBe(1);
  });

  it("counts the named items, whatever the prose says", () => {
    // "Get each Cerberus boot crystal" parses to 1; there are three crystals.
    expect(goalOf(target("clifford_s_revenge"))).toBe(3);
    expect(goalOf(target("evil_ass_task"))).toBe(4);
    // The prose says "Complete 1x Full Barrows Set" and means four pieces.
    expect(goalOf(target("me_and_my_brothers"))).toBe(4);
    // Two crowns; the battlestaff is a shop item, not part of the grind.
    expect(goalOf(target("cold_and_spicy"))).toBe(2);
  });

  it("leaves the prose alone for tiles that just want N of something", () => {
    // Any pieces will do on these, so the number in the objective is the goal and
    // there is nothing to tick.
    expect(goalOf(target("abyssal_cryer"))).toBe(3);
    expect(goalOf(target("teletubby_sun"))).toBe(3);
    expect(goalOf(target("yamama"))).toBe(2);
    expect(goalOf(target("i_hate_the_wildy"))).toBe(2);
    expect(goalOf(target("rip_wetfrog"))).toBe(3);
    expect(goalOf(target("araxxxxxxxxor"))).toBe(3);
    // Plug Prepper is one finished wand, not four rooms of progress.
    expect(goalOf(target("plug_prepper"))).toBe(1);
  });

  it("takes the throughput target over the prose", () => {
    expect(goalOf(target("astral_projection"))).toBe(10000);
    expect(goalOf(target("monkey_business"))).toBe(500);
  });

  it("does not count alt boxes toward the goal", () => {
    // Three Masori pieces, or one Shadow — still a goal of 3.
    expect(goalOf(target("masori_chaps_mia"))).toBe(3);
    // Three indistinguishable fire capes, with an infernal cape as the alt.
    expect(goalOf(target("bridge_cheese_and_fire"))).toBe(3);
  });

  /*
   * The guard that would have caught commit 96de884, which changed Lord of the
   * Rings from "Get all unique DK rings" to "Get 4x unique DK rings" and silently
   * moved its goal from 1 to 4 in production. Any prose edit that shifts a goal now
   * fails here instead of quietly re-deriving completion on the live board.
   */
  it("pins every target's goal so a content edit cannot move one silently", () => {
    const goals: Record<string, number> = {};
    for (const t of allTiles()) goals[t.id] = goalOf(t);
    for (const b of BRIDGES) goals[b.id] = goalOf(b);
    expect(goals).toEqual({
      return_the_sceptre: 2,
      kq_pee_yew: 1,
      thread_the_needle: 1,
      my_snake_is_bigger: 1,
      budget_150_s: 1,
      plug_prepper: 1,
      masori_chaps_mia: 3,
      temp_tome_time: 1,
      three_finger_death_punch: 3,
      saint_shard: 1,
      brine_time: 3,
      turn_to_stone: 1,
      axe_enthusiast: 5,
      vorkath_veteran: 1,
      duke_destroyer: 1,
      astral_projection: 10000,
      lord_of_the_rings: 4,
      return_of_the_money_dragon: 1,
      eye_of_the_occult: 1,
      monkey_business_3: 3,
      curved_to_the_left: 1,
      kraken_me_up: 5,
      i_m_huffin_that_shit: 1,
      monkey_business: 500,
      monkey_business_2: 2,
      evil_ass_task: 4,
      just_a_nibble: 10,
      dread_it_run_from_it: 1,
      the_cm_experience: 1,
      the_cold_of_the_todt: 1,
      yamama: 2,
      big_cox: 1,
      where_s_your_maul: 1,
      eeeeek: 1,
      to_all_the_irons: 1,
      missing_my_top: 1,
      we_have_the_beef: 1,
      the_nex_tile: 1,
      clifford_s_revenge: 3,
      whispered: 1,
      free_space: 1,
      rune_reaper: 1,
      godwars_general: 3,
      abyssal_cryer: 3,
      cold_and_spicy: 2,
      bleed_me_dry: 1,
      temu_salamander: 1,
      blood_moon_rises: 4,
      teletubby_sun: 3,
      sol_creditt: 1,
      i_ve_heard_something: 50,
      temolties: 1,
      the_magic_wand: 1,
      rip_wetfrog: 3,
      justmi: 3,
      its_bis_now: 1,
      agility_time: 1,
      me_and_my_brothers: 4,
      the_416_special: 1,
      bloody_bad_time: 4,
      my_personal_nightmare: 1,
      araxxxxxxxxor: 3,
      masks_off: 3,
      i_m_hooked: 2,
      i_m_blasted: 2,
      rock_solid: 1,
      paint_me: 1,
      jubbly_master: 1,
      tore_a_tendon: 1,
      gryphon_gryphoff: 1,
      piece_of_sheet: 10,
      its_was_this_big: 1,
      killing_the_ghosts: 1,
      wardn_t_you_believe_it: 3,
      chaos_chaos: 1,
      respect_your_elders: 3,
      corporeal_challenge: 1,
      i_hate_the_wildy: 2,
      korasi_killer: 1,
      pick_me: 2,
      upgrade: 1,
      bridge_lil_champion: 1,
      bridge_big_champion: 1,
      bridge_obsidian_breaker: 1,
      bridge_traditional_start: 1,
      bridge_maggot_monarch: 1,
      bridge_m_lady: 1,
      bridge_rangers_when: 1,
      bridge_south_west_unknown: 1,
      bridge_cheese_and_fire: 3,
      bridge_we_love_them: 1,
      bridge_south_unknown: 1,
      bridge_deep_south_unknown: 1,
    });
  });
});

describe("progressSpec", () => {
  it("picks checklist when the objective names its parts", () => {
    const s = progressSpec(target("clifford_s_revenge"));
    expect(s.mode).toBe("checklist");
    expect(s.items.map((i) => i.k)).toEqual(["primordial", "pegasian", "eternal"]);
  });

  it("picks bulk for anything worth typing a number into", () => {
    expect(progressSpec(target("astral_projection"))).toMatchObject({
      mode: "bulk",
      goal: 10000,
      unit: "astral runes",
      quick: [100, 1000],
    });
    expect(progressSpec(target("monkey_business"))).toMatchObject({ mode: "bulk", quick: [10, 50] });
    // 10 is the threshold, so these tip over into bulk too
    expect(progressSpec(target("just_a_nibble"))).toMatchObject({ mode: "bulk", goal: 10 });
    expect(progressSpec(target("piece_of_sheet")).mode).toBe("bulk");
  });

  it("leaves N-of-the-same-thing tiles as plain counters", () => {
    expect(progressSpec(target("masks_off")).mode).toBe("count");
    expect(progressSpec(target("axe_enthusiast")).mode).toBe("count");
    expect(progressSpec(target("blood_moon_rises")).mode).toBe("count");
    expect(progressSpec(target(FREE_SPACE)).mode).toBe("count");
  });

  it("keeps every N-pieces tile a counter, alt box or not", () => {
    for (const id of [
      "abyssal_cryer",
      "teletubby_sun",
      "yamama",
      "i_hate_the_wildy",
      "rip_wetfrog",
      "araxxxxxxxxor",
      "plug_prepper",
      "masori_chaps_mia",
      "justmi",
    ]) {
      expect(progressSpec(target(id)).mode, id).toBe("count");
    }
  });

  it("carries an alt box on a counter tile", () => {
    // Three fire capes are indistinguishable, so the tile counts — but one
    // infernal cape finishes it outright.
    const cape = progressSpec(target("bridge_cheese_and_fire"));
    expect(cape.mode).toBe("count");
    expect(cape.goal).toBe(3);
    expect(cape.alt.map((a) => a.k)).toEqual(["infernal"]);
    // Same shape: 3 Masori pieces, or one Shadow.
    expect(progressSpec(target("masori_chaps_mia")).alt.map((a) => a.k)).toEqual(["shadow"]);
    expect(progressSpec(target("justmi")).alt.map((a) => a.k)).toEqual(["scythe"]);
  });

  it("asks for a shared note only where the boxes need one", () => {
    // Four Barrows pieces mean nothing unless everyone agrees which brother.
    expect(progressSpec(target("me_and_my_brothers")).note?.label).toBe("WHICH SET");
    expect(progressSpec(target("clifford_s_revenge")).note).toBeNull();
    expect(progressSpec(target("masks_off")).note).toBeNull();
  });
});

/*
 * TILE_TRACKING is hand-written and its keys are database primary keys, so this is
 * where a typo has to be caught — a bad tile id renders nothing and a bad item key
 * writes a row nothing can clear.
 */
describe("TILE_TRACKING integrity", () => {
  it("keys a real target every time", () => {
    for (const id of Object.keys(TILE_TRACKING)) {
      expect(findTarget(id), `no target ${id}`).not.toBeNull();
    }
  });

  it("uses safe, unique item keys within each target", () => {
    for (const [id, track] of Object.entries(TILE_TRACKING)) {
      const keys = [...(track.items ?? []), ...(track.alt ?? [])].map((i) => i.k);
      expect(keys.length, `${id} has no boxes at all`).toBeGreaterThan(0);
      for (const k of keys) expect(k, `${id}.${k}`).toMatch(/^[a-z0-9_]+$/);
      expect(new Set(keys).size, `${id} repeats an item key`).toBe(keys.length);
    }
  });

  it("gives every checklist tile at least two boxes", () => {
    // One box would just be a 0/1 counter wearing a tick.
    for (const [id, track] of Object.entries(TILE_TRACKING)) {
      if (!track.items) continue;
      expect(track.items.length, `${id} has too few items`).toBeGreaterThan(1);
    }
  });

  it("leaves the free space alone", () => {
    expect(TILE_TRACKING[FREE_SPACE]).toBeUndefined();
  });
});

describe("completionAfter", () => {
  it("completes on reaching the goal", () => {
    expect(completionAfter(false, 3, 3)).toBe(true);
    expect(completionAfter(false, 2, 3)).toBe(false);
  });

  it("keeps a completion recorded at an older, lower goal", () => {
    // The migration case: finished at 1/1, goal later raised to 4. Un-completing
    // here would delete a bridge prereq and re-lock a whole region.
    expect(completionAfter(true, 1, 4)).toBe(true);
    expect(completionAfter(true, 0, 10000)).toBe(true);
  });
});

describe("checklist items", () => {
  const masori = target("masori_chaps_mia");

  it("reads owners for a target and nothing for an untouched one", () => {
    const items = { masori_chaps_mia: { mask: "a", body: "b" } };
    expect(itemOwners(items, "masori_chaps_mia")).toEqual({ mask: "a", body: "b" });
    expect(itemOwners(items, "clifford_s_revenge")).toEqual({});
  });

  it("credits one per item and the whole goal for an alt", () => {
    expect(tickCredit(masori, { mask: "a", body: "a", chaps: "b" }, "a")).toBe(2);
    expect(tickCredit(masori, { shadow: "a" }, "a")).toBe(3);
    // an alt plus a piece still resolves, it just overshoots
    expect(tickCredit(masori, { shadow: "a", mask: "a" }, "a")).toBe(4);
    expect(tickCredit(masori, { mask: "b" }, "a")).toBe(0);
  });

  it("credits everyone's ticks when no player is named", () => {
    expect(tickCredit(masori, { mask: "a", body: "b", chaps: "c" })).toBe(3);
    expect(tickCredit(masori, {})).toBe(0);
  });
});

/*
 * The 0004 migration has to name every item key and goal in SQL, because it has to
 * resolve player ids at run time — so the same facts exist twice. Rather than
 * generate the SQL (and have the generator rot), assert the two agree. This is the
 * guard that catches an item added to TILE_TRACKING without the backfill learning
 * about it.
 */
describe("migration 0004 agrees with the code", () => {
  const sql = readFileSync(
    new URL("../supabase/migrations/0004_tile_items.sql", import.meta.url),
    "utf8",
  );
  const block = (header: string) => {
    const start = sql.indexOf(header);
    expect(start, `missing "${header}" in 0004`).toBeGreaterThan(-1);
    const end = sql.indexOf("\n)", start);
    return sql.slice(start, end);
  };

  it("tops up exactly the targets whose goal is not in their objective text", () => {
    const rows = [...block("with goals(tile_id, goal) as (values").matchAll(
      /\('([a-z0-9_]+)',\s*(\d+)\)/g,
    )];
    const inSql = Object.fromEntries(rows.map((m) => [m[1], Number(m[2])]));

    const expected: Record<string, number> = {};
    for (const t of [...allTiles(), ...BRIDGES]) {
      if (TILE_TRACKING[t.id] || t.i?.hr) expected[t.id] = goalOf(t);
    }
    expect(inSql).toEqual(expected);
  });

  it("backfills every checklist box, in declaration order", () => {
    const rows = [...block("with keys(tile_id, ord, item_key) as (values").matchAll(
      /\('([a-z0-9_]+)',\s*(\d+),\s*'([a-z0-9_]+)'\)/g,
    )];
    const inSql = rows.map((m) => `${m[1]}:${m[2]}:${m[3]}`);

    // `alt` boxes are deliberately absent: a legacy count of 3 on Masori could have
    // been three pieces or one Shadow, and the three pieces are the honest guess.
    const expected: string[] = [];
    for (const [id, track] of Object.entries(TILE_TRACKING)) {
      (track.items ?? []).forEach((item, i) => expected.push(`${id}:${i + 1}:${item.k}`));
    }
    expect(inSql.slice().sort()).toEqual(expected.slice().sort());
  });
});

describe("assignLegacyItems", () => {
  const keys = ["primordial", "pegasian", "eternal"];

  it("gives one contributor as many boxes as they logged", () => {
    expect(assignLegacyItems([{ playerId: "a", count: 2 }], keys)).toEqual([
      { itemKey: "primordial", playerId: "a" },
      { itemKey: "pegasian", playerId: "a" },
    ]);
  });

  it("shares them out biggest-first, in declaration order", () => {
    expect(
      assignLegacyItems([{ playerId: "a", count: 2 }, { playerId: "b", count: 1 }], keys),
    ).toEqual([
      { itemKey: "primordial", playerId: "a" },
      { itemKey: "pegasian", playerId: "a" },
      { itemKey: "eternal", playerId: "b" },
    ]);
  });

  it("stops at the last box when the old count overshoots", () => {
    expect(assignLegacyItems([{ playerId: "a", count: 5 }], keys)).toHaveLength(3);
  });

  it("does nothing with no contributors", () => {
    expect(assignLegacyItems([], keys)).toEqual([]);
  });
});

describe("progress", () => {
  it("sums every player's contribution", () => {
    const progress = { kraken_me_up: { a: 2, b: 3 } };
    expect(progressTotal(progress, "kraken_me_up")).toBe(5);
    expect(progressTotal(progress, "nope")).toBe(0);
  });
  it("orders contributors by count desc, dropping zeros", () => {
    const progress = { t: { a: 1, b: 4, c: 0 } };
    expect(contributors(progress, "t")).toEqual([
      { playerId: "b", count: 4 },
      { playerId: "a", count: 1 },
    ]);
  });
  it("reachesGoal is inclusive", () => {
    expect(reachesGoal(2, 3)).toBe(false);
    expect(reachesGoal(3, 3)).toBe(true);
    expect(reachesGoal(4, 3)).toBe(true);
  });
});

describe("scoreOf", () => {
  it("is 0 on an empty board (free space alone scores nothing)", () => {
    expect(scoreOf(new Set())).toEqual({ rows: 0, cols: 0, mids: 0, blackouts: 0, total: 0 });
  });

  it("a non-central blackout is worth 40 (3 rows + 3 cols + middle + blackout)", () => {
    const done = new Set(region("north").tiles.map((t) => t.id));
    const s = scoreOf(done);
    expect(s).toEqual({ rows: 15, cols: 15, mids: 3, blackouts: 7, total: 40 });
  });

  it("central blackout is 37 — the Free Space middle awards no 3-point bonus", () => {
    // free_space is implicitly done, so only the other 8 need marking.
    const done = new Set(
      region("central").tiles.map((t) => t.id).filter((id) => id !== FREE_SPACE),
    );
    const s = scoreOf(done);
    expect(s).toEqual({ rows: 15, cols: 15, mids: 0, blackouts: 7, total: 37 });
  });

  it("scores a single completed row as 5", () => {
    const r = region("north");
    const done = new Set([r.tiles[0].id, r.tiles[1].id, r.tiles[2].id]);
    expect(scoreOf(done)).toMatchObject({ rows: 5, cols: 0, mids: 0, blackouts: 0, total: 5 });
  });

  it("awards the middle bonus for a completed non-free middle tile", () => {
    const r = region("north");
    const done = new Set([r.tiles[4].id]);
    expect(scoreOf(done)).toMatchObject({ mids: 3, total: 3 });
  });
});

describe("regionStats", () => {
  it("tracks counts and blackout", () => {
    const r = region("north");
    const done = new Set(r.tiles.map((t) => t.id));
    const st = regionStats(r, done);
    expect(st).toEqual({ count: 9, rows: 3, cols: 3, mid: true, blackout: true, points: 40 });
    expect(regionFullyDone(r, done)).toBe(true);
  });
  it("central middle never counts as a mid", () => {
    const r = region("central");
    const done = new Set(r.tiles.map((t) => t.id).filter((id) => id !== FREE_SPACE));
    expect(regionStats(r, done).mid).toBe(false);
    expect(regionStats(r, done).points).toBe(37);
  });
});

describe("bridge geometry", () => {
  it("gives every region a bridge on each border it actually has", () => {
    // Corners touch two neighbours, edges three, the centre four.
    expect(bridgesForRegion("north_west").length).toBe(2);
    expect(bridgesForRegion("north").length).toBe(3);
    expect(bridgesForRegion("central").length).toBe(4);
    expect(bridgesForRegion("south_east").length).toBe(2);
    // 12 borders on a 3x3 grid, each with exactly one bridge.
    expect(BRIDGES.length).toBe(12);
    expect(new Set(BRIDGES.map((b) => b.id)).size).toBe(12);
    expect(new Set(BRIDGES.map((b) => [...b.between].sort().join("|"))).size).toBe(12);
  });

  it("only ever joins adjacent regions", () => {
    for (const b of BRIDGES) {
      const a = regionCell(b.between[0])!;
      const c = regionCell(b.between[1])!;
      expect(Math.abs(a.row - c.row) + Math.abs(a.col - c.col)).toBe(1);
    }
  });

  it("reads the same border from both ends", () => {
    const b = BRIDGES.find((x) => x.id === "bridge_big_champion")!;
    expect(bridgeOther(b, "north")).toBe("north_east");
    expect(bridgeOther(b, "north_east")).toBe("north");
    expect(bridgeSideFrom(b, "north")).toBe("east");
    expect(bridgeSideFrom(b, "north_east")).toBe("west");
    expect(bridgeOther(b, "central")).toBeNull();
  });

  it("derives the prereq as the tile facing the bridge on each side", () => {
    const maggot = BRIDGES.find((x) => x.id === "bridge_maggot_monarch")!;
    // north_east sits above east, so its bottom-middle tile faces the bridge.
    expect(bridgePrereq(maggot, "north_east")).toBe("evil_ass_task");
    expect(bridgePrereq(maggot, "east")).toBe(REGIONS.find((r) => r.id === "east")!.tiles[1].id);
    const mlady = BRIDGES.find((x) => x.id === "bridge_m_lady")!;
    // west sits left of central, so central's middle-left tile faces the bridge.
    expect(bridgePrereq(mlady, "central")).toBe("whispered");
    expect(bridgePrereq(mlady, "west")).toBe(REGIONS.find((r) => r.id === "west")!.tiles[5].id);
  });
});

describe("board map placement", () => {
  it("puts every bridge in the gutter between the two panels it joins", () => {
    const seen = new Map<string, string>();
    for (const b of BRIDGES) {
      const place = bridgePlacement(b)!;
      const ends = b.between.map((id) => regionPlacement(id)!);
      // Odd tracks hold regions, even tracks are the gutters — a bridge must sit
      // on exactly one even track, and between its two regions on the other axis.
      const onGutterRow = place.gridRow % 2 === 0;
      const onGutterCol = place.gridColumn % 2 === 0;
      expect(onGutterRow !== onGutterCol).toBe(true);
      expect(place.upright).toBe(onGutterCol);
      if (place.upright) {
        expect(place.gridRow).toBe(ends[0].gridRow);
        expect(place.gridRow).toBe(ends[1].gridRow);
        expect(place.gridColumn).toBe((ends[0].gridColumn + ends[1].gridColumn) / 2);
      } else {
        expect(place.gridColumn).toBe(ends[0].gridColumn);
        expect(place.gridColumn).toBe(ends[1].gridColumn);
        expect(place.gridRow).toBe((ends[0].gridRow + ends[1].gridRow) / 2);
      }
      // and no two bridges may land in the same cell
      const key = place.gridRow + "," + place.gridColumn;
      expect(seen.get(key)).toBeUndefined();
      seen.set(key, b.id);
    }
    expect(seen.size).toBe(12);
  });

  it("never lands a bridge on a region's own cell", () => {
    const regionCells = new Set(REGIONS.map((r) => {
      const p = regionPlacement(r.id)!;
      return p.gridRow + "," + p.gridColumn;
    }));
    for (const b of BRIDGES) {
      const place = bridgePlacement(b)!;
      expect(regionCells.has(place.gridRow + "," + place.gridColumn)).toBe(false);
    }
  });
});

describe("regionUnlocked & tileState", () => {
  it("central is always unlocked; others need a bridge into them", () => {
    const done = new Set<string>();
    expect(regionUnlocked("central", done)).toBe(true);
    expect(regionUnlocked("west", done)).toBe(false);
    expect(regionUnlocked("west", new Set(["bridge_m_lady"]))).toBe(true);
  });

  it("unlocks across chained bridges, not just the ones touching central", () => {
    // central -> west (M'Lady) -> north_west (Obsidian Breaker), which touches
    // central on no border at all.
    const done = new Set(["bridge_m_lady", "bridge_obsidian_breaker"]);
    expect([...unlockedRegions(done)].sort()).toEqual(["central", "north_west", "west"]);
    expect(regionUnlocked("north_west", done)).toBe(true);
  });

  it("ignores a cleared bridge with neither end reachable", () => {
    expect(regionUnlocked("south_east", new Set(["bridge_deep_south_unknown"]))).toBe(false);
  });

  it("tiles in a locked region are locked", () => {
    const st = emptyState();
    expect(tileState(target("saint_shard"), st)).toBe("locked");
  });

  it("central tile is available, working with a claim, done when completed", () => {
    const tile = target("we_have_the_beef");
    expect(tileState(tile, emptyState())).toBe("available");
    expect(tileState(tile, emptyState({ claims: { we_have_the_beef: ["p1"] } }))).toBe("working");
    expect(tileState(tile, emptyState({ done: new Set(["we_have_the_beef"]) }))).toBe("done");
  });

  it("free_space is always done", () => {
    expect(tileState(target(FREE_SPACE), emptyState())).toBe("done");
  });

  it("a bridge is locked until an end is reachable and its facing tile is done", () => {
    const bridge = target("bridge_m_lady");
    // central is open from the start, but its middle-left tile is not done.
    expect(tileState(bridge, emptyState())).toBe("locked");
    expect(tileState(bridge, emptyState({ done: new Set(["whispered"]) }))).toBe("available");
  });

  it("gates a two-way bridge on the facing tile of whichever side is open", () => {
    const b = BRIDGES.find((x) => x.id === "bridge_obsidian_breaker")!;
    // Nothing reaches either end yet.
    expect(bridgeStatus(b, { done: new Set<string>() })).toBe("locked");
    // north_west sits above west, so from west the facing tile is its top-middle.
    const westFacing = REGIONS.find((r) => r.id === "west")!.tiles[1].id;
    const viaWest = new Set(["bridge_m_lady", westFacing]);
    expect(bridgeStatus(b, { done: viaWest })).toBe("available");
    // Coming from north_west instead, it is north_west's bottom-middle tile.
    const viaNorth = new Set(["bridge_lil_champion", "bridge_traditional_start", "temp_tome_time"]);
    expect(bridgeStatus(b, { done: viaNorth })).toBe("available");
  });

  it("calls a bridge redundant once both its regions are open anyway", () => {
    // central -> north and central -> west open both ends of nothing yet, but
    // reaching north_west from both sides makes the second crossing pointless.
    const done = new Set([
      "bridge_traditional_start",
      "bridge_m_lady",
      "bridge_obsidian_breaker",
    ]);
    expect(bridgeStatus(BRIDGES.find((x) => x.id === "bridge_lil_champion")!, { done })).toBe(
      "redundant",
    );
  });

  it("a mystery bridge stays locked even with its facing tile done", () => {
    const b = BRIDGES.find((x) => x.id === "bridge_south_west_unknown")!;
    const westFacing = REGIONS.find((r) => r.id === "west")!.tiles[7].id;
    expect(bridgeStatus(b, { done: new Set(["bridge_m_lady", westFacing]) })).toBe("locked");
  });
});

describe("fastestWayIn", () => {
  it("is null once the region is open", () => {
    expect(fastestWayIn("central", new Set())).toBeNull();
    expect(fastestWayIn("west", new Set(["bridge_m_lady"]))).toBeNull();
  });

  it("picks the cheapest bridge on any of the region's borders", () => {
    // Kebos & Kourend borders M'Lady (Crazy Arch, ~3h) and Obsidian Breaker
    // (TzHaar, ~13h). Neither is crossable yet — cost decides, not reachability.
    expect(fastestWayIn("west", new Set())?.id).toBe("bridge_m_lady");
    // north_west borders Obsidian Breaker (rated) and Lil Champion (no rate).
    expect(fastestWayIn("north_west", new Set())?.id).toBe("bridge_obsidian_breaker");
  });

  it("skips bridges that are already cleared", () => {
    const done = new Set(["bridge_obsidian_breaker"]);
    expect(fastestWayIn("north_west", done)?.id).toBe("bridge_lil_champion");
  });

  it("sorts a mystery bridge behind anything with an objective", () => {
    // east borders Maggot Monarch, Rangers when? and We love them — all named.
    expect(fastestWayIn("east", new Set())?.mystery).toBeUndefined();
    // Morytania has nothing but mystery bridges, so it still returns one.
    expect(fastestWayIn("south_west", new Set())?.mystery).toBe(1);
  });

  it("routes into south over Cheese and Fire, its only named border", () => {
    const named = bridgesForRegion("south").filter((b) => !b.mystery);
    expect(named.map((b) => b.id)).toEqual(["bridge_cheese_and_fire"]);
    expect(fastestWayIn("south", new Set())?.id).toBe("bridge_cheese_and_fire");
  });
});

describe("opening a region over any border", () => {
  it("accepts whichever bridge is cleared, north, east, south or west", () => {
    // Desert has two borders: Lil Champion (east, to Fremennik) and Obsidian
    // Breaker (south, to Kourend). Either one on its own opens it.
    for (const via of ["bridge_lil_champion", "bridge_obsidian_breaker"]) {
      const feeder = via === "bridge_lil_champion" ? "bridge_traditional_start" : "bridge_m_lady";
      expect(regionUnlocked("north_west", new Set([feeder, via]))).toBe(true);
    }
  });

  it("opens Misthlain's neighbours over any one of its four borders", () => {
    const byBorder: Record<string, string> = {
      north: "bridge_traditional_start",
      east: "bridge_rangers_when",
      south: "bridge_cheese_and_fire",
      west: "bridge_m_lady",
    };
    for (const [side, id] of Object.entries(byBorder)) {
      const b = BRIDGES.find((x) => x.id === id)!;
      expect(bridgeSideFrom(b, "central")).toBe(side);
      const opened = bridgeOther(b, "central")!;
      expect(regionUnlocked(opened, new Set([id]))).toBe(true);
      // and nothing else comes along for the ride
      expect([...unlockedRegions(new Set([id]))].sort()).toEqual(["central", opened].sort());
    }
  });
});

describe("tileRuleList", () => {
  it("returns [] for free_space", () => {
    expect(tileRuleList(FREE_SPACE)).toEqual([]);
  });

  it("appends the middle-challenge and challenge-screenshot rules for a middle challenge tile", () => {
    // budget_150_s is north_west index 4 and ch:1.
    const rules = tileRuleList("budget_150_s");
    expect(rules).toContain(
      "Middle challenge tile — worth 3 points, and it cannot be completed with a pet.",
    );
    expect(rules).toContain("Challenge tile: screenshot your gear / inventory beforehand.");
    // plus its one stored rule
    expect(rules.length).toBe(3);
  });

  it("keeps stored rules for a plain tile without deriving extras", () => {
    // me_and_my_brothers has 2 stored rules, not a middle, not a challenge.
    expect(tileRuleList("me_and_my_brothers")).toEqual([
      "Needs to be a complete set, full karils etc.",
      "You can prepot a barrows chest.",
    ]);
  });

  it("returns [] for a tile with no rules", () => {
    expect(tileRuleList("saint_shard")).toEqual([]);
  });
});

describe("intents", () => {
  const intents = { t: { a: "want", b: "want", c: "no" } } as EventState["intents"];
  it("counts by kind", () => {
    expect(intentCounts(intents, "t")).toEqual({ want: 2, ok: 0, no: 1, total: 3 });
    expect(intentCounts(intents, "none")).toEqual({ want: 0, ok: 0, no: 0, total: 0 });
  });
  it("lists players for a kind", () => {
    expect(intentPlayers(intents, "t", "want")).toEqual(["a", "b"]);
  });
  it("builds proportional bar widths", () => {
    const bar = intentBar(intents, "t");
    expect(bar.has).toBe(true);
    expect(bar.wantW).toBe((2 / 3) * 100 + "%");
    expect(intentBar(intents, "none").wantW).toBe("0%");
  });
});

describe("fmt helpers", () => {
  it("fmtNum groups thousands", () => {
    expect(fmtNum(1000)).toBe("1,000");
    expect(fmtNum(63.5)).toBe("64");
  });
  it("fmtCompact shortens the big bulk counts for a board cell", () => {
    expect(fmtCompact(0)).toBe("0");
    expect(fmtCompact(999)).toBe("999");
    expect(fmtCompact(1000)).toBe("1k");
    expect(fmtCompact(4000)).toBe("4k");
    expect(fmtCompact(1500)).toBe("1.5k");
    expect(fmtCompact(10000)).toBe("10k");
  });
  it("fmtHrs buckets by magnitude", () => {
    expect(fmtHrs(0)).toBe("—");
    expect(fmtHrs(-3)).toBe("—");
    expect(fmtHrs(0.5)).toBe("30 min");
    expect(fmtHrs(2.34)).toBe("2.3 h");
    expect(fmtHrs(42)).toBe("42 h");
    expect(fmtHrs(137)).toBe("135 h");
  });
});

describe("infoFor", () => {
  it("builds a drops estimate scaled by need", () => {
    const info = infoFor(target("return_the_sceptre"));
    expect(info.kind).toBe("drops");
    expect(info.need).toBe(2);
    expect(info.rows).toHaveLength(1);
    // 63.5 * 2 actions / 13 per hour
    expect(info.best).toBeCloseTo((63.5 * 2) / 13, 5);
    expect(info.conf?.label).toBe("WIKI RATE");
  });

  it("picks the fastest route as best", () => {
    const info = infoFor(target("turn_to_stone"));
    // on-task 1000/65 is faster than off-task 5000/65
    expect(info.best).toBeCloseTo(1000 / 65, 5);
    expect(info.bestName).toContain("on a Basilisk task");
  });

  it("uses a fixed estimate when provided", () => {
    const info = infoFor(target("plug_prepper"));
    expect(info.fixed).toBe(true);
    expect(info.best).toBe(14);
  });

  it("handles a throughput (hr) objective", () => {
    const info = infoFor(target("astral_projection"));
    expect(info.kind).toBe("rate");
    expect(info.best).toBeCloseTo(10000 / 1700, 5);
  });

  it("marks challenge tiles with no rate", () => {
    const info = infoFor(target("budget_150_s"));
    expect(info.kind).toBe("challenge");
    expect(info.best).toBeNull();
    expect(info.conf).toBeNull();
  });
});

describe("regionEstimate", () => {
  it("counts the bridge plus all open tiles when nothing is done", () => {
    const r = region("north_west");
    const est = regionEstimate(r, new Set());
    // 9 tiles + 1 bridge all open
    expect(est.left).toBe(10);
    expect(est.bridgeHours).toBeGreaterThan(0);
    // north_west has one challenge middle (budget_150_s)
    expect(est.challenges).toBe(1);
    expect(est.hours).toBeGreaterThan(0);
  });

  it("drops completed tiles from the tally", () => {
    const r = region("north_west");
    const done = new Set(r.tiles.map((t) => t.id).concat(["bridge_m_lady", "bridge_obsidian_breaker"]));
    const est = regionEstimate(r, done);
    expect(est.left).toBe(0);
    expect(est.hours).toBe(0);
  });
});
