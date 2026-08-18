"use client";

import { useApp } from "./app-provider";
import { BRIDGE_TONE } from "./variants";
import { bridgeApproach, bridgePlacement } from "@/lib/scoring";
import { bridgeLabel, bridgeTooltip } from "@/lib/bridge-text";
import type { Bridge } from "@/lib/board-data";
import { cn } from "@/lib/cn";

/**
 * A bridge drawn on the board map, in the gutter between the two region panels
 * it joins. Regions sit on the odd tracks of a 5x5 grid and the gutters are the
 * even ones, so a bridge's grid position falls straight out of its two cells.
 */
export function BridgeConnector({ bridge }: { bridge: Bridge }) {
  const { state, openTile } = useApp();
  const place = bridgePlacement(bridge);
  if (!place) return null;
  // Side-by-side regions leave a tall narrow gutter, so the label is set on its
  // side there; stacked regions get a wide short one.
  const { gridRow, gridColumn, upright } = place;

  const approach = bridgeApproach(bridge, state);
  const tone = BRIDGE_TONE[approach.status];
  const rail = approach.status === "done" ? "bg-green-border" : "bg-border-dim";

  return (
    <div
      style={{ gridRow, gridColumn }}
      className={cn("flex items-center justify-center", upright ? "flex-col" : "flex-row")}
    >
      <span className={cn("flex-1", rail, upright ? "w-[2px]" : "h-[2px]")} />
      <button
        type="button"
        onClick={() => openTile(bridge.id)}
        title={bridgeTooltip(bridge, approach)}
        aria-label={bridgeTooltip(bridge, approach)}
        className={cn(
          "flex cursor-pointer items-center justify-center overflow-hidden border-2 font-mono text-[9px] leading-none whitespace-nowrap",
          tone.className,
          upright ? "max-h-[190px] px-[3px] py-[7px]" : "max-w-full px-[7px] py-[3px]",
        )}
        style={upright ? { writingMode: "vertical-rl" } : undefined}
      >
        <span className="overflow-hidden text-ellipsis">
          {bridgeLabel(bridge).toUpperCase()}
        </span>
      </button>
      <span className={cn("flex-1", rail, upright ? "w-[2px]" : "h-[2px]")} />
    </div>
  );
}
