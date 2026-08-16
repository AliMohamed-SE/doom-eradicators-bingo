"use client";

import { useApp } from "./app-provider";
import { REGIONS } from "@/lib/board-data";
import {
  regionStats,
  regionEstimate,
  regionUnlocked,
  isDone,
  fmtHrs,
} from "@/lib/scoring";
import { cn } from "@/lib/cn";

const TOTAL_TILES = REGIONS.reduce((a, r) => a + r.tiles.length, 0); // 81

export function BoardIntel() {
  const { state } = useApp();
  const done = state.done;

  const rows = REGIONS.map((r) => ({
    r,
    stats: regionStats(r, done),
    est: regionEstimate(r, done),
    unlocked: regionUnlocked(r.id, done),
  }));

  const doneTiles = REGIONS.reduce(
    (a, r) => a + r.tiles.filter((t) => isDone(done, t.id)).length,
    0,
  );
  const complete = rows.filter((x) => x.stats.blackout).length;
  const totalHours = rows.reduce((a, x) => a + x.est.hours, 0);

  // Regions still open, ranked by estimated time left (shortest first).
  const ranking = rows
    .filter((x) => !x.stats.blackout)
    .sort((a, b) => a.est.hours - b.est.hours);

  return (
    <div className="mb-3 grid gap-[10px] border-2 border-border-default bg-surface-inset p-[10px_12px]">
      <div className="flex flex-wrap items-center gap-x-[14px] gap-y-[6px]">
        <span className="font-mono text-[11px] text-ink-dim">TEAM INTEL</span>
        <span className="text-[14px]">
          Tiles <b className="text-yellow">{doneTiles}</b>
          <span className="text-ink-dim">/{TOTAL_TILES}</span>
        </span>
        <span className="text-[14px]">
          Regions done <b className="text-yellow">{complete}</b>
          <span className="text-ink-dim">/9</span>
        </span>
        <span className="text-[14px]">
          Est. left <b className="text-amber-body">≈ {fmtHrs(totalHours)}</b>
        </span>
      </div>

      <div>
        <div className="mb-[6px] font-mono text-[11px] text-ink-dim">
          REGIONS BY TIME LEFT · shortest first
        </div>
        <div className="flex flex-wrap gap-[6px]">
          {ranking.map((x, i) => (
            <span
              key={x.r.id}
              className={cn(
                "flex items-center gap-[6px] border px-[8px] py-[5px] text-[13px]",
                x.unlocked
                  ? "border-border-default bg-surface-inset2 text-ink"
                  : "border-border-dim bg-tile-locked-bg text-tile-locked-text",
              )}
            >
              <span className="font-mono text-[11px] text-ink-dim">{i + 1}</span>
              <span>{x.r.name}</span>
              <span className="font-mono text-amber-body">
                {x.est.rated ? "≈ " + fmtHrs(x.est.hours) : "—"}
              </span>
              <span className="text-ink-dim">{x.stats.count}/9</span>
              {!x.unlocked && <span className="text-red-text2">locked</span>}
            </span>
          ))}
          {ranking.length === 0 && (
            <span className="text-[14px] text-green-soft">All regions complete — blackout! 🎉</span>
          )}
        </div>
      </div>
    </div>
  );
}
