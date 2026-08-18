// Celeris August Bingo — static board data (source of truth from event spec)
//
// Copied verbatim from design-reference/board-data.js. This is hand-checked
// content; do not retype or regenerate the ids — they are the primary keys used
// everywhere (TILE_RULES, bridge prereqs, and every DB row).
//
// OSRS INFO MODEL (the `i` object on a tile/bridge)
//   need : how many of the drop the tile asks for (default 1)
//   d    : drop sources — [{ n: source, r: 1-in-r per action, k: actions per hour, u: action word, note }]
//          several entries = several locations/methods, all shown with their own estimate
//   hr   : throughput objective — { got: total needed, per: per hour, u: unit }
//   fix  : flat hours estimate for grinds that are not a single roll (sets, coupon-collector, deterministic)
//   note : caveat printed under the table
//   c    : confidence — "w" wiki-backed rate, "e" community estimate, "u" unconfirmed, needs leader input
//   Challenge / completion tiles carry no `i` at all — nothing to estimate.
//
// Kills-per-hour values are averages for a competent player in decent gear. They are the softest
// number in here and the app says so on every tile.

export type Confidence = "w" | "e" | "u";

export interface DropSource {
  /** source / method name */
  n: string;
  /** 1-in-r per action */
  r: number;
  /** actions per hour */
  k: number;
  /** action word (default "kills") */
  u?: string;
  note?: string;
}

export interface ThroughputObjective {
  /** total needed */
  got: number;
  /** per hour */
  per: number;
  /** unit */
  u: string;
}

export interface OsrsInfo {
  need?: number;
  c?: Confidence;
  d?: DropSource[];
  hr?: ThroughputObjective;
  fix?: number;
  note?: string;
}

export interface Tile {
  id: string;
  /** name */
  n: string;
  /** objective */
  o: string;
  /** source */
  s?: string;
  /** freeform rate text */
  r?: string;
  /** wiki url */
  w?: string;
  /** challenge tile flag */
  ch?: number;
  /** free-space flag (central tile index 4) */
  free?: number;
  i?: OsrsInfo;
}

export interface Region {
  id: string;
  name: string;
  tiles: Tile[];
}

export interface Bridge {
  id: string;
  name: string;
  o: string;
  /**
   * The two regions this bridge joins, in board order — [top, bottom] for
   * stacked regions, [left, right] for side-by-side ones.
   * Bridges are two-way: clearing one opens whichever side is still locked.
   * The prereq tile is not stored — it is the tile facing the bridge on the
   * side you are crossing from, derived in scoring.ts (bridgePrereq).
   */
  between: readonly [string, string];
  s?: string;
  r?: string;
  w?: string;
  mystery?: number;
  i?: OsrsInfo;
}

export interface RuleItem {
  text: string;
  tiles?: string[];
}

export interface RuleSection {
  id: string;
  title: string;
  items: RuleItem[];
}

const t = (n: string, o: string, extra: Partial<Tile> = {}): Tile =>
  Object.assign(
    { id: n.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""), n, o },
    extra,
  ) as Tile;

