// Display strings for bridges. Bridges sit on a border between two regions and
// are two-way, so every label has to say *where* the bridge is, not just what it
// asks for — that is the whole point of naming both ends everywhere.

import { REGIONS, BRIDGES, type Bridge } from "./board-data";
import { findTarget, type BridgeApproach, type Side } from "./scoring";

export const SIDE_ARROW: Record<Side, string> = {
  north: "↑",
  east: "→",
  south: "↓",
  west: "←",
};

export const SIDE_LABEL: Record<Side, string> = {
  north: "NORTH",
  east: "EAST",
  south: "SOUTH",
  west: "WEST",
};

export function regionName(id: string | null | undefined): string {
  if (!id) return "???";
  return REGIONS.find((r) => r.id === id)?.name ?? id;
}

/** A mystery bridge has no name yet — never print a bare "???" as a title. */
export function bridgeLabel(bridge: Bridge): string {
  const named = bridge.name;
  return bridge.mystery && (!named || named === "???") ? "Mystery bridge" : named;
}

export function bridgeObjective(bridge: Bridge): string {
  return !bridge.o || bridge.o === "???" ? "Objective not set yet" : bridge.o;
}

/** "Desert ↔ Fremennik" — the two regions this bridge joins. */
export function bridgeJoins(bridge: Bridge): string {
  return `${regionName(bridge.between[0])} ↔ ${regionName(bridge.between[1])}`;
}

/** The mono heading on a bridge button, which doubles as the "why" when locked. */
export function bridgeHeading(bridge: Bridge, approach: BridgeApproach): string {
  switch (approach.status) {
    case "done":
      return "BRIDGE CLEARED";
    case "redundant":
      return "BRIDGE REDUNDANT · BOTH SIDES ALREADY OPEN";
    case "locked":
      if (!approach.from) return "BRIDGE LOCKED · NEITHER SIDE OPEN YET";
      if (bridge.mystery) return "BRIDGE LOCKED · NO OBJECTIVE SET YET";
      return `BRIDGE LOCKED · CLEAR ${prereqName(approach).toUpperCase()} FIRST`;
    default:
      return `BRIDGE · OPENS ${regionName(approach.to).toUpperCase()}`;
  }
}

/** Name of the tile that gates this bridge from the side you'd cross from. */
export function prereqName(approach: BridgeApproach): string {
  if (!approach.prereq) return "its facing tile";
  const t = findTarget(approach.prereq);
  return t ? (t.kind === "bridge" ? t.name : t.n) : approach.prereq;
}

/** One-line hover text for the compact map markers. */
export function bridgeTooltip(bridge: Bridge, approach: BridgeApproach): string {
  return [
    `${bridgeLabel(bridge)} — ${bridgeJoins(bridge)}`,
    bridgeObjective(bridge),
    bridgeHeading(bridge, approach),
  ].join("\n");
}

export { BRIDGES };
