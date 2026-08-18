"use client";

import { BRIDGE_TONE } from "./variants";
import type { BridgeStatus } from "@/lib/scoring";
import { cn } from "@/lib/cn";

const KEYS: { status: BridgeStatus; label: string }[] = [
  { status: "available", label: "OPEN" },
  { status: "working", label: "ON IT" },
  { status: "done", label: "CLEARED" },
  { status: "locked", label: "LOCKED" },
  { status: "redundant", label: "REDUNDANT" },
];

/** Reads the map for people who haven't been told how bridges work. */
export function BridgeLegend() {
  return (
    <div className="mt-3 border-2 border-border-default bg-surface-inset p-[10px_12px]">
      <div className="flex flex-wrap items-center gap-[10px]">
        <span className="font-mono text-[11px] text-ink-dim">BRIDGES</span>
        {KEYS.map((k) => (
          <span key={k.status} className="flex items-center gap-[6px]">
            <span className={cn("inline-block h-[12px] w-[12px] border-2", BRIDGE_TONE[k.status].className)} />
            <span className="font-mono text-[10px] text-ink-dim2">{k.label}</span>
          </span>
        ))}
      </div>
      <div className="mt-[7px] text-[13px] leading-[1.4] text-ink-dim">
        Each bridge sits on the border it opens. Clear the tile facing it on the side you already
        hold, then clear the bridge, and the region on the far side unlocks. Bridges work both ways
        — one whose regions are both open already leads nowhere new.
      </div>
    </div>
  );
}