export const REGIONS: Region[] = [
  { id: "north_west", name: "Desert", tiles: [
    t("Return the Sceptre", "Get 2x Pharaoh Sceptres", { s: "Pyramid Plunder", r: "Approximately 1/63.5 per fully completed Pyramid Plunder run at 91 Thieving; the exact cumulative rate depends on how the pyramid is completed.", w: "https://oldschool.runescape.wiki/w/Pharaoh%27s_sceptre",
      i: { need: 2, c: "w", d: [{ n: "Pyramid Plunder (91 Thieving, full run)", r: 63.5, k: 13, u: "runs" }], note: "Sceptre only rolls in the final rooms — skipping rooms lowers the effective rate." } }),
    t("KQ? Pee Yew", "Get a Dragon Pickaxe from KQ", { s: "Kalphite Queen", r: "1/400", w: "https://oldschool.runescape.wiki/w/Dragon_pickaxe",
      i: { need: 1, c: "w", d: [{ n: "Kalphite Queen", r: 400, k: 30 }] } }),
    t("Thread the Needle", "Get 1x Abyssal Dye from GOTR", { s: "Guardians of the Rift", r: "1/1,200 per reward roll for each colour — 1/400 for any dye", w: "https://oldschool.runescape.wiki/w/Abyssal_dye",
      i: { need: 1, c: "e", d: [{ n: "Guardians of the Rift", r: 400, k: 18, u: "reward rolls" }], note: "Abyssal blue, green and red dye are 1/1,200 each per reward roll — any of the three clears the tile, so ≈ 1/400 a roll. A high-points game is roughly 3 rolls, about 6 games an hour." } }),
    t("My Snake is Bigger", "Get 1x any Virtus or Leviathan's Lure from The Leviathan", { s: "The Leviathan", r: "Virtus pieces and Leviathan's lure are rare-table drops — combined objective, no single rate.", w: "https://oldschool.runescape.wiki/w/The_Leviathan",
      i: { need: 1, c: "e", d: [{ n: "The Leviathan (any qualifying drop)", r: 307, k: 20 }], note: "Virtus pieces 1/1,536 each, Leviathan's lure 1/768 — combined ≈ 1/307 per kill." } }),
    t("Budget 150's", "Complete a 500 TOA with tier 70 and below gear (you get yellow Keris)", { s: "Tombs of Amascut", r: "N/A — challenge", w: "https://oldschool.runescape.wiki/w/Tombs_of_Amascut", ch: 1 }),
    t("Plug Prepper", "Complete a Master Wand from scratch", { s: "Mage Training Arena", r: "N/A — deterministic acquisition", w: "https://oldschool.runescape.wiki/w/Master_wand",
      i: { c: "e", fix: 14, note: "No drop rate — the wand costs 120 pizazz points in each of the four MTA rooms. Roughly 12–16 hours depending on how efficient the Alchemist and Graveyard rooms are played." } }),
    t("Masori Chaps MIA", "Get 3x Masori Pieces or a Shadow from TOA", { s: "Tombs of Amascut", r: "At raid levels 150–300 each Masori piece is 1/12 of the purple table and Tumeken's shadow 1/24; at raid level 500 they are 1/8.25 and 1/16.5. Purple rate is raid-level/contribution dependent.", w: "https://oldschool.runescape.wiki/w/Chest_(Tombs_of_Amascut)",
      i: { need: 3, c: "u", d: [
        { n: "TOA 300 invocation (solo)", r: 96, k: 3.5, u: "raids" },
        { n: "TOA 500 invocation (solo)", r: 34, k: 2.5, u: "raids" }
      ], note: "Any Masori piece is 3/12 of purples at 300 and 3/8.25 at 500. Purple chance ≈ 1/24 at 300 and ≈ 1/12.5 at 500 solo. A Tumeken's shadow clears the tile on its own, but at ≈ 1/576 a raid at 300 and ≈ 1/206 at 500 it is far rarer than the three pieces — the rows above are the Masori route." } }),
    t("Temp Tome Time", "Get 1x Tome of Water / Harpoonfish from Tempoross", { s: "Tempoross reward", r: "Tome of water 1/1,600. Barrel/harpoon rewards use their own reward-table mechanics.", w: "https://oldschool.runescape.wiki/w/Tempoross",
      i: { need: 1, c: "e", d: [{ n: "Tempoross reward pool", r: 1600, k: 40, u: "reward rolls" }], note: "1/1,600 per reward roll; a full-participation game is roughly 8 rolls at about 5 games an hour." } }),
    t("Three Finger Death Punch", "Get 3x Lightbearer from TOA", { s: "Tombs of Amascut", r: "At raid levels 150–300 Lightbearer is weighted 7/24 conditional on a purple.", w: "https://oldschool.runescape.wiki/w/Chest_(Tombs_of_Amascut)",
      i: { need: 3, c: "u", d: [
        { n: "TOA 300 invocation (solo)", r: 82, k: 3.5, u: "raids" },
        { n: "TOA 500 invocation (solo)", r: 43, k: 2.5, u: "raids" }
      ], note: "Lightbearer is 7/24 of the purple table. Purple chance ≈ 1/24 at 300 and ≈ 1/12.5 at 500 solo." } })
  ]},
  { id: "north", name: "Fremennik", tiles: [
    t("Saint Shard", "Get 1x Venator Shard", { s: "Phantom Muspah", r: "1/100", w: "https://oldschool.runescape.wiki/w/Phantom_Muspah",
      i: { need: 1, c: "w", d: [{ n: "Phantom Muspah", r: 100, k: 14 }] } }),
    t("Brine Time", "Get 3x Brine Sabres", { s: "Brine Rat", r: "1/512 each", w: "https://oldschool.runescape.wiki/w/Brine_sabre",
      i: { need: 3, c: "w", d: [{ n: "Brine rats (Slayer task)", r: 512, k: 170 }], note: "Brine rats die fast; kill rate is the whole story here." } }),
    t("Turn to Stone", "Get 1x Basilisk Jaw", { s: "Basilisk Knight", r: "1/5,000 off-task; 1/1,000 on a Basilisk Slayer task", w: "https://oldschool.runescape.wiki/w/Basilisk_Knight",
      i: { need: 1, c: "w", d: [
        { n: "Basilisk Knights — on a Basilisk task", r: 1000, k: 65 },
        { n: "Basilisk Knights — off task", r: 5000, k: 65 }
      ], note: "Only worth doing on task. Get the task from Konar or block-swap into it." } }),
    t("Axe Enthusiast", "Get 5x Dragon Axes", { s: "Dagannoth Kings", r: "1/128 from each Dagannoth King", w: "https://oldschool.runescape.wiki/w/Dragon_axe",
      i: { need: 5, c: "w", d: [{ n: "Dagannoth Kings (all three rolled)", r: 128, k: 140, u: "king kills" }], note: "Every King rolls 1/128 separately, so a tri-brid rotation is roughly 140 rolls an hour." } }),
    t("Vorkath Veteran", "Survive and Kill Vorkath after 20 minutes", { s: "Vorkath", r: "N/A — challenge", w: "https://oldschool.runescape.wiki/w/Vorkath", ch: 1 }),
    t("Duke Destroyer", "Get 1x Virtus / Eye of the Duke from Duke Sucellus", { s: "Duke Sucellus", r: "Combined qualifying unique drops — see source rates.", w: "https://oldschool.runescape.wiki/w/Duke_Sucellus",
      i: { need: 1, c: "e", d: [{ n: "Duke Sucellus (any qualifying drop)", r: 307, k: 32 }], note: "Virtus pieces 1/1,536 each, Eye of the duke 1/768 — combined ≈ 1/307 per kill." } }),
    t("Astral Projection", "Craft 10k Astral Runes (no extracts)", { s: "Astral altar", r: "N/A — collection challenge", w: "https://oldschool.runescape.wiki/w/Astral_rune",
      i: { c: "e", hr: { got: 10000, per: 1700, u: "astral runes" }, note: "About 1,700 an hour with pure essence and a Lunar teleport loop. No extracts allowed, so no shortcut." } }),
    t("Lord of the Rings", "Get 4x unique DK rings", { s: "Dagannoth Kings", r: "Each DK ring is 1/128 from its corresponding King.", w: "https://oldschool.runescape.wiki/w/Dagannoth_Kings",
      i: { c: "e", fix: 5.5, d: [{ n: "Dagannoth Kings (per ring)", r: 128, k: 140, u: "king kills" }], note: "Four rings at 1/128 each — expect about 270 full King rotations for the set, not 4×128. Rex carries both Berserker and Warrior." } }),
    t("Return of the Money Dragon", "Get 1x Jar of Decay / Dragonbone Necklace / Either Visage from Vorkath", { s: "Vorkath", r: "Dragonbone necklace 1/1,000; draconic visage 1/5,000; skeletal visage 1/5,000. Jar of decay is a separate tertiary.", w: "https://oldschool.runescape.wiki/w/Vorkath",
      i: { need: 1, c: "w", d: [{ n: "Vorkath (any qualifying drop)", r: 577, k: 30 }], note: "Dragonbone necklace 1/1,000, jar of decay 1/3,000, each visage 1/5,000 — combined ≈ 1/577 per kill." } })
  ]},
  { id: "north_east", name: "Kandarin", tiles: [
    t("Eye of the Occult", "Get 1x Occult from Thermonuclear Smoke Devil", { s: "Thermonuclear Smoke Devil", r: "1/350", w: "https://oldschool.runescape.wiki/w/Occult_necklace",
      i: { need: 1, c: "w", d: [{ n: "Thermonuclear Smoke Devil", r: 350, k: 35 }] } }),
    t("Monkey Business 3", "Complete a full ballista", { s: "Demonic Gorillas", r: "Heavy/light frames, limbs and spring have separate rates.", w: "https://oldschool.runescape.wiki/w/Ballista",
      i: { c: "w", fix: 18, d: [
        { n: "Ballista limbs", r: 500, k: 60 },
        { n: "Ballista spring", r: 500, k: 60 },
        { n: "Light frame", r: 750, k: 60 },
        { n: "Heavy frame", r: 1500, k: 60 }
      ], note: "A light ballista needs limbs + spring + light frame, so it is three separate grinds off the same kills — roughly 1,100 gorillas for the set. Heavy frame is four times rarer." } }),
    t("Curved to the Left", "Get 1x Warped Sceptre", { s: "Warped Terrorbirds / Tortoises", r: "1/320", w: "https://oldschool.runescape.wiki/w/Warped_sceptre",
      i: { need: 1, c: "w", d: [
        { n: "Warped terrorbirds", r: 320, k: 110 },
        { n: "Warped tortoises", r: 320, k: 90 }
      ] } }),
    t("Kraken Me Up", "Get 5x Tridents from the Kraken Boss", { s: "Kraken", r: "1/512 for Trident of the seas (full) per kill", w: "https://oldschool.runescape.wiki/w/Trident_of_seas_full",
      i: { need: 5, c: "w", d: [{ n: "Kraken", r: 512, k: 80 }], note: "The long one on this board. Five tridents is about 2,500 kraken kills." } }),
    t("I'm Huffin that Shit", "Complete one Thermy kill without a Slayer helmet or facemask", { s: "Thermonuclear Smoke Devil", r: "N/A — challenge", w: "https://oldschool.runescape.wiki/w/Thermonuclear_smoke_devil", ch: 1 }),
    t("Monkey Business", "Complete 500 Monkey Laps", { s: "Ape Atoll agility", r: "N/A — challenge", w: "https://oldschool.runescape.wiki/w/Monkey_Madness_II",
      i: { c: "e", hr: { got: 500, per: 47, u: "laps" }, note: "About 47 laps an hour once the course is clean. Ninja greegree required." } }),
    t("Monkey Business 2", "Get 2x Zenyte Shards", { s: "Demonic Gorillas", r: "1/300 each", w: "https://oldschool.runescape.wiki/w/Zenyte_shard",
      i: { need: 2, c: "w", d: [{ n: "Demonic gorillas", r: 300, k: 60 }], note: "Kill rate swings hard on gear — 50/hr budget, 80+/hr in BiS or on task." } }),
    t("Evil Ass Task", "Complete a full Angler outfit from Fishing Trawler", { s: "Fishing Trawler", r: "Each Angler outfit piece is 1/12 from the reward system", w: "https://oldschool.runescape.wiki/w/Angler%27s_outfit",
      i: { c: "e", fix: 18, d: [{ n: "Fishing Trawler (any piece)", r: 12, k: 5.5, u: "trips" }], note: "1/12 per successful trip for a random piece — duplicates happen, so the full four is closer to 100 trips than 48." } }),
    t("Just a Nibble", "Get 10x Chewed Bones", { s: "Mithril dragons, Ancient Cavern", r: "3/128 (about 1 in 43) per mithril dragon", w: "https://oldschool.runescape.wiki/w/Chewed_bones",
      i: { need: 10, c: "w", d: [{ n: "Mithril dragons (Ancient Cavern)", r: 42.7, k: 27 }], note: "Only mithril dragons drop them; skeleton looting gives mangled bones, not chewed." } })
  ]},
  { id: "west", name: "Kebos & Kourend", tiles: [
    t("Dread It. Run From It", "Get 1x Golden Tench", { s: "Aerial Fishing", r: "1/20,000", w: "https://oldschool.runescape.wiki/w/Golden_tench",
      i: { need: 1, c: "w", d: [{ n: "Aerial fishing (Lake Molch)", r: 20000, k: 220, u: "catches" }], note: "The single worst rate on the board. Only worth it if someone is already sitting on aerial fishing." } }),
    t("The CM Experience", "Get an Onyx within Zeah", { s: "Tekton (Chambers of Xeric)", r: "Onyx 1/450 per Tekton kill in a solo normal-mode raid; the rate scales with party size.", w: "https://oldschool.runescape.wiki/w/Tekton",
      i: { need: 1, c: "w", d: [{ n: "Tekton — solo normal raid, reset each kill", r: 450, k: 12 }], note: "Only Tekton drops it. Rate improves with party size, but Challenge Mode with 3 or fewer is 3× worse — solo normal mode on repeat is the grind." } }),
    t("The Cold of the Todt", "Get 1x Dragon Axe or Tome of Fire from the Todt", { s: "Wintertodt supply crate", r: "Tome of fire 1/1,000 and dragon axe 1/10,000 per supply-crate roll.", w: "https://oldschool.runescape.wiki/w/Wintertodt",
      i: { need: 1, c: "e", d: [{ n: "Wintertodt supply crate — either drop", r: 909, k: 15, u: "crate rolls" }], note: "Tome of fire 1/1,000 and dragon axe 1/10,000 — either clears the tile, so ≈ 1/909 a roll. Rolls scale with points, about 2 a crate at 1,000+ points." } }),
    t("Yamama", "Get 2x Oathplate Pieces", { s: "Yama", r: "Individual Oathplate piece 1/600 at 100% contribution; or guaranteed via the Oathplate contract.", w: "https://oldschool.runescape.wiki/w/Yama",
      i: { need: 2, c: "w", d: [{ n: "Yama — direct drop (solo)", r: 200, k: 5 }], note: "Solo unique table is 1/120, then 3/5 of those are oathplate — about 1/200 a kill. The Contract of oathplate acquisition is a guaranteed piece if anyone can clear it." } }),
    t("Big Cox", "Complete a 3+2+2 CM", { s: "Chambers of Xeric: CM", r: "N/A — challenge", w: "https://oldschool.runescape.wiki/w/Chambers_of_Xeric/Challenge_Mode", ch: 1 }),
    t("Where's your Maul?", "Get 1x Dragon Warhammer", { s: "Lizardman Shaman", r: "1/5,000", w: "https://oldschool.runescape.wiki/w/Dragon_warhammer",
      i: { need: 1, c: "w", d: [
        { n: "Lizardman shamans (Molch island)", r: 5000, k: 90 },
        { n: "Lizardman shamans (Lizardman Canyon)", r: 5000, k: 75 }
      ], note: "Rada's blessing 4 and a cannon push the kill rate; the rate itself never moves." } }),
    t("EEEEEK", "Get 1x Sarachnis Cudgel", { s: "Sarachnis", r: "1/384", w: "https://oldschool.runescape.wiki/w/Sarachnis_cudgel",
      i: { need: 1, c: "w", d: [{ n: "Sarachnis", r: 384, k: 50 }] } }),
    t("To All the Irons", "Get 1x Ferocious Gloves or Dragon Hunter Lance", { s: "Alchemical Hydra", r: "Hydra's claw 1/1,001; Hydra leather approximately 1/514 on the base table.", w: "https://oldschool.runescape.wiki/w/Alchemical_Hydra",
      i: { need: 1, c: "w", d: [{ n: "Alchemical Hydra (leather or claw)", r: 340, k: 27 }], note: "Hydra leather ≈ 1/514 (ferocious gloves) and hydra's claw 1/1,001 (lance) — combined ≈ 1/340 a kill." } }),
    t("Missing My Top", "Get 1x Ancestral Piece or a Twisted Bow", { s: "Chambers of Xeric", r: "Since the August 2026 reweight the ancestral hat / top / bottom are 4/60 each and the twisted bow 2/60 on the unique table — 14/60 combined.", w: "https://oldschool.runescape.wiki/w/Chest_(Chambers_of_Xeric)",
      i: { need: 1, c: "w", d: [
        { n: "CoX solo, ~30k points", r: 124, k: 1.5, u: "raids" },
        { n: "CoX 5-man, ~30k points each", r: 25, k: 2, u: "raids" }
      ], note: "Purple chance is total points ÷ 8,676, and the three ancestral pieces plus the twisted bow are 14/60 of the unique table. A team rolls far more often because points stack — but the drop lands on one player." } })
  ]},
  { id: "central", name: "Misthlain", tiles: [
    t("We have the beef", "Get a Beef pet", { s: "Brutus / Demonic Brutus", r: "Beef is 1/1,000 from Brutus and 1/400 from Demonic Brutus.", w: "https://oldschool.runescape.wiki/w/Beef",
      i: { need: 1, c: "w", d: [
        { n: "Brutus", r: 1000, k: 40 },
        { n: "Demonic Brutus", r: 400, k: 18 }
      ], note: "Pet roll, so it can land at any point. Remember the rules: a pet can't clear a middle challenge tile and only counts for one tile." } }),
    t("The Nex Tile", "Get any Nex unique", { s: "Nex", r: "Effective 1/43 chance of rolling the unique table per kill (per kill, not per player).", w: "https://oldschool.runescape.wiki/w/Nex",
      i: { need: 1, c: "w", d: [
        { n: "Nex 5-man", r: 43, k: 10 },
        { n: "Nex duo", r: 43, k: 6.5 }
      ], note: "1/43 is the kill's chance, not yours — the drop is shared out by damage contribution, and bigger teams can roll more than one unique per kill." } }),
    t("Clifford's Revenge", "Get each Cerberus boot crystal", { s: "Cerberus", r: "Each boot crystal is approximately 1/512.", w: "https://oldschool.runescape.wiki/w/Cerberus",
      i: { c: "w", fix: 19, d: [{ n: "Cerberus (per crystal)", r: 520, k: 50 }], note: "Each crystal is 1/520 and duplicates count for nothing, so expect about 950 kills for all three. Kill rate is the wiki money-maker's 50/hr on max melee — around 40 on a tbow or bludgeon setup." } }),
    t("Whispered", "Get any Virtus / axe piece from Whisperer", { s: "The Whisperer", r: "Unique table 1/64; Virtus individual pieces 1/1,536; Siren's staff 1/512.", w: "https://oldschool.runescape.wiki/w/The_Whisperer",
      i: { need: 1, c: "e", d: [{ n: "The Whisperer (any qualifying drop)", r: 307, k: 22 }], note: "Virtus pieces 1/1,536 each plus the axe piece at 1/768 — combined ≈ 1/307 a kill." } }),
    t("Free Space", "You only get one", { s: "Free space", r: "N/A — only one player may claim it", ch: 1, free: 1 }),
    t("Rune Reaper", "Get Dragon Limbs", { s: "Rune Dragon", r: "1/800", w: "https://oldschool.runescape.wiki/w/Rune_dragon",
      i: { need: 1, c: "w", d: [{ n: "Rune dragons (Lithkren / Myths' Guild)", r: 800, k: 40 }] } }),
    t("Godwars General", "Get 3x GWD Drops", { s: "God Wars Dungeon", r: "Depends on the selected GWD boss/drop.", w: "https://oldschool.runescape.wiki/w/God_Wars_Dungeon",
      i: { need: 3, c: "e", d: [
        { n: "General Graardor (any unique)", r: 107, k: 32 },
        { n: "K'ril Tsutsaroth (any unique)", r: 107, k: 30 },
        { n: "Kree'arra (any unique)", r: 107, k: 25 },
        { n: "Commander Zilyana (any unique)", r: 107, k: 25 }
      ], note: "Each general's unique table works out to roughly 1/107 a kill once hilt, armour and weapon rolls are added up. Pick whichever boss the team is geared for." } }),
    t("Abyssal Cryer", "Get 3x Bludgeon Pieces", { s: "Abyssal Sire", r: "Any bludgeon piece is 1/206 per kill (unsired 1/100, pieces 62/128 of its table).", w: "https://oldschool.runescape.wiki/w/Unsired",
      i: { need: 3, c: "w", d: [{ n: "Abyssal Sire (any bludgeon piece)", r: 206, k: 25 }], note: "Unsired is 1/100 a kill and bludgeon pieces are 62/128 of its table — 1/206 a kill for a piece. Duplicates are re-rolled once you've redeemed, so three pieces is about 620 kills, not a collector's grind. Don't hold two unsireds at once: that's how you get a duplicate." } }),
    t("Cold and Spicy", "Complete a twinflame staff", { s: "Royal Titans (Branda & Eldric)", r: "Each element staff crown is up to 1/75 a kill at 100% damage, about 1/150 at half.", w: "https://oldschool.runescape.wiki/w/Twinflame_staff",
      i: { need: 2, c: "e", fix: 4.5, d: [{ n: "Royal Titans — both crowns", r: 75, k: 25 }], note: "Fire crown off Branda, ice off Eldric, plus a battlestaff. The rate scales with your damage share, so a duo halves each player's odds and lands in the same place for the team. Both crowns and the finished staff are tradeable — if buying is allowed, the GE is far faster than the grind." } })
  ]},
  { id: "east", name: "Varlamore", tiles: [
    t("Bleed Me Dry", "Get an Axe Piece or Virtus Piece from Vardorvis", { s: "Vardorvis", r: "Soulreaper axe component and Virtus pieces are rare-table drops.", w: "https://oldschool.runescape.wiki/w/Vardorvis",
      i: { need: 1, c: "e", d: [{ n: "Vardorvis (any qualifying drop)", r: 307, k: 30 }], note: "Virtus pieces 1/1,536 each plus the axe piece at 1/768 — combined ≈ 1/307 a kill." } }),
    t("Temu Salamander", "Get 1x Mature Tecu Salamander", { s: "Tecu Salamander Hunter", r: "1/1,000", w: "https://oldschool.runescape.wiki/w/Tecu_salamander",
      i: { need: 1, c: "w", d: [{ n: "Tecu salamander hunting (Varlamore)", r: 1000, k: 140, u: "catches" }], note: "Catch rate depends on trap count and Hunter level — 140/hr assumes 5 traps." } }),
    t("Blood Moon Rises", "Get 4x Moons of Peril Drops", { s: "Moons of Peril", r: "Rates depend on completion/loot mechanics — no single rate.", w: "https://oldschool.runescape.wiki/w/Moons_of_Peril",
      i: { need: 4, c: "e", d: [{ n: "Moons of Peril chests", r: 8, k: 9, u: "chests" }], note: "Roughly 1/8 a chest for a unique across the three moons, about three chests per 20-minute lap." } }),
    t("Teletubby Sun", "Get 3x Sunfire Drops", { s: "Fortis Colosseum rewards chest", r: "Any sunfire fanatic piece ≈ 1/8.43 per full 12-wave completion.", w: "https://oldschool.runescape.wiki/w/Rewards_Chest_(Fortis_Colosseum)",
      i: { need: 3, c: "w", d: [{ n: "Fortis Colosseum — full 12-wave run", r: 8.43, k: 1.8, u: "runs" }], note: "Helm, cuirass and chausses start rolling at wave 4 and the chest has duplicate protection, so three distinct pieces really is about three rolls." } }),
    t("Sol Creditt", "Complete the Colosseum in gear less than 5m", { s: "Fortis Colosseum", r: "N/A — challenge", w: "https://oldschool.runescape.wiki/w/Fortis_Colosseum", ch: 1 }),
    t("I've heard something", "Complete 50x Hunter Rumours", { s: "Hunter Rumours", r: "N/A — challenge", w: "https://oldschool.runescape.wiki/w/Hunter_Rumours",
      i: { c: "e", hr: { got: 50, per: 9, u: "rumours" }, note: "About 9 an hour on master rumours with a decent hunter setup; expert tier is a touch faster per rumour but worth fewer points elsewhere." } }),
    t("Temolties", "Get 1x Glacial Temotli", { s: "Amoxliatl / Frost Nagua", r: "1/100 from Amoxliatl; 1/500 from Frost Nagua.", w: "https://oldschool.runescape.wiki/w/Glacial_temotli",
      i: { need: 1, c: "w", d: [
        { n: "Amoxliatl", r: 100, k: 60 },
        { n: "Frost Nagua", r: 500, k: 100 }
      ], note: "Amoxliatl is the clear pick — same item, five times the rate." } }),
    t("The Magic Wand", "Get 1x Dragon Hunter Wand", { s: "Hueycoatl", r: "1/105", w: "https://oldschool.runescape.wiki/w/Dragon_hunter_wand",
      i: { need: 1, c: "w", d: [{ n: "The Hueycoatl (group)", r: 105, k: 11 }], note: "Kill rate assumes a populated group world; the drop rolls per player on the kill." } }),
    t("Rip Wetfrog", "Get 3x Doom Uniques", { s: "Doom of Mokhaiotl", r: "Varies by delve level and unique; deeper levels improve rates.", w: "https://oldschool.runescape.wiki/w/Doom_of_Mokhaiotl",
      i: { need: 3, c: "w", d: [
        { n: "Delve 1–8 loop (any unique)", r: 50, k: 2.4, u: "delve cycles" },
        { n: "Delve 9 camp (per unique, per kill)", r: 180, k: 4, u: "delve 9 kills" }
      ], note: "Uniques start at delve 2 and improve every level: cloth 1/2,500 at D2 down to 1/540 at D9, eye of ayak from D3, avernic treads from D4. A full 1–8 run rolls all of them on the way down, which is where the ~1/50 per cycle comes from. Dying deep forfeits the run." } })
  ]},
  { id: "south_west", name: "Morytania", tiles: [
    t("Justmi?", "Get 3x Justiciar Pieces or 1x Scythe of Vitur", { s: "Theatre of Blood", r: "Scythe 1/19 and each Justiciar piece 2/19 conditional on the unique table; purple chance depends on raid mechanics.", w: "https://oldschool.runescape.wiki/w/Monumental_chest",
      i: { c: "e", fix: 35, d: [
        { n: "ToB 5-man — Justiciar pieces (need 3)", r: 29, k: 2.5, u: "raids" },
        { n: "ToB 5-man — Scythe of vitur (need 1)", r: 173, k: 2.5, u: "raids" }
      ], note: "Team purple is about 1/9 a raid; scythe is 1/19 of purples and each Justiciar piece 2/19. Three Justiciar pieces is the realistic route — the scythe line is there for the lucky." } }),
    t("ITS BIS NOW", "Get 1x Granite Hammer", { s: "Grotesque Guardians", r: "1/750 base", w: "https://oldschool.runescape.wiki/w/Granite_hammer",
      i: { need: 1, c: "w", d: [{ n: "Grotesque Guardians", r: 750, k: 25 }], note: "Rate improves slightly on task with a higher Slayer level." } }),
    t("Agility Time :(", "Get 1x Ring of Endurance", { s: "Hallowed Sepulchre Grand Hallowed Coffin", r: "1/200", w: "https://oldschool.runescape.wiki/w/Ring_of_endurance",
      i: { need: 1, c: "w", d: [{ n: "Grand Hallowed Coffin (floor 5)", r: 200, k: 3.4, u: "coffins" }], note: "Only the floor-5 grand coffin rolls it. Roughly 17–18 minutes a full run." } }),
    t("Me and My Brothers", "Complete 1x Full Barrows Set", { s: "Barrows", r: "Depends on chest mechanics — no single 'full set' rate.", w: "https://oldschool.runescape.wiki/w/Barrows",
      i: { c: "e", fix: 13, d: [{ n: "Barrows (specific piece)", r: 65, k: 11, u: "chests" }], note: "All six brothers plus full potential gives roughly 1/65 a chest for any one named piece; four pieces of one brother lands near 135 chests at about 11 chests an hour." } }),
    t("The 416 Special", "Complete a Theatre of Blood 5-man in gear not over 5m per person (not including pots)", { s: "Theatre of Blood", r: "N/A — challenge", w: "https://oldschool.runescape.wiki/w/Theatre_of_Blood", ch: 1 }),
    t("Bloody Bad Time", "Get 4x Blood Shards", { s: "Vyrewatch Sentinel", r: "1/1,500 each", w: "https://oldschool.runescape.wiki/w/Blood_shard",
      i: { need: 4, c: "u", d: [{ n: "Vyrewatch Sentinels (Darkmeyer)", r: 1500, k: 100 }], note: "Rate figure came from the event sheet — worth double-checking against the wiki before four people commit to it." } }),
    t("My Personal Nightmare", "Get 1x Inq Piece or 1x Orb from Nightmare or PNM", { s: "The Nightmare / Phosani's Nightmare", r: "Inquisitor armour and staff orbs use separate rates.", w: "https://oldschool.runescape.wiki/w/The_Nightmare",
      i: { need: 1, c: "e", d: [
        { n: "Phosani's Nightmare (any qualifying)", r: 60, k: 6 },
        { n: "The Nightmare, 3-man (any qualifying)", r: 43, k: 10 }
      ], note: "Phosani's rolls solo so the whole drop is yours; group Nightmare rolls more often but splits between the team." } }),
    t("Araxxxxxxxxor", "Get 3x Nox Halley Pieces", { s: "Araxxor", r: "Each Noxious halberd component 1/200 with duplicate protection.", w: "https://oldschool.runescape.wiki/w/Araxxor",
      i: { need: 3, c: "w", d: [{ n: "Araxxor", r: 200, k: 33 }], note: "Duplicate protection means three distinct pieces really is about three rolls — roughly 600 kills." } }),
    t("Masks Off", "Get 3x Black Masks", { s: "Cave Horrors", r: "1/512 each", w: "https://oldschool.runescape.wiki/w/Black_mask",
      i: { need: 3, c: "w", d: [{ n: "Cave horrors (Mos Le'Harmless)", r: 512, k: 180 }], note: "Witchwood icon required. Cannon and a task make the kill rate." } })
  ]},
  { id: "south", name: "Open Waters", tiles: [
    t("I'm Hooked", "Get 2x Dragon Hooks", { s: "Great white sharks (boat combat)", r: "Broken dragon hook 1/500, or 1/250 on a great-white bounty task.", w: "https://oldschool.runescape.wiki/w/Broken_dragon_hook",
      i: { need: 2, c: "w", d: [
        { n: "Great white sharks — on bounty task", r: 250, k: 20 },
        { n: "Great white sharks — off task", r: 500, k: 20 }
      ], note: "Only great whites drop it, and bounty tasks double the rate — stack those first. The hook is tradeable (~2M), so buying is by far the fastest route if the rules allow it." } }),
    t("I'm Blasted", "Get 2x Dragon Cannon Barrels", { s: "Veiled kraken / opulent salvage", r: "1/500 from veiled krakens (1/250 on a kraken bounty task); 1/20,000 from sorting opulent salvage.", w: "https://oldschool.runescape.wiki/w/Dragon_cannon_barrel",
      i: { need: 2, c: "w", d: [
        { n: "Veiled kraken — on bounty task", r: 250, k: 20 },
        { n: "Veiled kraken — off task", r: 500, k: 20 }
      ], note: "Salvage sorting at 1/20,000 is not a route, it's a lottery ticket. Kraken bounty tasks are the grind, and the barrel trades around 580k on the GE." } }),
    t("Rock Solid", "Get 1x Jar of Light", { s: "Mad Angel (Wyrmscraig)", r: "Rate not published; the other boss jars sit at 1/2,000–1/3,000.", w: "https://oldschool.runescape.wiki/w/Jar_of_light",
      i: { c: "u", note: "Only the Mad Angel drops it. No published rate yet — if it follows the other jars at 1/2,000 this is a very long tile, so get a kill rate from whoever has done it before committing anyone." } }),
    t("Paint Me", "Get 1x Anglers Paint / Barracuda Paint / Salvors Paint", { s: "Deep sea trawling / Barracuda Trials / martial salvage", r: "Three different systems: trawling drop, Marlin-rank trial reward, salvage sorting drop.", w: "https://oldschool.runescape.wiki/w/Boat_paint",
      i: { need: 1, c: "e", d: [{ n: "Deep sea trawling / salvage sorting", r: 8, k: 1, u: "hours" }], note: "Angler's paint drops from deep sea trawling, salvor's from sorting martial salvage, barracuda from Marlin-rank Barracuda Trials — but only if you hit the target time. Trawling and salvaging are the low-effort routes since they run alongside normal Sailing; barracuda is fastest if someone can already hit Marlin times." } }),
    t("Jubbly Master", "Complete the Jubbly Jive Marlin in 4:25", { s: "Challenge", r: "N/A — challenge", ch: 1 }),
    t("Tore a Tendon", "Get 1x Aquanite Tendon", { s: "Aquanites (Ynysdail Cavern)", r: "1/750 on a Slayer task, 1/3,500 off task. Elder aquanites roll it three times at 1/750.", w: "https://oldschool.runescape.wiki/w/Aquanite_tendon",
      i: { need: 1, c: "w", d: [
        { n: "Aquanites — on task", r: 750, k: 70 },
        { n: "Aquanites — off task", r: 3500, k: 70 }
      ], note: "Off task is nearly five times worse, so this only makes sense on a task — 78 Slayer and 73 Sailing to get in. Superior elder aquanites roll the tendon three times. It trades around 170k." } }),
    t("Gryphon Gryphoff", "Get 1x Jar of Feathers", { s: "Shellbane Gryphon (The Great Conch)", r: "1/2,000 from the Shellbane Gryphon.", w: "https://oldschool.runescape.wiki/w/Jar_of_feathers",
      i: { need: 1, c: "w", d: [{ n: "Shellbane Gryphon", r: 2000, k: 25 }], note: "Boss-only and on task only, at jar rarity — this is the longest tile on the board on paper. Untradeable, so there's no shortcut. Only worth starting if someone is already grinding gryphon tasks." } }),
    t("Piece of Sheet", "Get 10x Dragon Metal Sheets", { s: "Frost dragons / lava strykewyrms / krakens", r: "Frost dragon 1/100 (1/40 on task); lava strykewyrm 1/115 (1/45 on task); vampyre kraken 1/80 (1/40 on bounty); great white 1/200 (1/100).", w: "https://oldschool.runescape.wiki/w/Dragon_metal_sheet",
      i: { need: 10, c: "w", d: [
        { n: "Lava strykewyrms — on task", r: 45, k: 65 },
        { n: "Frost dragons — on task", r: 40, k: 55 },
        { n: "Vampyre kraken — on bounty", r: 40, k: 20 }
      ], note: "On-task and bounty rates are roughly 2.5× the base, so never chase these off task. Lost ironwood crates also give one at 1/8 while salvaging. Sheets trade around 195k each, so ten is about 2M on the GE — check whether buying counts before anyone commits a day to it." } }),
    t("Its Was This Big", "Get 1x Sailing Big Fish", { s: "Challenge", r: "N/A unless the organizer provides a source.",
      i: { c: "u", note: "No rate on record." } })
  ]},
  { id: "south_east", name: "Wilderness", tiles: [
    t("Killing the Ghosts", "Get 1x Revenant Weapon / Amulet of Avarice", { s: "Revenants", r: "Weapon rates vary by weapon and revenant; Amulet of avarice is a separate tertiary.", w: "https://oldschool.runescape.wiki/w/Revenants",
      i: { need: 1, c: "e", d: [
        { n: "Revenant dragons", r: 900, k: 45 },
        { n: "Revenant orks", r: 1400, k: 70 }
      ], note: "Weapon-seed and avarice rates scale with the revenant's combat level. Wilderness risk is the real cost here, not the rate." } }),
    t("Wardn't you Believe it?", "Complete either Wildy Ward", { s: "Chaos Fanatic, Crazy archaeologist, Scorpia", r: "Shard pre-roll is 1/128 a kill, split between odium and malediction — about 1/256 for a named shard.", w: "https://oldschool.runescape.wiki/w/Malediction_ward",
      i: { need: 3, c: "e", fix: 15, d: [{ n: "Wilderness bosses — one shard each", r: 256, k: 45 }], note: "Shards 1, 2 and 3 come from the Chaos Fanatic, Crazy archaeologist and Scorpia, and all three must be the same ward. Either ward counting gives some slack on mismatched types, so call it ~15 h split across the three bosses. Wilderness risk is the real cost." } }),
    t("Chaos Chaos!", "Get 1x Dragon 2H from the Chaos Elemental", { s: "Chaos Elemental", r: "1/128", w: "https://oldschool.runescape.wiki/w/Dragon_2h_sword",
      i: { need: 1, c: "w", d: [{ n: "Chaos Elemental", r: 128, k: 30 }], note: "Deep wilderness, so expect the kill rate to drop whenever you get crashed." } }),
    t("Respect your Elders", "Get Full Elder Chaos Robes", { s: "Elder Chaos Druids", r: "Individual robe pieces have separate rates.", w: "https://oldschool.runescape.wiki/w/Elder_chaos_robes",
      i: { c: "e", fix: 11, d: [{ n: "Elder chaos druids (per piece)", r: 606, k: 100 }], note: "Three pieces at 1/606 each with duplicates possible — around 1,100 kills for the set." } }),
    t("Corporeal Challenge", "Complete a solo Corp kill in gear less than 2m GP, food not included", { s: "Corporeal Beast", r: "N/A — challenge", w: "https://oldschool.runescape.wiki/w/Corporeal_Beast", ch: 1 }),
    t("I hate the Wildy", "Get 2x any Wilderness Rings", { s: "Wilderness bosses", r: "Depends on boss/ring — no single combined rate.",
      i: { need: 2, c: "w", d: [
        { n: "Callisto / Venenatis / Vet'ion", r: 512, k: 28 },
        { n: "Artio / Spindel / Calvar'ion (singles)", r: 716, k: 45 }
      ], note: "Each boss drops its own ring. The singles-plus variants are rarer per kill but much faster and far safer." } }),
    t("Korasi Killer", "Get 1x Voidwaker Piece", { s: "Wilderness bosses", r: "1/360 for a specific piece from the relevant main Wilderness bosses.", w: "https://oldschool.runescape.wiki/w/Voidwaker",
      i: { need: 1, c: "w", d: [
        { n: "Callisto / Venenatis / Vet'ion", r: 360, k: 28 },
        { n: "Artio / Spindel / Calvar'ion (singles)", r: 500, k: 45 }
      ], note: "Each boss drops one specific piece — blade, hilt or gem — so any of the three completes this tile." } }),
    t("Pick Me", "Get 2x Dragon Pickaxes from any Wildy Boss", { s: "Wilderness bosses", r: "Main bosses 1/256; Artio/Spindel/Calvar'ion 1/358.", w: "https://oldschool.runescape.wiki/w/Dragon_pickaxe",
      i: { need: 2, c: "w", d: [
        { n: "Callisto / Venenatis / Vet'ion", r: 256, k: 28 },
        { n: "Artio / Spindel / Calvar'ion (singles)", r: 358, k: 45 }
      ] } }),
    t("Upgrade!", "Get 1x Revenant Weapon Upgrade", { s: "Callisto / Venenatis / Vet'ion (or their singles versions)", r: "Claws, fangs or skull at 1/196 from the deep-wilderness bosses, 1/358 from Artio, Spindel and Calvar'ion.", w: "https://oldschool.runescape.wiki/w/Claws_of_callisto",
      i: { need: 1, c: "w", d: [
        { n: "Callisto / Venenatis / Vet'ion (deep wild)", r: 196, k: 30 },
        { n: "Artio / Spindel / Calvar'ion (singles)", r: 358, k: 45 }
      ], note: "Claws of Callisto, fangs of Venenatis and skull of Vet'ion upgrade the chainmace, bow and sceptre respectively — any one of the three clears the tile, so kill whichever boss the team is set up for." } })
  ]}
];

