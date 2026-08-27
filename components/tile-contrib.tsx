"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { useApp, patchContribs } from "./app-provider";
import { setTileContribs, setTileItemOwners } from "@/app/actions";
import {
  progressSpec,
  itemOwners,
  tickCredit,
  derivedCounts,
  fmtNum,
  type Target,
} from "@/lib/scoring";
import {
  cleanContribRows,
  cleanItemOwnerRows,
  applyItemOwners,
  contribSum,
  type ItemOwnerRow,
} from "@/lib/contrib";
import { cn } from "@/lib/cn";

/**
 * The leader-only contribution editor: WHO did what on this target, as opposed to
 * how much is done.
 *
 * It exists because the automatic side only records whoever pressed the button.
 * Three crystals drop for three different people and one person logs all three; 50
 * rumours get split 10/20/20 and nobody remembers to say so. The leaders reconcile
 * that afterwards, which until now meant asking each person to re-log their own
 * count — on a finished tile, impossible.
 *
 * Three shapes, chosen from the target rather than offered as a mode:
 *
 *  - checklist  — a player picker per named box. The counts are derived from the
 *                 boxes (tickCredit), so numbers here would be a second, conflicting
 *                 source of truth.
 *  - party      — a tick per person, because the objective is one run by a fixed
 *                 group (a ToB 5-man) rather than anything anyone accumulates. Every
 *                 member is credited 1 and the goal stays "did it happen", so typing
 *                 numbers here could only ever produce the same five 1s with a
 *                 "4 OVER" warning attached. See TILE_PARTY in lib/board-data.ts.
 *  - count/bulk — a number per player, and the numbers are the record.
 *
 * A plain counter with an `alt` box ("…or just a Shadow") is both, and the two
 * disagree by rule: an `alt` owner is credited the WHOLE goal, so the numbers grid
 * hides itself while one is assigned rather than showing figures the save would
 * overwrite. See lib/contrib.ts for the validation both shapes share with the
 * server, and app/actions.ts (setTileContribs / setTileItemOwners) for the writes.
 */

/** The button in LEADER CONTROLS. */
export function ContribButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="min-h-[46px] cursor-pointer border-2 border-amber-border bg-surface-dark p-[11px] text-[14px] text-amber-body"
    >
      Fix contributions
    </button>
  );
}

interface Box {
  k: string;
  n: string;
  alt: boolean;
  /** sprite, on the tiles whose boxes are pictures (Barrows) */
  img?: string;
  /**
   * Which set the box belongs to, on a `sets` target — a heading is printed whenever
   * it changes. 24 unlabelled pickers in a row is not something a leader can steer;
   * with the six brothers called out it is six groups of four.
   */
  group?: string;
}

