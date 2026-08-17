"use client";

import { useRouter } from "next/navigation";
import { useApp } from "./app-provider";
import { useConfirm } from "./confirm";
import { SheetShell } from "./sheet-shell";
import { REGIONS } from "@/lib/board-data";
import {
  regionStats,
  regionEstimate,
  regionUnlocked,
  bridgeForRegion,
  tileState,
  fmtHrs,
  allTiles,
} from "@/lib/scoring";
import { toggleFocus, forceRegionCompletion } from "@/app/actions";
import { cn } from "@/lib/cn";

export function RegionSheet({ id }: { id: string }) {
  const { state, isLeader, playerName, closeDrawer, selectRegion, openTile, run } = useApp();
  const confirm = useConfirm();
  const router = useRouter();
  const region = REGIONS.find((r) => r.id === id);
  if (!region) return null;

  const stat = regionStats(region, state.done);
  const est = regionEstimate(region, state.done);
  const unlocked = regionUnlocked(region.id, state.done);
  const bridge = bridgeForRegion(region.id);
  const focused = state.focusRegions.includes(region.id);

  const brName = bridge
    ? bridge.mystery && (!bridge.name || bridge.name === "???")
      ? "the mystery bridge"
      : bridge.name
    : null;
  const unlockNote =
    region.id === "central"
      ? "Open from the start"
      : unlocked
        ? "Bridge cleared"
        : brName
          ? "Clear " + brName + " to open it"
          : "No bridge set yet";

  const restLine = est.rated
    ? "≈ " +
      fmtHrs(est.hours) +
      " of grinding across " +
      est.rated +
      (est.rated === 1 ? " rated tile" : " rated tiles") +
      " still open" +
      (est.challenges
        ? " · " + est.challenges + (est.challenges === 1 ? " challenge tile" : " challenge tiles") + " not counted"
        : "") +
      (est.unknown ? " · " + est.unknown + " with no rate on record" : "")
    : est.left
      ? "Nothing left here has a rate — " +
        est.left +
        " open " +
        (est.left === 1 ? "tile is" : "tiles are") +
        " challenge or unrated."
      : "Region complete — all nine tiles cleared.";
  const bridgeLine = est.bridgeHours
    ? "Includes ≈ " + fmtHrs(est.bridgeHours) + " for the bridge that unlocks the region."
    : "";

  const tiles = allTiles([region]);
  const live = tiles.filter((t) => tileState(t, state) === "working");
  const peopleOn = new Set<string>();
  tiles.forEach((t) => (state.claims[t.id] || []).forEach((p) => peopleOn.add(p)));

  const activeLine = live.length
    ? live.length +
      (live.length === 1 ? " tile is" : " tiles are") +
      " being worked: " +
      live.map((t) => t.n).join(", ")
    : "Nothing being worked in this region yet.";
  const peopleArr = [...peopleOn].map(playerName);
  const peopleLine = peopleArr.length
    ? peopleArr.length + " working here: " + peopleArr.join(", ")
    : "Nobody working here yet.";

  const stats: { label: string; value: string | number; className: string }[] = [
    { label: "TILES", value: `${stat.count}/9`, className: "text-ink" },
    { label: "ROWS", value: `${stat.rows}/3`, className: "text-yellow" },
    { label: "COLUMNS", value: `${stat.cols}/3`, className: "text-yellow" },
    { label: "MIDDLE", value: stat.mid ? "YES" : "NO", className: stat.mid ? "text-green-text" : "text-ink-dim" },
    { label: "BLACKOUT", value: stat.blackout ? "YES" : "NO", className: stat.blackout ? "text-green-text" : "text-ink-dim" },
    { label: "POINTS", value: stat.points, className: "text-green-soft" },
    { label: "EST. TIME", value: est.rated ? fmtHrs(est.hours) : "—", className: "text-amber-body" },
  ];

  return (
    <SheetShell kindLabel="REGION" name={region.name} onClose={closeDrawer} maxWidth="560px">
      {stat.blackout && (
        <div className="border-2 border-green-border bg-green-bg p-[11px] text-center font-mono text-[13px] text-green-text">
          REGION COMPLETE · ALL 9 TILES · +{stat.points} PTS
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "border-2 px-[10px] py-[7px] font-mono text-[11px]",
            unlocked
              ? "border-green-border bg-green-bg text-green-text"
              : "border-border-dim bg-tile-locked-bg text-tile-locked-text",
          )}
        >
          {unlocked ? "UNLOCKED" : "LOCKED"}
        </span>
        <span className="text-[14px] text-ink-dim">{unlockNote}</span>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(105px,1fr))] gap-[7px]">
        {stats.map((s) => (
          <div key={s.label} className="border-2 border-border-default bg-surface-inset2 p-[9px]">
            <div className="font-mono text-[11px] text-ink-dim">{s.label}</div>
            <div className={cn("mt-[5px] font-mono text-[15px]", s.className)}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-[5px] border-2 border-amber-border bg-amber-bg p-[10px]">
        <div className="font-mono text-[11px] text-amber-text">EST. TIME LEFT IN THIS REGION</div>
        <div className="text-[15px] leading-[1.35] text-amber-body">{restLine}</div>
        {bridgeLine && <div className="text-[14px] leading-[1.35] text-amber-text">{bridgeLine}</div>}
        <div className="text-[12px] leading-[1.35] text-ink-dim">
          Sum of every open tile&apos;s own solo estimate. A reference figure only, it comes down as
          tiles get completed.
        </div>
      </div>

      <div className="grid gap-[6px] border-2 border-border-default bg-surface-inset p-[10px]">
        <div className="font-mono text-[11px] text-ink-dim">WHAT&apos;S MOVING</div>
        <div className="text-[15px] leading-[1.35]">{activeLine}</div>
        <div className="text-[14px] leading-[1.35] text-ink-dim2">{peopleLine}</div>
      </div>

      {bridge && (
        <button
          type="button"
          onClick={() => openTile(bridge.id)}
          className="min-h-[52px] w-full cursor-pointer border-2 border-border-default bg-surface-btn p-[11px] text-left text-[15px] text-ink"
        >
          <span className="font-mono text-[11px] text-ink-dim">WAY IN</span>
          <br />
          {brName}
        </button>
      )}

      <button
        type="button"
        onClick={() => {
          selectRegion(region.id);
          closeDrawer();
          router.push("/board");
        }}
        className="min-h-[50px] w-full cursor-pointer border-2 border-border-default bg-surface-btn p-[13px] text-[15px] text-ink"
      >
        Show this region&apos;s tiles
      </button>

      {isLeader && (
        <div className="grid gap-[9px] border-2 border-amber-border bg-amber-bg p-[10px]">
          <div className="font-mono text-[11px] text-amber-text">LEADER CONTROLS</div>
          <button
            type="button"
            onClick={() => run(() => toggleFocus("region", id, !focused))}
            className={cn(
              "min-h-[46px] w-full cursor-pointer border-2 border-amber-border p-[11px] text-[14px] text-amber-body",
              focused ? "bg-amber-btn" : "bg-surface-dark",
            )}
          >
            {focused ? "Drop region focus" : "Focus this region"}
          </button>
          {stat.blackout ? (
            <button
              type="button"
              onClick={async () => {
                const ok = await confirm({
                  title: "CLEAR REGION?",
                  message: `This resets all 9 tiles in ${region.name} back to 0. Are you sure?`,
                  confirmLabel: "CLEAR IT",
                  tone: "danger",
                });
                if (ok) run(() => forceRegionCompletion(id, false));
              }}
              className="min-h-[46px] w-full cursor-pointer border-2 border-red-border bg-red-bg p-[11px] text-[14px] text-red-text"
            >
              Clear whole region
            </button>
          ) : (
            <button
              type="button"
              onClick={async () => {
                const ok = await confirm({
                  title: "MARK REGION DONE?",
                  message: `This marks all 9 tiles in ${region.name} done, even if it's locked. Are you sure?`,
                  confirmLabel: "MARK DONE",
                });
                if (ok) run(() => forceRegionCompletion(id, true));
              }}
              className="min-h-[46px] w-full cursor-pointer border-2 border-green-border2 bg-green-bg2 p-[11px] text-[14px] text-green-text2"
            >
              Mark whole region done
            </button>
          )}
        </div>
      )}
    </SheetShell>
  );
}
