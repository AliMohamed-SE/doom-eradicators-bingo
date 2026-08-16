"use client";

import { RULE_SECTIONS } from "@/lib/board-data";
import { findTarget } from "@/lib/scoring";

function appliesTo(tiles: string[] | undefined): string {
  if (!tiles || tiles.length === 0) return "";
  const names = tiles
    .map((id) => {
      const t = findTarget(id);
      return t ? (t.kind === "bridge" ? t.name : t.n) : null;
    })
    .filter(Boolean) as string[];
  return names.length ? "Applies to: " + names.join(" · ") : "";
}

export function RulesView() {
  return (
    <div className="flex max-w-[860px] flex-col gap-3">
      <div className="border-2 border-border-default panel-gradient p-3">
        <div className="font-mono text-[13px] text-orange">EVENT RULES</div>
        <div className="mt-[6px] text-[14px] leading-[1.35] text-ink-dim2 [text-wrap:pretty]">
          Tiles marked{" "}
          <span className="inline-flex h-[15px] w-[15px] items-center justify-center border border-amber-border font-mono text-[10px] text-amber-text">
            ?
          </span>{" "}
          on the board have their own rules. Open the tile to read them.
        </div>
      </div>

      {RULE_SECTIONS.map((sec) => (
        <div key={sec.id} className="border-2 border-border-default bg-parchment p-[14px] text-parchment-ink">
          <div className="mb-[10px] border-b-2 border-parchment-rule pb-2 font-mono text-[12px] text-parchment-head">
            {sec.title}
          </div>
          <div className="flex flex-col gap-[10px]">
            {sec.items.map((item, i) => {
              const line = appliesTo(item.tiles);
              return (
                <div key={i}>
                  <div className="text-[15px] leading-[1.35] [text-wrap:pretty]">· {item.text}</div>
                  {line && (
                    <div className="ml-3 mt-1 font-mono text-[12px] leading-[1.35] text-parchment-tileref [text-wrap:pretty]">
                      {line}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
