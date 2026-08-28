"use client";

import { useApp, patchRivalRegion } from "./app-provider";
import { RivalTile } from "./rival-tile";
import { setRivalRegion } from "@/app/actions";
import { regionStats } from "@/lib/scoring";
import { rivalMarkableIds } from "@/lib/rival";
import type { Region } from "@/lib/board-data";
import { cn } from "@/lib/cn";

/**
 * One region of the rival board. Stripped down from components/region-panel.tsx:
 * no unlock state, no bridges, no time estimate — see the note in rival-tile.tsx
 * for why. What survives is the part that is knowable from a screenshot (which
 * tiles are filled in) and the part that follows from it (what that is worth).
 *
 * The two leader buttons exist because screenshots arrive a region at a time, and
 * ticking nine tiles one by one to log one image is the sort of thing that stops a
 * leader keeping this board up to date at all.
 */
export function RivalRegionPanel({ region, variant }: { region: Region; variant: "phone" | "desktop" }) {
  const { rivalDone, isLeader, run } = useApp();
  const phone = variant === "phone";

  const st = regionStats(region, rivalDone);
  const ids = rivalMarkableIds([region]);
  const allDone = st.count === region.tiles.length;

  return (
    <div
      className={cn(
        "region-gradient h-full border-2 p-[10px]",
        allDone ? "border-green-border" : "border-border-default",
      )}
    >
      <div className="flex items-baseline justify-between gap-[6px] pb-[8px]">
        <span
          className={cn(
            "font-mono",
            allDone ? "text-green-soft" : "text-orange",
            phone ? "text-[14px]" : "text-[12px]",
          )}
        >
          {region.name}
        </span>
        <span className={cn("text-ink-dim", phone ? "text-[13px]" : "text-[12px]")}>
          {st.count}/{region.tiles.length} · {st.points} pts
        </span>
      </div>

      {isLeader && (
        <div className="mb-[9px] flex gap-[6px]">
          <button
            type="button"
            onClick={() => run(() => setRivalRegion(region.id, true), patchRivalRegion(ids, true))}
            className="min-h-[38px] flex-1 cursor-pointer border-2 border-green-border2 bg-green-bg2 p-[8px] font-mono text-[11px] text-green-text2"
          >
            MARK ALL
          </button>
          <button
            type="button"
            onClick={() => run(() => setRivalRegion(region.id, false), patchRivalRegion(ids, false))}
            className="min-h-[38px] flex-1 cursor-pointer border-2 border-border-default bg-surface-dark p-[8px] font-mono text-[11px] text-ink-dim"
          >
            CLEAR
          </button>
        </div>
      )}

      <div className={cn("grid grid-cols-3", phone ? "gap-[6px]" : "gap-[4px]")}>
        {region.tiles.map((t) => (
          <RivalTile key={t.id} tile={t} variant={variant} />
        ))}
      </div>
    </div>
  );
}
