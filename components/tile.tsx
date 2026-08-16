"use client";

import { useApp } from "./app-provider";
import { SKIN } from "./variants";
import { tileState, goalOf, progressTotal, tileRuleList, type TileTarget } from "@/lib/scoring";
import { FREE_SPACE } from "@/lib/board-data";
import { cn } from "@/lib/cn";

export function Tile({ target, variant }: { target: TileTarget; variant: "phone" | "desktop" }) {
  const { state, openTile } = useApp();
  const phone = variant === "phone";

  const st = tileState(target, state);
  const skin = SKIN[st];
  const focused = state.focusTiles.includes(target.id);
  const isFree = target.id === FREE_SPACE;
  const goal = goalOf(target);
  const prog = progressTotal(state.progress, target.id);
  const hasRules = tileRuleList(target.id).length > 0;
  const count = st === "done" || st === "locked" ? "" : `${prog}/${goal}`;

  if (isFree) {
    return (
      <div className="aspect-square">
        <div
          className={cn(
            "flex h-full w-full flex-col items-center justify-center gap-[5px] border-2 border-tile-done-border bg-tile-done-bg text-center text-tile-done-text",
            phone ? "p-[6px_4px]" : "border p-[4px_3px]",
          )}
        >
          <span className={cn("font-mono text-[#7fd695]", phone ? "text-[10px]" : "text-[9px]")}>
            DONE
          </span>
          <span className={cn("leading-[1.1]", phone ? "text-[13px]" : "text-[11px]")}>
            {target.n}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="aspect-square">
      <button
        type="button"
        onClick={() => openTile(target.id)}
        style={focused ? { outline: "2px solid #ff981f" } : undefined}
        className={cn(
          "flex h-full w-full cursor-pointer flex-col items-center justify-between text-center",
          skin.className,
          focused ? "border-orange" : "",
          phone ? "gap-[3px] border-2 p-[6px_4px]" : "border p-[4px_3px]",
        )}
      >
        <span
          className={cn(
            "flex items-center justify-center gap-[4px] font-mono",
            skin.badgeText,
            phone ? "text-[10px]" : "text-[9px]",
          )}
        >
          <span>{skin.badge}</span>
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

        <span className="flex flex-1 flex-col items-center justify-center gap-[2px] overflow-hidden">
          <span className={cn("leading-[1.1]", phone ? "text-[13px]" : "text-[11px]")}>
            {target.n}
          </span>
          <span
            className={cn(
              "overflow-hidden text-ink-dim [-webkit-box-orient:vertical] [-webkit-line-clamp:3] [display:-webkit-box]",
              phone ? "text-[11px] leading-[1.15]" : "text-[9px] leading-[1.15]",
            )}
          >
            {target.o}
          </span>
        </span>

        <span className="flex w-full flex-col items-stretch gap-[3px]">
          <span
            className={cn(
              prog > 0 ? "text-yellow" : "text-ink-dim",
              phone ? "text-[12px]" : "text-[10px]",
            )}
          >
            {count}
          </span>
        </span>
      </button>
    </div>
  );
}
