"use client";

import { useApp } from "./app-provider";
import { BRIDGE_TONE } from "./variants";
import { tileState, infoFor, fmtHrs } from "@/lib/scoring";
import type { Bridge } from "@/lib/board-data";
import { cn } from "@/lib/cn";

const HEADINGS = {
  done: "BRIDGE CLEARED · REGION UNLOCKED",
  locked: "BRIDGE LOCKED · CLEAR ITS PREREQ FIRST",
  open: "BRIDGE · CLEAR THIS TO UNLOCK THE REGION",
} as const;

export function BridgeButton({ bridge, variant }: { bridge: Bridge; variant: "phone" | "desktop" }) {
  const { state, openTile } = useApp();
  const phone = variant === "phone";
  const target = { ...bridge, kind: "bridge" as const };
  const st = tileState(target, state);
  const toneKey = st === "done" ? "done" : st === "locked" ? "locked" : "open";
  const tone = BRIDGE_TONE[toneKey];

  const named = bridge.name;
  const label = bridge.mystery && (!named || named === "???") ? "Mystery bridge" : named;

  const info = infoFor(target);
  const crew = (state.claims[bridge.id] || []).length;
  const sub =
    bridge.o +
    (st !== "done" && info.best ? "  ·  ≈ " + fmtHrs(info.best) : "") +
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
        {HEADINGS[toneKey]}
      </span>
      <span className={cn("block", phone ? "mt-[4px] text-[16px]" : "mt-[3px] text-[14px]")}>
        {label}
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
