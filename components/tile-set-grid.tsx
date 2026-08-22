"use client";

import Image from "next/image";
import { useApp, patchContribs } from "./app-provider";
import { useConfirm } from "./confirm";
import { toggleItem } from "@/app/actions";
import {
  progressSpec,
  itemOwners,
  setProgress,
  leadingSet,
  completedSet,
  derivedCounts,
  type Target,
  type SetProgress,
} from "@/lib/scoring";
import type { ItemDef, ItemSet } from "@/lib/board-data";
import { cn } from "@/lib/cn";

/**
 * The box UI for a `sets` tile: pieces down, sets across, tap the piece you got.
 *
 * Me and My Brothers is the tile this exists for, and it exists because the list of
 * four generic boxes it used to have could not describe what actually happens. A
 * Barrows chest gives a random piece of a random brother; duplicates are worthless;
 * nobody can target a set, so the set the team finishes is decided by what fell. The
 * team had been tracking it as a picture with the pieces crossed off — this is that
 * picture, with the app doing the arithmetic:
 *
 *  - every one of the 24 pieces is its own box, owned by whoever got it
 *  - the readout follows the set that is closest (leadingSet), so 2/4 means two
 *    pieces of ONE brother, never "two pieces, somewhere"
 *  - the fourth piece of any brother finishes the tile, and the four people who got
 *    those pieces are the four contributors — which is why ticking a box rewrites the
 *    whole breakdown rather than nudging one number (derivedCounts)
 *
 * A ticked piece is marked with a ✓ rather than the paint-over red X of the original
 * picture: red is the danger colour everywhere else in this skin, and green already
 * means "got it" on every other box on the board.
 */
