"use client";

import { useApp } from "./app-provider";
import { BRIDGE_TONE } from "./variants";
import { bridgeApproach, bridgeSideFrom, bridgeOther, infoFor, fmtHrs } from "@/lib/scoring";
import {
  SIDE_ARROW,
  SIDE_LABEL,
  bridgeLabel,
  bridgeObjective,
  bridgeJoins,
  bridgeHeading,
  regionName,
} from "@/lib/bridge-text";
import type { Bridge } from "@/lib/board-data";
import { cn } from "@/lib/cn";

/**
 * A bridge as a full-width button. `fromRegion` is the region the reader is
 * looking at, so the button can say which of its four borders this bridge is on;
 * without it the button just names both ends.
 */
export function BridgeButton({
  bridge,
  variant,
  fromRegion,
}: {
  bridge: Bridge;
  variant: "phone" | "desktop";
  fromRegion?: string;
}) {
  const { state, openTile } = useApp();
  const phone = variant === "phone";
  const approach = bridgeApproach(bridge, state);
  const tone = BRIDGE_TONE[approach.status];

  const side = fromRegion ? bridgeSideFrom(bridge, fromRegion) : null;
  const neighbour = fromRegion ? bridgeOther(bridge, fromRegion) : null;
  const where = side
    ? `${SIDE_LABEL[side]} BORDER ${SIDE_ARROW[side]} ${regionName(neighbour).toUpperCase()}`
    : bridgeJoins(bridge).toUpperCase();

  const info = infoFor(bridge);
  const crew = (state.claims[bridge.id] || []).length;
  const sub =
    bridgeObjective(bridge) +
    (approach.status !== "done" && info.best ? "  ·  ≈ " + fmtHrs(info.best) : "") +
    (crew ? "  ·  " + crew + " on it" : "");

  return (
    <button
      type="button"
      onClick={() => openTile(bridge.id)}
      className={cn(
        "w-full cursor-pointer border-[3px] text-left",
        tone.className,
        phone ? "min-h-[56px] p-[11px]" : "mb-[7px] min-h-[46px] p-[8px]",
      )}
    >
      <span className={cn("block font-mono", tone.head, phone ? "text-[11px]" : "text-[9px]")}>
        {bridgeHeading(bridge, approach)}
      </span>
      <span className={cn("block", phone ? "mt-[4px] text-[16px]" : "mt-[3px] text-[14px]")}>
        {bridgeLabel(bridge)}
      </span>
      <span
        className={cn(
          "block font-mono text-ink-dim",
          phone ? "mt-[3px] text-[10px]" : "mt-[2px] text-[9px]",
        )}
      >
        {where}
      </span>
      <span
        className={cn(
          "block text-ink-dim2 leading-[1.3]",
          phone ? "mt-[3px] text-[13px]" : "mt-[2px] text-[11px]",
        )}
      >
        {sub}
      </span>
    </button>
  );
}
