"use client";

import { useApp } from "./app-provider";
import { Tile } from "./tile";
import { BridgeButton } from "./bridge-button";
import {
  regionStats,
  regionEstimate,
  regionUnlocked,
  bridgeForRegion,
  fmtHrs,
  allTiles,
} from "@/lib/scoring";
import type { Region } from "@/lib/board-data";
import { cn } from "@/lib/cn";

export function RegionPanel({ region, variant }: { region: Region; variant: "phone" | "desktop" }) {
  const { state, openRegion } = useApp();
  const phone = variant === "phone";

  const unlocked = regionUnlocked(region.id, state.done);
  const st = regionStats(region, state.done);
  const est = regionEstimate(region, state.done);
  const focused = state.focusRegions.includes(region.id);
  const bridge = bridgeForRegion(region.id);

  const targets = allTiles([region]);

  const summary =
    `${st.count}/9 tiles · rows ${st.rows}/3 · cols ${st.cols}/3` +
    (est.rated ? ` · ≈ ${fmtHrs(est.hours)} left` : "");

  const lockLabel = st.blackout ? "Complete" : unlocked ? "Unlocked" : "Locked";
  const lockColor = st.blackout ? "text-green-soft" : unlocked ? "text-green-text" : "text-red-text2";

  const panelBorder = st.blackout
    ? "border-green-border"
    : focused
      ? "border-orange"
      : unlocked
        ? "border-border-default"
        : "border-border-dim";

  return (
    <div
      className={cn(
        "region-gradient",
        phone ? "border-2 border-border-default p-[10px]" : cn("border-2 p-[9px]", panelBorder),
      )}
      style={!phone && !unlocked ? { opacity: 0.72 } : undefined}
    >
      <button
        type="button"
        onClick={() => openRegion(region.id)}
        className={cn("w-full cursor-pointer border-none bg-none text-left text-inherit", phone ? "pb-[10px]" : "pb-[8px]")}
      >
        <div className="flex items-baseline justify-between gap-[6px]">
          <span
            className={cn(
              "font-mono",
              st.blackout ? "text-green-soft" : "text-orange",
              phone ? "text-[14px]" : "text-[12px]",
            )}
          >
            {region.name}
          </span>
          <span className={cn(lockColor, phone ? "text-[14px]" : "text-[13px]")}>{lockLabel}</span>
        </div>
        <div className={cn("mt-[3px] text-ink-dim", phone ? "text-[14px]" : "text-[12px]")}>
          {phone ? `${summary} · tap for region details` : summary}
        </div>
      </button>

      {st.blackout && (
        <div
          className={cn(
            "mb-[7px] border-2 border-green-border bg-green-bg text-center font-mono text-green-text",
            phone ? "p-[9px_10px] text-[12px]" : "p-[7px] text-[11px]",
          )}
        >
          REGION COMPLETE · +{st.points} PTS
        </div>
      )}

      {bridge && <BridgeButton bridge={bridge} variant={variant} />}

      <div className={cn("grid grid-cols-3", phone ? "gap-[6px]" : "gap-[4px]")}>
        {targets.map((t) => (
          <Tile key={t.id} target={t} variant={variant} />
        ))}
      </div>
    </div>
  );
}
