import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import {
  REGIONS,
  BRIDGES,
  FREE_SPACE,
  TILE_TRACKING,
  TILE_PARTY,
  BARROWS,
  BARROWS_SLOT_LABELS,
} from "./board-data";
import {
  goalOf,
  progressSpec,
  completionAfter,
  assignLegacyItems,
  tickCredit,
  itemOwners,
  itemsOf,
  setsOf,
  slotsOf,
  partyOf,
  setProgress,
  leadingSet,
  completedSet,
  derivedCounts,
  completingItems,
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
      monkey_business_3: 4,
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
      bridge_prison_sentence: 1,
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

  it("asks for a shared note nowhere now the Barrows grid derives its own set", () => {
    // Me and My Brothers was the last tile with one — a leader typed which brother
    // the team was going for, next to four generic boxes. `sets` reads that off the
    // ticks instead. The machinery stays for the next objective of that shape, so
    // this asserts nothing asks for it rather than that it is gone.
    for (const t of [...allTiles(), ...BRIDGES]) {
      expect(progressSpec(t), t.id).toMatchObject({ note: null });
    }
  });

  it("keeps a set tile a checklist, and its goal one set", () => {
    // The mode is what every "do the counts come from ticks?" branch reads, and on a
    // set tile they still do. The goal is four pieces of one brother, NOT all 24.
    const s = progressSpec(target("me_and_my_brothers"));
    expect(s.mode).toBe("checklist");
    expect(s.goal).toBe(4);
    expect(s.items).toHaveLength(24);
    expect(s.sets.map((x) => x.k)).toEqual(["ahrim", "dharok", "guthan", "karil", "torag", "verac"]);
    expect(s.slots).toEqual(["Helm", "Body", "Legs", "Weapon"]);
    // Nothing else on the board is a set tile — migration 0006 and the grid are
    // written for this one, and the tests below assume it.
    expect(Object.keys(TILE_TRACKING).filter((id) => setsOf({ id }).length)).toEqual([
      "me_and_my_brothers",
    ]);
  });
});

/*
 * The ballista shipped with three boxes and a goal of 3, which let the tile read
 * "done" on an unstrung ballista: limbs + spring + frame is not the weapon, and the
 * monkey tail that finishes it was simply missing. Pinned here because the parts of a
 * craft are a wiki fact, not a judgement call — see the tile's `i` note.
 */
describe("the ballista is all four parts", () => {
  it("asks for the monkey tail too", () => {
    const t = target("monkey_business_3");
    expect(itemsOf(t).map((i) => i.k)).toEqual(["limbs", "spring", "frame", "tail"]);
    expect(goalOf(t)).toBe(4);
    // Every part has to be findable on the estimate table, or the drawer tells people
    // to grind three things for a four-thing tile.
    expect(t.i?.d?.some((d) => /monkey tail/i.test(d.n))).toBe(true);
  });
});

/*
 * A party target is one run by a fixed group. Nothing about completion reads the
 * number — the tile's goal still says whether the run happened — so these assertions
 * are about the number staying separate from the goal.
 */
