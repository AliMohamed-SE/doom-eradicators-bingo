"use client";

import { useApp } from "./app-provider";
import { Tile } from "./tile";
import { BridgeButton } from "./bridge-button";
import {
  regionStats,
  regionEstimate,
  regionUnlocked,
  bridgesForRegion,
  bridgeSideFrom,
  fmtHrs,
  allTiles,
} from "@/lib/scoring";
import type { Region, Bridge } from "@/lib/board-data";
import { cn } from "@/lib/cn";

/** North, east, south, west — the order the borders are listed in. */
const SIDE_ORDER = { north: 0, east: 1, south: 2, west: 3 } as const;

export function RegionPanel({ region, variant }: { region: Region; variant: "phone" | "desktop" }) {
  const { state, openRegion } = useApp();
  const phone = variant === "phone";

  const unlocked = regionUnlocked(region.id, state.done);
  const st = regionStats(region, state.done);
  const est = regionEstimate(region, state.done);
  const focused = state.focusRegions.includes(region.id);
  // Phone has no board map, so the region carries its own border list; on desktop
  // the bridges are drawn in the gutters around this panel instead.
  const sideRank = (b: Bridge) => SIDE_ORDER[bridgeSideFrom(b, region.id) ?? "west"];
  const bridges = phone
    ? bridgesForRegion(region.id)
        .slice()
        .sort((x, y) => sideRank(x) - sideRank(y))
    : [];


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
        phone ? "border-2 border-border-default p-[10px]" : cn("h-full border-2 p-[9px]", panelBorder),
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

      {bridges.length > 0 && (
        <div className="mb-[9px] grid gap-[6px]">
          <div className="font-mono text-[11px] text-ink-dim">
            BORDERS · {bridges.length} BRIDGE{bridges.length === 1 ? "" : "S"}
          </div>
          {bridges.map((b) => (
            <BridgeButton key={b.id} bridge={b} variant={variant} fromRegion={region.id} />
          ))}
        </div>
      )}

      <div className={cn("grid grid-cols-3", phone ? "gap-[6px]" : "gap-[4px]")}>
        {targets.map((t) => (
          <Tile key={t.id} target={t} variant={variant} />
        ))}
      </div>
    </div>
  );
}