// Bridges sit ON the border between two adjacent regions, so the board is a 3x3
// graph: every region has up to four of them (north / east / south / west), and
// an edge region simply has none on the sides where there is no neighbour.
//
// They are TWO-WAY. A bridge is crossable from whichever of its two regions is
// already unlocked, and clearing it opens the other one. If both sides end up
// unlocked through other routes the bridge is redundant — it leads nowhere new.
//
// `between` is in board order: [top, bottom] for stacked regions, [left, right]
// for side-by-side ones. The prereq is NOT stored: it is the tile facing the
// bridge in the region you cross from — bottom-middle / top-middle for stacked
// regions, middle-right / middle-left for side-by-side ones — derived by
// bridgePrereq() in scoring.ts.
export const BRIDGES: Bridge[] = [
  // ---- left-right neighbours, top row ----
  { id: "bridge_lil_champion", name: "Lil Champion", o: "Get 1x Champion Scroll", between: ["north_west", "north"], s: "Champions' Challenge", r: "Rate not on record yet — pending leader input.", w: "https://oldschool.runescape.wiki/w/Champion%27s_scroll" },
  { id: "bridge_big_champion", name: "Big Champion", o: "Find a non-teammate cheesecapper and submit to #champions-guild", between: ["north", "north_east"], s: "Champions' Guild", r: "N/A — challenge" },

  // ---- top-bottom neighbours, top row into middle row ----
  { id: "bridge_obsidian_breaker", name: "Obsidian Breaker", o: "Get 1x Obsidian Armor Piece from TzHaar", between: ["north_west", "west"], s: "TzHaar-Ket", r: "Obsidian helmet / platebody / platelegs each 1/2,000", w: "https://oldschool.runescape.wiki/w/TzHaar-Ket",
    i: { need: 1, c: "w", d: [{ n: "TzHaar-Ket (any of the three pieces)", r: 667, k: 50 }], note: "Helmet, platebody and platelegs are 1/2,000 each — any one clears the bridge, so ≈ 1/667 a kill." } },
  { id: "bridge_traditional_start", name: "Traditional Start", o: "Get 1x Zulrah Unique", between: ["north", "central"], s: "Zulrah", r: "Depends on the specific unique table — not reduced to one rate.", w: "https://oldschool.runescape.wiki/w/Zulrah",
    i: { need: 1, c: "e", d: [{ n: "Zulrah (any unique)", r: 330, k: 25 }], note: "Tanzanite fang, magic fang and serpentine visage are 1/1,024 each, plus the jar and mutagens — combined ≈ 1/330 a kill." } },
  { id: "bridge_maggot_monarch", name: "Maggot Monarch", o: "Get 1x Crimson Kisten / Elder Venator Fang", between: ["north_east", "east"], s: "Maggot King (Vampyrium)", r: "Elder venator fang 1/340, Crimson kisten 1/520 — any unique 1/205.6 per open-stomach kill.", w: "https://oldschool.runescape.wiki/w/Maggot_King",
    i: { need: 1, c: "w", d: [
      { n: "Maggot King — melee/magic setup", r: 205.6, k: 22 },
      { n: "Maggot King — ranged setup", r: 205.6, k: 18 }
    ], note: "Elder venator fang 1/340 and crimson kisten 1/520 — either clears the bridge, so ≈ 1/206 a kill. Loot with \"open-stomach\"; \"take-eggs\" rolls neither." } },

  // ---- left-right neighbours, middle row ----
  { id: "bridge_m_lady", name: "M'Lady", o: "Get 1x Fedora", between: ["west", "central"], s: "Crazy Archaeologist", r: "1/128", w: "https://oldschool.runescape.wiki/w/Crazy_archaeologist",
    i: { need: 1, c: "w", d: [{ n: "Crazy Archaeologist", r: 128, k: 40 }], note: "Cheapest bridge on the board. Someone should just do this." } },
  // Same as the Misthlain/Open Waters border: "Rune Reaper" is central's
  // middle-right TILE, the prereq facing this border, not a bridge of its own.
  { id: "bridge_central_east_unknown", name: "???", o: "???", between: ["central", "east"], mystery: 1 },

  // ---- top-bottom neighbours, middle row into bottom row ----
  { id: "bridge_south_west_unknown", name: "???", o: "???", between: ["west", "south_west"], mystery: 1 },
  // Not a bridge of its own: "Abyssal Cryer" is central's bottom-middle TILE, which
  // is the prereq facing this border. The bridge itself is still to be announced.
  { id: "bridge_central_south_unknown", name: "???", o: "???", between: ["central", "south"], mystery: 1 },
  { id: "bridge_south_east_unknown", name: "???", o: "???", between: ["east", "south_east"], mystery: 1 },

  // ---- left-right neighbours, bottom row ----
  { id: "bridge_south_unknown", name: "???", o: "???", between: ["south_west", "south"], mystery: 1 },
  { id: "bridge_deep_south_unknown", name: "???", o: "???", between: ["south", "south_east"], mystery: 1 }
];