export function ContribEditor({
  target,
  name,
  onClose,
}: {
  target: Target;
  name: string;
  onClose: () => void;
}) {
  const { players, state, run } = useApp();
  const id = target.id;
  const spec = progressSpec(target);
  const goal = spec.goal;

  const savedCounts = state.progress[id] ?? {};
  const savedOwners = itemOwners(state.items, id);
  const crew = state.claims[id] ?? [];

  const boxes: Box[] = useMemo(
    () => [
      // Grouped where the target has sets, otherwise the flat list of items — either
      // way in the same order the tile renders them, so a leader reads down the
      // popup and down the tile the same way.
      ...(spec.sets.length
        ? spec.sets.flatMap((set) =>
            set.items.map((i) => ({ k: i.k, n: i.n, img: i.img, alt: false, group: set.n })),
          )
        : spec.items.map((i) => ({ k: i.k, n: i.n, img: i.img, alt: false }))),
      ...spec.alt.map((i) => ({ k: i.k, n: i.n, img: i.img, alt: true })),
    ],
    [spec.sets, spec.items, spec.alt],
  );

  // "" means nobody owns that box — the value a <select> can actually hold.
  const [owners, setOwners] = useState<Record<string, string>>(() =>
    Object.fromEntries(boxes.map((b) => [b.k, savedOwners[b.k] ?? ""])),
  );
  // Kept as typed text, not numbers: a controlled number input that reads back 0 for
  // an empty box fights anyone clearing a field before typing the new figure.
  const [counts, setCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(savedCounts)
        .filter(([, n]) => n > 0)
        .map(([pid, n]) => [pid, String(n)]),
    ),
  );
  // Party targets only: who was in the group. Seeded from the saved counts because
  // that is exactly how a party edit is stored — one apiece — so reopening the popup
  // reads back the same names. Nobody is seeded from the crew: "I'm on this" is an
  // intention, and this list is a statement about a run that happened.
  const [members, setMembers] = useState<string[]>(() =>
    players.filter((p) => (savedCounts[p.id] ?? 0) > 0).map((p) => p.id),
  );
  // Whose rows the numbers grid shows. Everyone with a count or on the crew to begin
  // with; the picker at the bottom adds anyone else. Not the whole 17-seat roster,
  // because a leader fixing a three-way split should not have to scroll past 14 zeroes
  // to reach the SAVE button.
  const [shown, setShown] = useState<string[]>(() => {
    const seed = new Set<string>([
      ...Object.keys(savedCounts).filter((pid) => (savedCounts[pid] ?? 0) > 0),
      ...crew,
    ]);
    return players.filter((p) => seed.has(p.id)).map((p) => p.id);
  });
  const [err, setErr] = useState("");
  const [saving, startSaving] = useTransition();

  const playerIds = players.map((p) => p.id);
  const altOwned = spec.alt.some((a) => !!owners[a.k]);
  // The party list and the numbers grid ask incompatible questions, so exactly one of
  // them shows. `alt` still overrides both, for the reason given at the top of the
  // file: its owner is credited the whole goal, so any split shown here would be
  // overwritten by the save.
  const showParty = spec.party > 0 && spec.mode !== "checklist" && !altOwned;
  const showNumbers = spec.mode !== "checklist" && !altOwned && !showParty;
  /** Whether this save writes the counts column at all. */
  const sendNumbers = showNumbers || showParty;

  const ownerRows: ItemOwnerRow[] = boxes.map((b) => ({
    itemKey: b.k,
    playerId: owners[b.k] || null,
  }));
  const ownersChanged = boxes.some((b) => (owners[b.k] || "") !== (savedOwners[b.k] ?? ""));

  // One apiece for a party target: being in the group is the whole contribution, and
  // the goal ("did it happen") is 1, so cleanContribRows keeps every member at 1.
  const countRows = cleanContribRows(
    showParty
      ? members.map((pid) => ({ playerId: pid, count: 1 }))
      : shown.map((pid) => ({ playerId: pid, count: parseInt(counts[pid] ?? "", 10) || 0 })),
    goal,
    playerIds,
  );
  const sum = showNumbers ? contribSum(countRows) : 0;

  // What the boxes are worth per player, for the read-only figure next to each name
  // on a checklist target. Same rule the server recounts with — and on a set target
  // it moves for everyone as soon as a reassignment changes which set leads, which
  // is exactly why it is derived here rather than read off the saved counts.
  const derived = useMemo(
    () =>
      derivedCounts(
        target,
        Object.fromEntries(Object.entries(owners).filter(([, v]) => v)) as Record<
          string,
          string
        >,
      ),
    [owners, target],
  );

  const setCount = (pid: string, raw: string) =>
    setCounts((c) => ({ ...c, [pid]: raw.replace(/[^0-9]/g, "").slice(0, 7) }));

  // Rebuilt in roster order rather than appended, so the list reads the same however
  // the leader ticked it — the same reason `shown` is rebuilt in addPlayer below.
  const toggleMember = (pid: string) =>
    setMembers((m) =>
      players.filter((p) => (p.id === pid ? !m.includes(pid) : m.includes(p.id))).map((p) => p.id),
    );

  const addPlayer = (pid: string) => {
    if (!pid || shown.includes(pid)) return;
    setShown((s) => players.filter((p) => s.includes(p.id) || p.id === pid).map((p) => p.id));
  };

  const dirty = ownersChanged || (sendNumbers && changedCounts(savedCounts, countRows));

  const save = () => {
    if (saving || !dirty) return;
    setErr("");
    startSaving(async () => {
      // Boxes first, numbers second. Both writes recompute the same counts column, so
      // the order decides which wins: a figure the leader typed must beat one derived
      // from a tick, and on a target where they cleared the last `alt` box the grid
      // they can now see is the one they meant to save.
      if (ownersChanged) {
        const res = await setTileItemOwners(id, cleanItemOwnerRows(ownerRows, boxes.map((b) => b.k), playerIds));
        const failed = res && "error" in res ? res.error : "";
        if (failed) {
          // Stay open — closing would throw away an edit the leader has just made by
          // hand, the same reason the proof editor reports inline.
          setErr(failed);
          return;
        }
      }
      if (sendNumbers) {
        const res = await setTileContribs(id, countRows);
        const failed = res && "error" in res ? res.error : "";
        if (failed) {
          setErr(failed);
          return;
        }
      }

      // Mirror the server's own arithmetic rather than guessing: numbers sent means the
      // grid replaced the breakdown outright; a set target is recounted whole, since
      // moving one box can change which set leads and so what everyone else's boxes
      // are worth; otherwise only the players whose boxes moved were recounted.
      const { owners: nextOwners, touched } = applyItemOwners(savedOwners, ownerRows);
      let nextCounts: Record<string, number>;
      if (sendNumbers) {
        nextCounts = Object.fromEntries(countRows.map((r) => [r.playerId, r.count]));
      } else if (spec.sets.length) {
        nextCounts = derivedCounts(target, nextOwners);
      } else {
        nextCounts = { ...savedCounts };
        for (const pid of touched) nextCounts[pid] = tickCredit(target, nextOwners, pid);
      }
      run(async () => {}, patchContribs(id, {
        counts: nextCounts,
        owners: boxes.length ? nextOwners : undefined,
      }, goal));
      onClose();
    });
  };

  const unshown = players.filter((p) => !shown.includes(p.id));

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(8,6,4,.72)] p-5">
      <button
        type="button"
        aria-label="Cancel"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Fix contributions"
        className="relative flex max-h-[86vh] w-full max-w-[520px] flex-col border-2 border-amber-border panel-gradient p-[16px] shadow-[0_0_0_2px_#17130d,0_14px_40px_rgba(0,0,0,.6)]"
      >
        <div className="font-mono text-[13px] text-orange [text-shadow:1px_1px_0_#000]">
          WHO DID WHAT
        </div>
        <div className="mt-1 mb-3 text-[13px] leading-[1.35] text-ink-dim [text-wrap:pretty]">
          {spec.mode === "checklist"
            ? `Say who got each one on "${name}". Counts follow the boxes.`
            : showParty
              ? `Tick everyone who was in the group on "${name}". It takes ${spec.party}, and all of them get credit for the tile.`
              : `Set each person's share of the ${fmtNum(goal)}${spec.unit ? " " + spec.unit : ""} on "${name}".`}
        </div>

        {/* The only scrolling region, so the footer stays above a phone keyboard */}
        <div className="grid min-h-0 flex-1 content-start gap-[8px] overflow-y-auto">
          {boxes.length > 0 && (
            <div className="grid gap-[6px]">
              {boxes.map((b, i) => (
                <div key={b.k} className="grid gap-[6px]">
                {b.group && b.group !== boxes[i - 1]?.group && (
                  <div className="mt-[4px] font-mono text-[11px] text-amber-body">
                    {b.group.toUpperCase()}
                  </div>
                )}
                <label
                  className={cn(
                    "grid gap-[5px] border-2 bg-surface-inset p-[9px]",
                    b.alt ? "border-amber-border" : "border-border-default",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-[7px]">
                      {b.img && (
                        <Image
                          src={b.img}
                          alt=""
                          width={22}
                          height={22}
                          className="pixelated h-[22px] w-[22px] flex-none object-contain"
                        />
                      )}
                      <span className="truncate text-[15px] leading-[1.2] text-ink">{b.n}</span>
                    </span>
                    {b.alt && (
                      <span className="shrink-0 border border-amber-border bg-amber-bg px-[6px] py-[3px] font-mono text-[10px] text-amber-text">
                        CLEARS IT
                      </span>
                    )}
                  </span>
                  <select
                    value={owners[b.k] ?? ""}
                    onChange={(e) => setOwners((o) => ({ ...o, [b.k]: e.target.value }))}
                    aria-label={`Who got ${b.n}`}
                    className="min-h-[48px] w-full cursor-pointer border-2 border-border-default bg-surface-inset2 p-[10px] text-[15px] text-ink"
                  >
                    <option value="">— nobody —</option>
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {derived[p.id] ? ` · ${fmtNum(derived[p.id])}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                </div>
              ))}
            </div>
          )}

          {altOwned && spec.mode !== "checklist" && (
            <div className="border-2 border-amber-border bg-amber-bg p-[9px] text-[13px] leading-[1.35] text-amber-body">
              That box clears the whole tile, so its owner is credited all{" "}
              {fmtNum(goal)}. Set it back to &ldquo;nobody&rdquo; to split the count by hand
              instead.
            </div>
          )}

          {showParty && (
            <>
              <div className="grid gap-[6px]">
                {players.map((p) => {
                  const on = members.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggleMember(p.id)}
                      className={cn(
                        "flex min-h-[52px] cursor-pointer items-center gap-[9px] border-2 p-[9px_10px] text-left",
                        on
                          ? "border-green-border2 bg-green-bg3 text-green-text2"
                          : "border-border-default bg-surface-btn text-ink",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "flex h-[24px] w-[24px] shrink-0 items-center justify-center border-2 font-mono text-[14px] leading-none",
                          on
                            ? "border-green-border bg-green-bg text-green-soft"
                            : "border-border-default bg-surface-inset text-ink-faint",
                        )}
                      >
                        {on ? "✓" : ""}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] leading-[1.2]">{p.name}</span>
                        <span className="mt-[2px] block truncate font-mono text-[12px] text-ink-faint">
                          {on ? "in the group" : "not in it"}
                          {p.linked ? "" : " · not signed in"}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div
                className={cn(
                  "border-2 p-[9px] font-mono text-[12px]",
                  members.length > spec.party
                    ? "border-red-border bg-red-bg text-red-text"
                    : "border-border-default bg-surface-inset text-ink-dim2",
                )}
              >
                {members.length} OF {spec.party} CREDITED
                {members.length > spec.party
                  ? ` · ${members.length - spec.party} MORE THAN IT TAKES`
                  : members.length < spec.party
                    ? ` · ${spec.party - members.length} STILL MISSING`
                    : " · FULL GROUP"}
              </div>
            </>
          )}

          {showNumbers && (
            <>
              {shown.length === 0 && (
                <div className="text-[13px] leading-[1.35] text-ink-dim">
                  Nobody is on this yet — add whoever did it below.
                </div>
              )}
              {shown.map((pid) => {
                const p = players.find((x) => x.id === pid);
                if (!p) return null;
                const was = savedCounts[pid] ?? 0;
                return (
                  <div
                    key={pid}
                    className="flex items-center gap-[8px] border-2 border-border-default bg-surface-inset p-[9px]"
                  >
                    <label className="min-w-0 flex-1" htmlFor={`contrib-${pid}`}>
                      <span className="block truncate text-[15px] leading-[1.2] text-ink">
                        {p.name}
                      </span>
                      <span className="mt-[2px] block font-mono text-[12px] text-ink-faint">
                        {was ? `was ${fmtNum(was)}` : "nothing logged"}
                        {p.linked ? "" : " · not signed in"}
                      </span>
                    </label>
                    <input
                      id={`contrib-${pid}`}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      enterKeyHint="done"
                      value={counts[pid] ?? ""}
                      onChange={(e) => setCount(pid, e.target.value)}
                      placeholder="0"
                      className="min-h-[48px] w-[86px] shrink-0 border-2 border-border-default bg-surface-inset2 p-[10px] text-center font-mono text-[16px] text-ink placeholder:text-ink-faint"
                    />
                  </div>
                );
              })}

              {unshown.length > 0 && (
                <select
                  value=""
                  onChange={(e) => addPlayer(e.target.value)}
                  aria-label="Add someone who contributed"
                  className="min-h-[48px] w-full cursor-pointer border-2 border-border-default bg-surface-dark p-[10px] font-mono text-[12px] text-ink-dim2"
                >
                  <option value="">+ ADD SOMEONE</option>
                  {unshown.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}

              <div
                className={cn(
                  "border-2 p-[9px] font-mono text-[12px]",
                  sum > goal
                    ? "border-red-border bg-red-bg text-red-text"
                    : "border-border-default bg-surface-inset text-ink-dim2",
                )}
              >
                SUM {fmtNum(sum)} / {fmtNum(goal)}
                {sum > goal
                  ? ` · ${fmtNum(sum - goal)} OVER`
                  : sum < goal
                    ? ` · ${fmtNum(goal - sum)} SHORT`
                    : " · EXACT"}
              </div>
            </>
          )}
        </div>

        {err && (
          <div className="mt-3 border-2 border-red-border bg-red-bg p-[9px] text-[13px] leading-[1.35] text-red-text">
            {err}
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[46px] flex-1 cursor-pointer border-2 border-border-default bg-surface-dark p-[11px] font-mono text-[12px] text-ink-dim"
          >
            CANCEL
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="min-h-[46px] flex-1 cursor-pointer border-2 border-green-border2 bg-green-bg2 p-[11px] font-mono text-[12px] text-green-text2 disabled:cursor-default disabled:opacity-50"
          >
            {saving ? "SAVING…" : "SAVE"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Whether the numbers grid differs from what is stored. Compared against the CLEANED
 * rows, so typing "007" over a 7 or clearing an already-empty field leaves SAVE
 * disabled instead of firing a write that changes nothing.
 */
function changedCounts(
  saved: Record<string, number>,
  rows: readonly { playerId: string; count: number }[],
): boolean {
  const was = Object.entries(saved).filter(([, n]) => n > 0);
  if (was.length !== rows.length) return true;
  const next = new Map(rows.map((r) => [r.playerId, r.count]));
  return was.some(([pid, n]) => next.get(pid) !== n);
}
