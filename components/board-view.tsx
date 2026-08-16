"use client";

import { useApp } from "./app-provider";
import { RegionPanel } from "./region-panel";
import { BoardIntel } from "./board-intel";
import {
  REGIONS,
} from "@/lib/board-data";
import {
  scoreOf,
  regionUnlocked,
  regionFullyDone,
  findTarget,
} from "@/lib/scoring";
import { cn } from "@/lib/cn";

function targetName(id: string): string {
  const t = findTarget(id);
  if (!t) return id;
  return t.kind === "bridge" ? t.name : t.n;
}

export function BoardView() {
  const { state, region, selectRegion } = useApp();

  const liveFocusR = state.focusRegions.filter((id) => {
    const r = REGIONS.find((x) => x.id === id);
    return !r || !regionFullyDone(r, state.done);
  });
  const liveFocusT = state.focusTiles.filter((id) => !state.done.has(id));
  const focusItems = [
    ...liveFocusR.map((id) => `${REGIONS.find((x) => x.id === id)?.name ?? id} region`),
    ...liveFocusT.map((id) => targetName(id)),
  ];

  const current = REGIONS.find((r) => r.id === region) ?? REGIONS[0];
  const score = scoreOf(state.done);

  return (
    <div>
      {focusItems.length > 0 && (
        <div className="mb-3 border-2 border-amber-border focus-gradient p-[10px_12px]">
          <div className="mb-2 font-mono text-[12px] text-amber-text">TEAM FOCUS</div>
          <div className="flex flex-wrap gap-[6px]">
            {focusItems.map((label, i) => (
              <span
                key={i}
                className="border border-amber-border bg-surface-inset px-[10px] py-[5px] text-[14px] text-amber-body"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      )}

      <BoardIntel />

      {/* Phone: chip row + single region */}
      <div className="board:hidden">
        <div className="scroll-x mb-[10px] flex gap-[6px] overflow-x-auto pb-2">
          {REGIONS.map((r) => {
            const unlocked = regionUnlocked(r.id, state.done);
            const sel = r.id === region;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => selectRegion(r.id)}
                className={cn(
                  "min-h-[44px] flex-none border-2 p-[10px] font-mono text-[11px]",
                  sel
                    ? "border-orange bg-amber-btn text-amber-soft"
                    : "border-border-default bg-surface-dark text-ink-dim",
                )}
              >
                {r.name.toUpperCase()}
                {!unlocked && " · LOCKED"}
              </button>
            );
          })}
        </div>
        {current && <RegionPanel region={current} variant="phone" />}
      </div>

      {/* Desktop: nine-region grid */}
      <div className="hidden board:block">
        <div className="grid grid-cols-3 gap-[10px]">
          {REGIONS.map((r) => (
            <RegionPanel key={r.id} region={r} variant="desktop" />
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-[14px] border-2 border-border-default bg-surface-inset p-[10px_12px]">
        <span className="font-mono text-[11px] text-ink-dim">SCORE</span>
        <span className="text-[14px]">
          Rows <b className="text-yellow">{score.rows}</b>
        </span>
        <span className="text-[14px]">
          Columns <b className="text-yellow">{score.cols}</b>
        </span>
        <span className="text-[14px]">
          Middles <b className="text-yellow">{score.mids}</b>
        </span>
        <span className="text-[14px]">
          Blackouts <b className="text-yellow">{score.blackouts}</b>
        </span>
        <span className="font-mono text-[13px] text-green-soft">TOTAL {score.total}</span>
      </div>
    </div>
  );
}