export const ROSTER: string[] = ["JustAWeasel", "BZBT", "Shear Stress", "JadsNads", "Nyaagrill", "Silken7", "ThreeMoon", "SmellyCrust", "Jimbo Bean", "Aravick", "Joshrules151", "Coltpire", "Solostein", "Trekly", "Njdesmarais"];

// Predefined leaders. Picking any of these characters grants leader controls, no
// code needed. "Wetfrog1998" is the organiser and is not one of the 15 roster
// players, so it is offered in the picker in addition to the roster. Anyone can
// also be promoted by setting players.is_leader = true in the database.
export const LEADER_NAMES: string[] = ["Wetfrog1998", "JustAWeasel"];

/** Names offered on the identity picker: the roster plus any extra leader names. */
export const SELECTABLE_NAMES: string[] = [
  ...ROSTER,
  ...LEADER_NAMES.filter((n) => !ROSTER.includes(n)),
];

export function isLeaderPlayer(player: { name: string; is_leader?: boolean }): boolean {
  return !!player.is_leader || LEADER_NAMES.includes(player.name);
}

// Rules the leader posted, grouped. `tiles` on an item lists the tile ids the rule
// actually lands on, so the rules tab can say where each one applies.
export const RULE_SECTIONS: RuleSection[] = [
  { id: "scoring", title: "SCORING", items: [
    { text: "Completing a row or column awards 5 points." },
    { text: "Completing the middle tile awards 3 points." },
    { text: "Individual tiles (except middle) do not give any points." },
    { text: "Bridge tiles give no points." },
    { text: "Diagonals do not count because they are stupid." },
    { text: "Blacking out any section awards 40 total points (this is just an additional 7 points, not 40 additional points)." }
  ]},
  { id: "bridges", title: "BRIDGES & UNLOCKING", items: [
    { text: "Every border between two neighbouring regions has one bridge on it. A region has up to four (north, east, south and west); the ones on the outside of the board have fewer, because there is no region on that side." },
    { text: "You must complete the tile next to the bridge to unlock the bridge tile, which will in turn unlock the new region." },
    { text: "You only need to complete the tile into the bridge, you don't need to complete each tile next to it." },
    { text: "Bridges go both ways. You cross from whichever of its two regions is already open, and clearing it opens the other one." },
    { text: "If both of a bridge's regions end up open through other routes, that bridge is redundant — clearing it opens nothing new." }
  ]},
  { id: "pets", title: "PETS", items: [
    { text: "Pets will complete any tile with a few exceptions." },
    { text: "Middle challenge tiles cannot be completed with pets." },
    { text: "Pets can only complete 1 tile, you must choose which tile it completes." },
    { text: "Getting a pet must be used immediately! No saving and waiting." },
    { text: "Thieving pet → Return the Sceptre", tiles: ["return_the_sceptre"] },
    { text: "Abyssal Protector → Thread the Needle", tiles: ["thread_the_needle"] },
    { text: "Any DKS pet → Axe Enthusiast or Lord of the Rings", tiles: ["axe_enthusiast", "lord_of_the_rings"] },
    { text: "RC pet → Astral Projections", tiles: ["astral_projection"] },
    { text: "Agility pet → Monkey Business", tiles: ["monkey_business"] },
    { text: "Heron → Evil Ass Task or Dread It, Run From It", tiles: ["evil_ass_task", "dread_it_run_from_it"] },
    { text: "Olmlet → The CM Experience or Missing My Top", tiles: ["the_cm_experience", "missing_my_top"] },
    { text: "Skotizo → The CM Experience", tiles: ["the_cm_experience"] },
    { text: "Nexling → The Nex Tile or Godwars General", tiles: ["the_nex_tile", "godwars_general"] },
    { text: "Queztin → Temu Salamander or I've Heard Something", tiles: ["temu_salamander", "i_ve_heard_something"] },
    { text: "Callisto / Vetion / Venanatis → Upgrade! or Pick Me or Korasi Killer or I hate the Wildy", tiles: ["upgrade", "pick_me", "korasi_killer", "i_hate_the_wildy"] },
    { text: "Soup → Paint Me or It was this Big", tiles: ["paint_me", "its_was_this_big"] },
    { text: "Giant Squirrel → Agility Time 🙁", tiles: ["agility_time"] },
    { text: "All of the bosses should be pretty self explanatory." }
  ]},
  { id: "stacking", title: "NO PRE-STACKING", items: [
    { text: "NO PRE STACKING THIS EVENT. Do not hoard hunter loot sacks or prepot a purple chest. Thats a dick move. I will ban you. I have power and I will abuse it. If found to be a dick, you will be promptly removed (banned)." },
    { text: "No stacking clue caskets before the event. But you can do into the bingo with clue scrolls." },
    { text: "You can prepot a barrows and a CG chest!", tiles: ["me_and_my_brothers"] }
  ]},
  { id: "proof", title: "PROOF & SCREENSHOTS", items: [
    { text: "Before doing any tiles that could be stacked, you'll need to post a photo of your bank with that item." },
    { text: "You must screenshot tempoross / WT points beforehand!", tiles: ["temp_tome_time", "the_cold_of_the_todt"] },
    { text: "You must screenshot MTA points beforehand!", tiles: ["plug_prepper"] },
    { text: "Astral Runes are a good faith tile. Come on, don't be a dick.", tiles: ["astral_projection"] },
    { text: "All challenge tiles require screenshots of your gear / inventory beforehand." },
    { text: "The gear value challenges need to have your loot put into the value options shown below.", tiles: ["budget_150_s", "sol_creditt", "the_416_special", "corporeal_challenge"] },
    { text: "Screenshots need to be taken for agility laps as well.", tiles: ["monkey_business"] }
  ]}
];

