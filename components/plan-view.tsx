"use client";

import { useApp } from "./app-provider";
import { PlanTile } from "./plan-tile";
import { REGIONS, FREE_SPACE, type Region } from "@/lib/board-data";
import type { EventState } from "@/lib/scoring";
import type { PlayerRow } from "@/lib/types";
import { cn } from "@/lib/cn";

/** Answerable tiles (the free space is never answered). */
function answerable(region: Region) {
  return region.tiles.filter((t) => t.id !== FREE_SPACE);
}

interface Totals {
  want: number;
  ok: number;
  no: number;
  unsaid: number;
}

function summarize(regions: readonly Region[], forUid: (id: string) => string | undefined): Totals {
  const t: Totals = { want: 0, ok: 0, no: 0, unsaid: 0 };
  regions.forEach((r) =>
    answerable(r).forEach((tile) => {
      const v = forUid(tile.id);
      if (v === "want") t.want++;
      else if (v === "ok") t.ok++;
      else if (v === "no") t.no++;
      else t.unsaid++;
    }),
  );
  return t;
}

function totalsFor(intents: EventState["intents"], uid: string): Totals {
  return summarize(REGIONS, (id) => intents[id]?.[uid]);
}

export function PlanView() {
  const { state, me, players, isLeader, planViewing, planUid, setPlanViewUid, region, selectRegion } =
    useApp();
  const forUid = (id: string) => state.intents[id]?.[planUid];

  const totals = summarize(REGIONS, forUid);
  const current = REGIONS.find((r) => r.id === region) ?? REGIONS[0];
  const who = planViewing ? planViewing.name : "You";

  // Yourself first, then every other seat with a Discord account linked. Whoever
  // is currently being viewed stays listed even if their seat gets unlinked.
  const pickable: PlayerRow[] = [
    ...(me ? [me] : []),
    ...players.filter(
      (p) => p.id !== me?.id && (p.linked || p.id === planViewing?.id),
    ),
  ];

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
          <span className={cn(planViewing ? "text-amber-soft" : "text-ink-dim")}>
            {who}: {totals.want} want · {totals.ok} willing · {totals.no} won&apos;t ·{" "}
            {totals.unsaid} not answered
          </span>
        </div>

        {isLeader && (
          <div className="mt-[10px] flex flex-wrap items-center gap-[8px] border-t border-border-dim pt-[10px]">
            <label htmlFor="plan-view-as" className="font-mono text-[11px] text-ink-dim">
              SHOW ANSWERS FOR
            </label>
            <select
              id="plan-view-as"
              value={planUid}
              onChange={(e) => setPlanViewUid(e.target.value)}
              className="min-h-[40px] max-w-full cursor-pointer border-2 border-border-default bg-surface-dark p-[8px_10px] text-[14px] text-ink"
            >
              {pickable.map((p) => {
                const t = totalsFor(state.intents, p.id);
                return (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.id === me?.id ? " (you)" : ""} —{" "}
                    {t.unsaid ? `${t.unsaid} not answered` : "all answered"}
                  </option>
                );
              })}
            </select>
            {planViewing && (
              <>
                <span className="text-[13px] text-amber-body">
                  Read-only — these are {planViewing.name}&apos;s picks, not yours.
                </span>
                <button
                  type="button"
                  onClick={() => setPlanViewUid(null)}
                  className="min-h-[36px] cursor-pointer border-2 border-border-default bg-surface-btn p-[6px_12px] font-mono text-[11px] text-ink"
                >
                  BACK TO MINE
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Phone */}
      <div className="board:hidden">
        <div className="scroll-x mb-[10px] flex gap-[6px] overflow-x-auto pb-2">
          {REGIONS.map((r) => {
            const s = summarize([r], forUid);
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
        {current && <PlanRegionPanel region={current} variant="phone" forUid={forUid} />}
      </div>

      {/* Desktop */}
      <div className="hidden board:block">
        <div className="grid grid-cols-3 gap-[10px]">
          {REGIONS.map((r) => (
            <PlanRegionPanel key={r.id} region={r} variant="desktop" forUid={forUid} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PlanRegionPanel({
  region,
  variant,
  forUid,
}: {
  region: Region;
  variant: "phone" | "desktop";
  forUid: (id: string) => string | undefined;
}) {
  const s = summarize([region], forUid);
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
