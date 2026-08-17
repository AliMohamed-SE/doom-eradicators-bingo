"use client";

import { useApp } from "./app-provider";
import { findTarget, goalOf, progressTotal } from "@/lib/scoring";
import { cn } from "@/lib/cn";

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
      let logged = 0;
      let solo = 0;
      let partial = 0;

      Object.keys(state.progress).forEach((tileId) => {
        const mine = state.progress[tileId]?.[p.id] ?? 0;
        if (mine <= 0) return;
        const t = findTarget(tileId);
        if (!t) return;
        const total = progressTotal(state.progress, tileId);
        const done = state.done.has(tileId);
        const isSolo = done && mine >= total;
        logged += mine;
        if (isSolo) solo++;
        else if (done) partial++;
        tiles.push({
          id: tileId,
          name: t.kind === "bridge" ? t.name : t.n,
          region: t.kind === "bridge" ? "Bridge" : t.regionName,
          mine,
          total,
          goal: goalOf({ o: t.o }),
          done,
          solo: isSolo,
        });
      });

      tiles.sort((a, b) => Number(b.done) - Number(a.done) || b.mine - a.mine);
      return { p, tiles, logged, solo, partial };
    })
    .sort((a, b) => b.logged - a.logged);

  return (
    <div>
      <div className="mb-3 border-2 border-border-default panel-gradient p-3">
        <div className="font-mono text-[13px] text-orange">CONTRIBUTIONS</div>
        <div className="mt-[6px] flex flex-wrap items-center gap-x-[14px] gap-y-[4px] text-[14px] text-ink-dim2 [text-wrap:pretty]">
          Who logged what across the board.
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
        {cards.map(({ p, tiles, logged, solo, partial }) => (
          <div key={p.id} className="border-2 border-border-default region-gradient p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[16px] text-amber-soft">{p.name}</span>
              <span className="font-mono text-[12px] text-ink-dim">{logged} logged</span>
            </div>
            <div className="mt-[3px] font-mono text-[11px] text-ink-dim">
              {solo} solo · {partial} shared · {tiles.length} tiles
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
                      {t.mine}
                      <span className="text-ink-dim">
                        /{t.done ? t.total : t.goal}
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