// Rules that belong to one tile. Shown on the tile itself (? marker) and in its drawer.
export const TILE_RULES: Record<string, string[]> = {
  return_the_sceptre: ["Pet: a Thieving pet completes this tile."],
  thread_the_needle: ["Pet: the Abyssal Protector completes this tile."],
  axe_enthusiast: ["You can get these from WT if you really want lol.", "Pet: any DKS pet completes this tile."],
  lord_of_the_rings: ["Counts: Warriors Ring, Berserkers Ring, Archers Rings, Seers Rings.", "Pet: any DKS pet completes this tile."],
  astral_projection: ["No extracts.", "Astral Runes are a good faith tile. Come on, don't be a dick.", "Pet: the RC pet completes this tile."],
  monkey_business: ["Screenshot laps beforehand.", "Pet: the Agility pet completes this tile."],
  monkey_business_3: ["Light or Heavy Frame works."],
  evil_ass_task: ["Pet: the Heron completes this tile."],
  dread_it_run_from_it: ["Pet: the Heron completes this tile."],
  the_cm_experience: ["Pet: the Olmlet or Skotizo completes this tile."],
  missing_my_top: ["Pet: the Olmlet completes this tile."],
  the_nex_tile: ["Pet: the Nexling completes this tile."],
  godwars_general: ["Counts: Sara Sword, Sara Light, ACB, Any Hilt, Bandos Armor, Armadyl Armor, Steam Battlestaff, Zamorakian Spear, Any Nex Drop.", "Pet: the Nexling completes this tile."],
  temu_salamander: ["Pet: the Queztin completes this tile."],
  i_ve_heard_something: ["Pet: the Queztin completes this tile."],
  upgrade: ["Pet: Callisto, Vetion or Venanatis completes this tile."],
  pick_me: ["Pet: Callisto, Vetion or Venanatis completes this tile."],
  korasi_killer: ["Pet: Callisto, Vetion or Venanatis completes this tile."],
  i_hate_the_wildy: ["Pet: Callisto, Vetion or Venanatis completes this tile."],
  paint_me: ["Pet: the Soup completes this tile."],
  its_was_this_big: ["Pet: the Soup completes this tile."],
  agility_time: ["Pet: the Giant Squirrel completes this tile."],
  me_and_my_brothers: ["Needs to be a complete set, full karils etc.", "You can prepot a barrows chest."],
  my_personal_nightmare: ["Inq Mace counts as an inq piece."],
  bloody_bad_time: ["Multi blood shards count as 2."],
  temp_tome_time: ["You must screenshot Tempoross points beforehand."],
  the_cold_of_the_todt: ["You must screenshot Wintertodt points beforehand."],
  plug_prepper: ["You must screenshot MTA points beforehand."],
  budget_150_s: ["Gear value challenge: your loot must be put into the value options shown in the rules."],
  sol_creditt: ["Gear value challenge: your loot must be put into the value options shown in the rules."],
  the_416_special: ["Gear value challenge: your loot must be put into the value options shown in the rules."],
  corporeal_challenge: ["Gear value challenge: your loot must be put into the value options shown in the rules."]
};

export const FREE_SPACE = "free_space";

/** The three mega-rares tracked in the gear check. */
export const RARES = [
  { id: "scythe", name: "Scythe of vitur", img: "/sprites/scythe_of_vitur.png" },
  { id: "shadow", name: "Tumeken's shadow", img: "/sprites/tumekens_shadow.png" },
  { id: "tbow", name: "Twisted bow", img: "/sprites/twisted_bow.png" },
] as const;

export type RareId = (typeof RARES)[number]["id"];
