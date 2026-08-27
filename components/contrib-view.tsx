"use client";

import { useApp } from "./app-provider";
import { findTarget, goalOf, progressTotal, fmtCompact } from "@/lib/scoring";
import { cn } from "@/lib/cn";

/**
 * The contributions page: how many TILES each person has put work into.
 *
 * The unit is deliberately the tile, not the count. Every tile's number means
 * something different — 10,000 astral runes, 500 monkey laps, 1 dragon warhammer —
 * so summing them across tiles measures nothing: it used to rank whoever happened to
 * be on the rune grind above everybody else on the board put together, and read
 * "6,000 logged" as if that were six thousand contributions rather than one
 * participation tile. A tile counts once for each person who worked on it, and the
 * per-tile figure stays on its own row where its goal is next to it and it means
 * what it says.
 */

interface Row {
  id: string;
  name: string;
  region: string;
  mine: number;
  total: number;
  goal: number;
  done: boolean;
  solo: boolean;
}

export function ContribView() {
  const { players, state, openTile } = useApp();

  const cards = players
    .map((p) => {
      const tiles: Row[] = [];
      let solo = 0;
      let shared = 0;
      let wip = 0;

      Object.keys(state.progress).forEach((tileId) => {
        const mine = state.progress[tileId]?.[p.id] ?? 0;
        if (mine <= 0) return;
        const t = findTarget(tileId);
        if (!t) return;
        const total = progressTotal(state.progress, tileId);
        const done = state.done.has(tileId);
        const isSolo = done && mine >= total;
        if (isSolo) solo++;
        else if (done) shared++;
        else wip++;
        tiles.push({
          id: tileId,
          name: t.kind === "bridge" ? t.name : t.n,
          region: t.kind === "bridge" ? "Bridge" : t.regionName,
          mine,
          total,
          goal: goalOf(t),
          done,
          solo: isSolo,
        });
      });

      tiles.sort((a, b) => Number(b.done) - Number(a.done) || b.mine - a.mine);
      return { p, tiles, solo, shared, wip };
    })
    // Tiles worked on first, then finished ones, then the ones they carried alone.
    // Nothing here is a sum of counts, for the reason at the top of the file.
    .sort(
      (a, b) =>
        b.tiles.length - a.tiles.length ||
        b.solo + b.shared - (a.solo + a.shared) ||
        b.solo - a.solo ||
        a.p.name.localeCompare(b.p.name),
    );

  return (
    <div>
      <div className="mb-3 border-2 border-border-default panel-gradient p-3">
        <div className="font-mono text-[13px] text-orange">CONTRIBUTIONS</div>
        <div className="mt-[6px] flex flex-wrap items-center gap-x-[14px] gap-y-[4px] text-[14px] text-ink-dim2 [text-wrap:pretty]">
          How many tiles each person has worked on — a tile counts once, whatever the
          size of its goal.
          <span className="flex items-center gap-[6px]">
            <span className="h-[10px] w-[10px] border border-green-border bg-green-bg" /> finished solo
          </span>
          <span className="flex items-center gap-[6px]">
            <span className="h-[10px] w-[10px] border border-amber-border bg-amber-bg" /> chipped in
          </span>
          <span className="flex items-center gap-[6px]">
            <span className="h-[10px] w-[10px] border border-blue-border bg-blue-bg" /> in progress
          </span>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3">
        {cards.map(({ p, tiles, solo, shared, wip }) => (
          <div key={p.id} className="border-2 border-border-default region-gradient p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[16px] text-amber-soft">{p.name}</span>
              <span className="font-mono text-[12px] text-ink-dim">
                {tiles.length} {tiles.length === 1 ? "tile" : "tiles"}
              </span>
            </div>
            <div className="mt-[3px] font-mono text-[11px] text-ink-dim">
              {solo} solo · {shared} shared · {wip} in progress
            </div>

            {tiles.length === 0 ? (
              <div className="mt-3 text-[14px] text-ink-dim">Nothing logged yet.</div>
            ) : (
              <div className="mt-[10px] flex flex-col gap-[5px]">
                {tiles.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => openTile(t.id)}
                    className="flex items-center gap-[8px] border border-border-dim bg-surface-inset p-[7px_9px] text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] text-ink">{t.name}</span>
                      <span className="block text-[11px] text-ink-dim">{t.region}</span>
                    </span>
                    <span className="font-mono text-[13px] text-yellow">
                      {fmtCompact(t.mine)}
                      <span className="text-ink-dim">
                        /{fmtCompact(t.done ? t.total : t.goal)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "border px-[6px] py-[3px] font-mono text-[10px]",
                        t.solo
                          ? "border-green-border bg-green-bg text-green-text"
                          : t.done
                            ? "border-amber-border bg-amber-bg text-amber-text"
                            : "border-blue-border bg-blue-bg text-blue-text",
                      )}
                    >
                      {t.solo ? "SOLO" : t.done ? "PART" : "WIP"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