describe("party targets", () => {
  it("knows how many each one takes, and that nothing else is one", () => {
    // A ToB 5-man and a CM trio. Both are challenge tiles, so both have a goal of 1
    // and the party size is the only thing that says how many people were there.
    expect(partyOf(target("the_416_special"))).toBe(5);
    expect(progressSpec(target("the_416_special"))).toMatchObject({
      mode: "count",
      goal: 1,
      party: 5,
    });
    expect(partyOf(target("big_cox"))).toBe(3);
    expect(progressSpec(target("big_cox"))).toMatchObject({ mode: "count", goal: 1, party: 3 });
    expect(partyOf(target("kraken_me_up"))).toBe(0);
    expect(partyOf(null)).toBe(0);
    expect(progressSpec(target("kraken_me_up")).party).toBe(0);
  });

  it("keys a real target, and never one whose progress comes from boxes", () => {
    for (const id of Object.keys(TILE_PARTY)) {
      expect(findTarget(id), `no target ${id}`).not.toBeNull();
      expect(TILE_PARTY[id], `${id} is a party of one`).toBeGreaterThan(1);
      // A checklist target's counts come from its ticks (tickCredit), so a "one each"
      // party save would be overwritten by the next tick. The editor picks one shape.
      expect(itemsOf({ id }), `${id} is a checklist target`).toHaveLength(0);
      // An alt box credits its owner the whole goal, which is the opposite rule.
      expect(TILE_TRACKING[id]?.alt, `${id} has an alt box`).toBeUndefined();
    }
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
      // itemsOf, not track.items: a set tile's boxes are its sets flattened, and they
      // are the keys that reach tile_items.
      const keys = [...itemsOf({ id }), ...(track.alt ?? [])].map((i) => i.k);
      expect(keys.length, `${id} has no boxes at all`).toBeGreaterThan(0);
      for (const k of keys) expect(k, `${id}.${k}`).toMatch(/^[a-z0-9_]+$/);
      expect(new Set(keys).size, `${id} repeats an item key`).toBe(keys.length);
    }
  });

  it("gives every checklist tile at least two boxes", () => {
    // One box would just be a 0/1 counter wearing a tick.
    for (const id of Object.keys(TILE_TRACKING)) {
      const items = itemsOf({ id });
      if (!items.length) continue;
      expect(items.length, `${id} has too few items`).toBeGreaterThan(1);
    }
  });

  it("keeps a target's sets the same length, and index-aligned with its slots", () => {
    // goalOf measures set[0], leadingSet compares tick counts across sets and the grid
    // walks slots x sets — all three are nonsense if the sets are ragged.
    for (const id of Object.keys(TILE_TRACKING)) {
      const sets = setsOf({ id });
      if (!sets.length) continue;
      expect(setsOf({ id }).length, `${id} has one set`).toBeGreaterThan(1);
      const slots = slotsOf({ id });
      for (const set of sets) {
        expect(set.items.length, `${id}.${set.k} is a different length`).toBe(slots.length);
        // The key prefix is what migration 0006's SQL splits on to find a piece's set.
        for (const item of set.items) {
          expect(item.k, `${id}.${item.k} is not prefixed by its set`).toMatch(
            new RegExp(`^${set.k}_[a-z0-9]+$`),
          );
        }
      }
      // Declaration order decides ties in leadingSet; 0006 re-derives the same counts
      // in SQL and can only tie-break alphabetically, so the two agree only while the
      // sets are declared in ascending key order.
      const keys = sets.map((x) => x.k);
      expect(keys, `${id} declares its sets out of order`).toEqual(keys.slice().sort());
      // A tile cannot have both: itemsOf would ignore the sets.
      expect(TILE_TRACKING[id].items, `${id} has items AND sets`).toBeUndefined();
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
 * The Barrows tile: 24 boxes, and any four matching ones finish it. Everything here is
 * the consequence of one rule — only the LEADING set's pieces are worth anything —
 * which is what stops a tile whose goal is 4 reading 6/4 with no brother near done.
 */
describe("set tiles", () => {
  const bros = target("me_and_my_brothers");
  const key = (set: string, slot: string) => `${set}_${slot}`;
  const full = (set: string, player: string) =>
    Object.fromEntries(["helm", "body", "legs", "weapon"].map((s) => [key(set, s), player]));

  it("has every brother's four pieces as a box, with a sprite each", () => {
    expect(BARROWS).toHaveLength(6);
    const items = itemsOf(bros);
    expect(items).toHaveLength(24);
    for (const item of items) {
      expect(item.img, `${item.k} has no sprite`).toBeTruthy();
      // A missing file renders an empty cell, and the grid is nothing but cells.
      expect(
        existsSync(new URL(`../public${item.img}`, import.meta.url)),
        `${item.img} is not in public/`,
      ).toBe(true);
      // The label is the in-game item name, which is the whole point of naming it.
      expect(item.n, item.k).toMatch(/^[A-Z][a-z]+'s [a-z]+$/);
    }
  });

  it("scores each set on its own ticks", () => {
    const owners = { ...full("dharok", "a"), ahrim_weapon: "b" };
    const byKey = Object.fromEntries(setProgress(bros, owners).map((p) => [p.set.k, p]));
    expect(byKey.dharok).toMatchObject({ ticks: 4, complete: true });
    expect(byKey.ahrim).toMatchObject({ ticks: 1, complete: false });
    expect(byKey.verac).toMatchObject({ ticks: 0, complete: false });
  });

  it("leads with the closest set, ties going to declaration order", () => {
    expect(leadingSet(bros, {})?.set.k).toBe("ahrim");
    expect(leadingSet(bros, { verac_helm: "a" })?.set.k).toBe("verac");
    // torag two, verac two — torag is declared first, so torag leads. Arbitrary, but
    // it has to be stable: this is what decides whose count is worth anything.
    const tie = { torag_helm: "a", torag_body: "a", verac_helm: "b", verac_body: "b" };
    expect(leadingSet(bros, tie)?.set.k).toBe("torag");
    // A plain checklist tile has no sets at all, which is how callers test for one.
    expect(leadingSet(target("clifford_s_revenge"), {})).toBeNull();
  });

  it("credits only the leading set's pieces", () => {
    // Two grinds one piece in each: the objective has moved forward by one, not two.
    const split = { dharok_helm: "a", ahrim_weapon: "a" };
    expect(tickCredit(bros, split)).toBe(1);
    // ahrim leads the tie, so a's dharok piece is worth nothing YET — it is still
    // ticked and still theirs, and it counts the moment dharok takes the lead.
    expect(tickCredit(bros, split, "a")).toBe(1);
    const dharokAhead = { ...split, dharok_body: "b" };
    expect(tickCredit(bros, dharokAhead)).toBe(2);
    expect(tickCredit(bros, dharokAhead, "a")).toBe(1);
    expect(tickCredit(bros, dharokAhead, "b")).toBe(1);
  });

  it("reaches the goal on a full set and no sooner", () => {
    // Six pieces, no set finished — the tile must not complete on the arithmetic.
    const scattered = Object.fromEntries(
      ["ahrim_helm", "dharok_helm", "guthan_helm", "karil_helm", "torag_helm", "verac_helm"].map(
        (k) => [k, "a"],
      ),
    );
    expect(tickCredit(bros, scattered)).toBe(1);
    expect(reachesGoal(tickCredit(bros, scattered), goalOf(bros))).toBe(false);

    const done = full("guthan", "a");
    expect(tickCredit(bros, done)).toBe(4);
    expect(reachesGoal(tickCredit(bros, done), goalOf(bros))).toBe(true);
    expect(completedSet(bros, done)?.n).toBe("Guthan the Infested");
    expect(completedSet(bros, scattered)).toBeNull();
  });

  it("credits everyone who got a piece of the set that finished", () => {
    // The point of the whole thing: four people, four pieces, four contributors.
    const owners = {
      karil_helm: "a",
      karil_body: "b",
      karil_legs: "c",
      karil_weapon: "d",
      // and one piece of a set that went nowhere — worth nothing, still attributed
      torag_helm: "e",
    };
    expect(derivedCounts(bros, owners)).toEqual({ a: 1, b: 1, c: 1, d: 1 });
    expect(completedSet(bros, owners)?.k).toBe("karil");
  });

  it("drops a contributor whose set stopped leading", () => {
    // The reason a set tile is recounted whole: b's tick moves a's count to 0, and
    // nothing about a's own rows changed.
    const before = { ahrim_helm: "a", dharok_helm: "b" };
    expect(derivedCounts(bros, before)).toEqual({ a: 1 });
    const after = { ...before, dharok_body: "b" };
    expect(derivedCounts(bros, after)).toEqual({ b: 2 });
  });

  it("force-completes with one whole set, not the first four boxes", () => {
    expect(completingItems(bros).map((i) => i.k)).toEqual([
      "ahrim_helm",
      "ahrim_body",
      "ahrim_legs",
      "ahrim_weapon",
    ]);
    expect(tickCredit(bros, Object.fromEntries(completingItems(bros).map((i) => [i.k, "L"])))).toBe(
      goalOf(bros),
    );
    // Unchanged for everything else: the first `goal` boxes in declaration order.
    expect(completingItems(target("clifford_s_revenge")).map((i) => i.k)).toEqual([
      "primordial",
      "pegasian",
      "eternal",
    ]);
    expect(completingItems(target("masks_off"))).toHaveLength(0);
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
      // A set tile's rows here are the keys it had in 0004, not the ones it has now —
      // 0006 renamed them. Those come from 0006's own rename list below rather than
      // being retyped, because "0006 renames exactly what 0004 created" is the
      // invariant worth guarding; retyping them would let the two drift apart.
      if (track.sets) continue;
      (track.items ?? []).forEach((item, i) => expected.push(`${id}:${i + 1}:${item.k}`));
    }
    RENAMED_KEYS.forEach((k, i) => expected.push(`me_and_my_brothers:${i + 1}:${k}`));

    expect(inSql.slice().sort()).toEqual(expected.slice().sort());
  });
});

/*
 * Migration 0006 turns those four generic Barrows keys into the 24 named ones. It has
 * to name both halves in SQL — the old keys it reads and the brother names it maps
 * them onto — so, like 0004, the same facts exist twice and the job here is to assert
 * they agree. A brother missing from the SQL silently drops that leader's note on the
 * floor; a slot missing from it leaves a tick nothing can render.
 */
const MIGRATION_0006 = readFileSync(
  new URL("../supabase/migrations/0006_barrows_sets.sql", import.meta.url),
  "utf8",
);

/**
 * Both of 0006's lookup blocks are two lowercase strings a row, so they have to be
 * read per block rather than by shape — the same slicing the 0004 assertions use.
 */
const pairs0006 = (header: string): { a: string; b: string }[] => {
  const start = MIGRATION_0006.indexOf(header);
  expect(start, `missing "${header}" in 0006`).toBeGreaterThan(-1);
  const body = MIGRATION_0006.slice(start, MIGRATION_0006.indexOf("\n)", start));
  return [...body.matchAll(/\('([a-z_]+)',\s*'([a-z_]+)'\)/g)].map((m) => ({
    a: m[1],
    b: m[2],
  }));
};

/** The old keys 0006 renames, in slot order — 0004's four generic Barrows boxes. */
const RENAMED_KEYS = pairs0006("with slots(old_key, slot) as (values").map((p) => p.a);

describe("migration 0006 agrees with the code", () => {
  const slots = pairs0006("with slots(old_key, slot) as (values").map((p) => ({
    oldKey: p.a,
    slot: p.b,
  }));
  const brothers = pairs0006("brothers(pattern, set_key) as (values").map((p) => ({
    pattern: p.a,
    setKey: p.b,
  }));

  it("renames a key onto every slot of every set", () => {
    expect(slots).toHaveLength(BARROWS_SLOT_LABELS.length);
    // Every (set, slot) pair the SQL can produce has to be a real box.
    const real = new Set(itemsOf({ id: "me_and_my_brothers" }).map((i) => i.k));
    for (const b of BARROWS) {
      for (const s of slots) {
        expect(real, `0006 would write ${b.k}_${s.slot}`).toContain(`${b.k}_${s.slot}`);
      }
    }
  });

  it("can resolve every brother out of a leader's note", () => {
    // A brother absent here means a note naming them resolves to nothing and their
    // ticks get dropped instead of renamed.
    const resolvable = new Set(brothers.map((b) => b.setKey));
    for (const b of BARROWS) expect(resolvable, `0006 cannot resolve ${b.k}`).toContain(b.k);
    // Every target it maps onto is a real set — a typo alias pointing nowhere would
    // rename a tick to a key nothing renders.
    const keys = new Set(BARROWS.map((b) => b.k));
    for (const b of brothers) expect(keys, `0006 maps ${b.pattern} nowhere`).toContain(b.setKey);
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
    const b = BRIDGES.find((x) => x.id === "bridge_south_unknown")!;
    const facing = REGIONS.find((r) => r.id === "south_west")!.tiles[5].id;
    const done = new Set(["bridge_m_lady", "bridge_prison_sentence", facing]);
    expect(bridgeStatus(b, { done })).toBe("locked");
  });
});

describe("fastestWayIn", () => {
  it("is null once the region is open", () => {
    expect(fastestWayIn("central", new Set())).toBeNull();
    expect(fastestWayIn("west", new Set(["bridge_m_lady"]))).toBeNull();
  });

  it("picks the cheapest bridge on any of the region's borders", () => {
    // Kebos & Kourend borders M'Lady (Crazy Arch, ~3h), Prison Sentence (CG,
    // ~5h) and Obsidian Breaker (TzHaar, ~13h). None is crossable yet — cost
    // decides, not reachability.
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
    // Wilderness borders We love them (a challenge, no rate) and one mystery —
    // no estimate still beats no objective.
    expect(fastestWayIn("south_east", new Set())?.id).toBe("bridge_we_love_them");
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