export function SetGrid({
  target,
  canProgress,
  isDone,
  name,
}: {
  target: Target;
  canProgress: boolean;
  isDone: boolean;
  name: string;
}) {
  const { state, me, isLeader, playerName, run } = useApp();
  const confirm = useConfirm();

  const id = target.id;
  const uid = me?.id ?? "";
  const spec = progressSpec(target);
  const owners = itemOwners(state.items, id);
  const sets = setProgress(target, owners);
  const lead = leadingSet(target, owners);
  const finished = completedSet(target, owners);

  // A finished tile drops the grid entirely: the objective was one set and the only
  // thing left worth saying is which one, and who got it. The 24 boxes at that point
  // are 20 pieces of noise around the answer.
  if (isDone) {
    return <Finished owners={owners} set={finished ?? lead?.set ?? null} />;
  }

  const tick = async (item: ItemDef, set: SetProgress) => {
    const owner = owners[item.k] ?? null;
    const on = !owner;
    const enabled = canProgress && !!uid && (on || owner === uid || isLeader);
    if (!enabled) return;

    if (on && set.ticks + 1 >= spec.goal) {
      const ok = await confirm({
        title: "COMPLETE TILE?",
        message: `${item.n} finishes ${set.set.n} and marks "${name}" done. Are you sure?`,
        confirmLabel: "COMPLETE IT",
      });
      if (!ok) return;
    }
    if (!on && owner !== uid) {
      const ok = await confirm({
        title: "REMOVE TICK?",
        message: `This removes ${playerName(owner!)}'s ${item.n}.`,
        confirmLabel: "REMOVE IT",
        tone: "danger",
      });
      if (!ok) return;
    }

    // The whole breakdown, not a delta: one tick can change which set leads, and
    // that changes what every other player's pieces are worth. Same arithmetic the
    // server recounts with (recountSetTile in app/actions.ts).
    const next = { ...owners };
    if (on) next[item.k] = uid;
    else delete next[item.k];
    run(
      () => toggleItem(id, item.k, on),
      patchContribs(id, { counts: derivedCounts(target, next), owners: next }, spec.goal),
    );
  };

  const ticked = sets.flatMap((s) =>
    s.set.items.filter((i) => owners[i.k]).map((i) => ({ item: i, owner: owners[i.k] })),
  );

  return (
    <div className="grid gap-[8px]">
      <div
        className="grid gap-[3px]"
        style={{ gridTemplateColumns: `repeat(${sets.length}, minmax(0, 1fr))` }}
        // Not role="grid": these are plain divs with no row structure under them, and
        // a grid that lies about its shape is worse to navigate than a labelled group
        // of checkboxes, which is what each cell already announces itself as.
        role="group"
        aria-label={`${name} — one column per set, one row per slot`}
      >
        {sets.map((s) => (
          <div
            key={`h-${s.set.k}`}
            className={cn(
              "truncate text-center font-mono text-[9px] leading-[14px]",
              s.set === lead?.set && lead.ticks > 0 ? "text-orange" : "text-ink-faint",
            )}
          >
            {s.set.short}
          </div>
        ))}

        {/* Row-major so the DOM order reads the way the grid looks: all the helms,
            then all the bodies. The slot labels are in the cell's aria-label rather
            than a leading column — six columns already leave a phone about 50px per
            cell, and the sprites are the whole point of the layout. */}
        {spec.slots.map((slot, row) =>
          sets.map((s) => (
            <PieceCell
              key={s.set.items[row].k}
              item={s.set.items[row]}
              slot={slot}
              set={s}
              owner={owners[s.set.items[row].k] ?? null}
              uid={uid}
              isLeader={isLeader}
              canProgress={canProgress}
              playerName={playerName}
              onClick={() => void tick(s.set.items[row], s)}
            />
          )),
        )}

        {sets.map((s) => (
          <div
            key={`f-${s.set.k}`}
            className={cn(
              "text-center font-mono text-[10px] leading-[16px]",
              s.ticks === 0
                ? "text-ink-faint"
                : s.set === lead?.set
                  ? "text-yellow"
                  : "text-ink-dim",
            )}
          >
            {s.ticks}/{spec.goal}
          </div>
        ))}
      </div>

      {ticked.length > 0 && (
        <div className="grid gap-[3px] border-t border-border-dim pt-[8px]">
          <div className="font-mono text-[11px] text-ink-dim">WHO GOT WHAT</div>
          {ticked.map(({ item, owner }) => (
            <div key={item.k} className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="min-w-0 truncate text-ink-dim2">{item.n}</span>
              <span
                className={cn(
                  "shrink-0 font-mono text-[12px]",
                  owner === uid ? "text-green-soft" : "text-ink-dim",
                )}
              >
                {owner === uid ? "you" : playerName(owner!)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="text-[13px] leading-[1.35] text-ink-dim">
        {canProgress
          ? "Tap whatever dropped. Any four of one brother finishes the tile — a piece outside that set still counts the moment its own set takes the lead."
          : "Hit “I’m on this” below to mark pieces."}
      </div>
    </div>
  );
}

function PieceCell({
  item,
  slot,
  set,
  owner,
  uid,
  isLeader,
  canProgress,
  playerName,
  onClick,
}: {
  item: ItemDef;
  slot: string;
  set: SetProgress;
  owner: string | null;
  uid: string;
  isLeader: boolean;
  canProgress: boolean;
  playerName: (id: string) => string;
  onClick: () => void;
}) {
  const ticked = !!owner;
  const isMine = ticked && owner === uid;
  // Ticking is free; unticking belongs to whoever ticked it, or a leader — the same
  // rule as every other box on the board (ItemBox in tile-progress.tsx).
  const enabled = canProgress && !!uid && (!ticked || isMine || isLeader);

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={ticked}
      aria-label={
        `${item.n}, ${set.set.n} ${slot.toLowerCase()}` +
        (ticked ? `, got it — ${isMine ? "you" : playerName(owner!)}` : ", not yet")
      }
      title={item.n + (ticked ? ` · ${isMine ? "you" : playerName(owner!)}` : "")}
      disabled={!enabled}
      onClick={onClick}
      className={cn(
        "relative flex aspect-square min-h-[44px] items-center justify-center border-2 p-[2px]",
        enabled && "cursor-pointer",
        isMine
          ? "mine-gradient border-green-border2"
          : ticked
            ? "border-green-border bg-green-bg3"
            : enabled
              ? "border-border-default bg-surface-btn"
              : "border-border-dim bg-surface-inset",
      )}
    >
      {item.img && (
        <Image
          src={item.img}
          alt=""
          width={32}
          height={32}
          className={cn(
            "pixelated h-full w-full object-contain",
            // Unticked pieces sit back rather than disappear, so the grid still reads
            // as the full set of what could drop — which is the thing the team's
            // picture was for.
            ticked ? "opacity-100" : "opacity-40",
          )}
        />
      )}
      {ticked && (
        <span
          aria-hidden
          className="absolute right-[-2px] bottom-[-2px] border border-green-border bg-green-bg px-[2px] font-mono text-[9px] leading-[11px] text-green-soft"
        >
          ✓
        </span>
      )}
    </button>
  );
}

/**
 * What is left once the tile is done: the set that got there, its four pieces, and
 * the four people who are credited for them.
 */
function Finished({
  owners,
  set,
}: {
  owners: Record<string, string>;
  set: ItemSet | null;
}) {
  const { me, playerName } = useApp();
  const uid = me?.id ?? "";

  if (!set) {
    // Marked done without a set behind it — a leader's force-done on an untouched
    // tile, or a completion that predates this grid.
    return (
      <div className="border-2 border-green-border bg-green-bg3 p-[10px] text-[14px] leading-[1.35] text-green-soft2">
        Marked done. No pieces are recorded against it.
      </div>
    );
  }

  return (
    <div className="grid gap-[8px] border-2 border-green-border bg-green-bg3 p-[10px]">
      <div>
        <div className="font-mono text-[11px] text-green-soft">FULL SET</div>
        <div className="mt-[4px] text-[16px] leading-[1.2] text-green-text">{set.n}</div>
      </div>
      <div className="grid gap-[6px]">
        {set.items.map((item) => {
          const owner = owners[item.k] ?? null;
          return (
            <div key={item.k} className="flex items-center gap-[9px]">
              {item.img && (
                <Image
                  src={item.img}
                  alt=""
                  width={34}
                  height={34}
                  className="pixelated h-[34px] w-[34px] flex-none object-contain"
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] leading-[1.2] text-green-text2">
                  {item.n}
                </span>
                <span className="mt-[2px] block truncate font-mono text-[12px] text-green-soft2">
                  {owner ? (owner === uid ? "you" : playerName(owner)) : "nobody recorded"}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
