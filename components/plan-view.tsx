"use client";

import { useApp } from "./app-provider";
import { PlanTile } from "./plan-tile";
import { REGIONS, FREE_SPACE, type Region } from "@/lib/board-data";
import { cn } from "@/lib/cn";

function myTotals(intentsForMe: (tileId: string) => string | undefined) {
  let want = 0,
    ok = 0,
    no = 0,
    unsaid = 0;
  REGIONS.forEach((r) =>
    r.tiles.forEach((t) => {
      if (t.id === FREE_SPACE) return;
      const v = intentsForMe(t.id);
      if (v === "want") want++;
      else if (v === "ok") ok++;
      else if (v === "no") no++;
      else unsaid++;
    }),
  );
  return { want, ok, no, unsaid };
}

function regionSummary(region: Region, forMe: (id: string) => string | undefined) {
  let want = 0,
    ok = 0,
    no = 0,
    unsaid = 0;
  region.tiles.forEach((t) => {
    if (t.id === FREE_SPACE) return;
    const v = forMe(t.id);
    if (v === "want") want++;
    else if (v === "ok") ok++;
    else if (v === "no") no++;
    else unsaid++;
  });
  return { want, ok, no, unsaid };
}

export function PlanView() {
  const { state, me, region, selectRegion } = useApp();
  const uid = me?.id ?? "";
  const forMe = (id: string) => state.intents[id]?.[uid];

  const totals = myTotals(forMe);
  const current = REGIONS.find((r) => r.id === region) ?? REGIONS[0];

  return (
    <div>
      <div className="mb-3 border-2 border-border-default panel-gradient p-3">
        <div className="font-mono text-[13px] text-orange">PRE-EVENT PLANNING · {me?.name}</div>
        <div className="mt-[6px] text-[15px] leading-[1.35] text-ink-dim2 [text-wrap:pretty]">
          Go through the board and say what you&apos;d take. Everyone&apos;s answers show up on the
          tiles themselves, so the team can see where the interest is before the event starts.
        </div>
        <div className="mt-[10px] flex flex-wrap items-center gap-[10px] text-[14px]">
          <span className="flex items-center gap-[6px]">
            <span className="h-[8px] w-[14px] bg-green-border" />
            Want it
          </span>
          <span className="flex items-center gap-[6px]">
            <span className="h-[8px] w-[14px] bg-amber-border" />
            Willing
          </span>
          <span className="flex items-center gap-[6px]">
            <span className="h-[8px] w-[14px] bg-red-border" />
            Won&apos;t
          </span>
          <span className="text-ink-dim">
            You: {totals.want} want · {totals.ok} willing · {totals.no} won&apos;t · {totals.unsaid}{" "}
            not answered
          </span>
        </div>
      </div>

      {/* Phone */}
      <div className="board:hidden">
        <div className="scroll-x mb-[10px] flex gap-[6px] overflow-x-auto pb-2">
          {REGIONS.map((r) => {
            const s = regionSummary(r, forMe);
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
                {s.unsaid ? " · " + s.unsaid : " ✓"}
              </button>
            );
          })}
        </div>
        {current && <PlanRegionPanel region={current} variant="phone" forMe={forMe} />}
      </div>

      {/* Desktop */}
      <div className="hidden board:block">
        <div className="grid grid-cols-3 gap-[10px]">
          {REGIONS.map((r) => (
            <PlanRegionPanel key={r.id} region={r} variant="desktop" forMe={forMe} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PlanRegionPanel({
  region,
  variant,
  forMe,
}: {
  region: Region;
  variant: "phone" | "desktop";
  forMe: (id: string) => string | undefined;
}) {
  const s = regionSummary(region, forMe);
  const phone = variant === "phone";
  return (
    <div
      className={cn(
        "border-2 border-border-default",
        phone ? "panel-gradient p-[10px]" : "region-gradient p-[9px]",
      )}
    >
      <div className={cn("font-mono text-orange", phone ? "text-[15px]" : "text-[12px]")}>
        {region.name}
      </div>
      <div className={cn("text-ink-dim", phone ? "my-[5px] mb-[10px] text-[14px]" : "my-[3px] mb-[8px] text-[12px]")}>
        {s.want} want · {s.ok} willing · {s.no} won&apos;t · {s.unsaid} unanswered
      </div>
      <div className={cn("grid grid-cols-3", phone ? "gap-[6px]" : "gap-[4px]")}>
        {region.tiles.map((t) => (
          <PlanTile key={t.id} tile={t} variant={variant} />
        ))}
      </div>
    </div>
  );
}
