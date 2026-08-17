"use client";

import { useApp } from "./app-provider";
import { PLAN_TONE } from "./variants";
import { intentCounts, intentBar, tileRuleList, type Intent } from "@/lib/scoring";
import { FREE_SPACE, type Tile as TileData } from "@/lib/board-data";
import { cn } from "@/lib/cn";

export function PlanTile({ tile, variant }: { tile: TileData; variant: "phone" | "desktop" }) {
  const { state, planUid, openPlanPick } = useApp();
  const phone = variant === "phone";

  if (tile.id === FREE_SPACE) {
    return (
      <div className="aspect-square">
        <div
          className={cn(
            "flex h-full w-full items-center justify-center border-2 border-border-default bg-tile-locked-bg text-center text-tile-locked-text",
            phone ? "text-[13px]" : "border text-[11px]",
          )}
        >
          {tile.n}
        </div>
      </div>
    );
  }

  const mine = (state.intents[tile.id]?.[planUid] ?? "none") as Intent | "none";
  const tone = PLAN_TONE[mine];
  const c = intentCounts(state.intents, tile.id);
  const bar = intentBar(state.intents, tile.id);
  const hasRules = tileRuleList(tile.id).length > 0;
  const count = c.total ? `${c.want}·${c.ok}·${c.no}` : "";

  return (
    <div className="aspect-square">
      <button
        type="button"
        onClick={() => openPlanPick(tile.id)}
        className={cn(
          "flex h-full w-full cursor-pointer flex-col items-center justify-between text-center",
          tone.className,
          phone ? "gap-[3px] border-2 p-[6px_4px]" : "border p-[4px_3px]",
        )}
      >
        <span className={cn("flex items-center justify-center gap-[4px] font-mono", phone ? "text-[10px]" : "text-[9px]")}>
          <span>{tone.badge}</span>
          {hasRules && (
            <span
              title="This tile has its own rules"
              className={cn(
                "inline-flex items-center justify-center border border-amber-border bg-amber-bg text-amber-text leading-none",
                phone ? "h-[15px] w-[15px] text-[10px]" : "h-[13px] w-[13px] text-[9px]",
              )}
            >
              ?
            </span>
          )}
        </span>
        <span className={cn("overflow-hidden leading-[1.1]", phone ? "text-[13px]" : "text-[11px]")}>
          {tile.n}
        </span>
        <span className="flex w-full flex-col items-stretch gap-[3px]">
          <span className={cn("text-ink-dim", phone ? "text-[12px]" : "text-[10px]")}>{count}</span>
          {bar.has && (
            <span className={cn("flex w-full gap-px", phone ? "h-[4px]" : "h-[3px]")}>
              <span className="bg-green-border" style={{ width: bar.wantW }} />
              <span className="bg-amber-border" style={{ width: bar.okW }} />
              <span className="bg-red-border" style={{ width: bar.noW }} />
            </span>
          )}
        </span>
      </button>
    </div>
  );
}
