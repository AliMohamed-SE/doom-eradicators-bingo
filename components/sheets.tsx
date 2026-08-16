"use client";

import { useApp } from "./app-provider";
import { TileSheet } from "./tile-sheet";
import { RegionSheet } from "./region-sheet";
import { PlanPickSheet } from "./plan-pick-sheet";

export function Sheets() {
  const { drawer } = useApp();
  if (!drawer) return null;
  if (drawer.kind === "tile") return <TileSheet id={drawer.id} />;
  if (drawer.kind === "region") return <RegionSheet id={drawer.id} />;
  if (drawer.kind === "planpick") return <PlanPickSheet id={drawer.id} />;
  return null;
}
