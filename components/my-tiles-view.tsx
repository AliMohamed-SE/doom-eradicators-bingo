"use client";

import { useApp } from "./app-provider";
import { findTarget } from "@/lib/scoring";

export function MyTilesView() {
  const { state, me, openTile } = useApp();
  const uid = me?.id ?? "";

  const myOn = Object.keys(state.claims)
    .filter((id) => (state.claims[id] || []).includes(uid))
    .map((id) => {
      const t = findTarget(id);
      return {
        id,
        name: t ? (t.kind === "bridge" ? t.name : t.n) : id,
        sub: t ? (t.kind === "bridge" ? "Bridge" : t.regionName) : "",
      };
    });

  return (
    <div className="mine-gradient max-w-[620px] border-2 border-green-border2 p-3">
      <div className="mb-[10px] font-mono text-[13px] text-green-text">TILES YOU&apos;RE ON</div>
      {myOn.length === 0 ? (
        <div className="text-[14px] text-green-soft2">
          Nothing yet. Open any tile and hit &ldquo;I&apos;m on this&rdquo;.
        </div>
      ) : (
        <div className="flex flex-col gap-[6px]">
          {myOn.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => openTile(m.id)}
              className="min-h-[48px] cursor-pointer border-2 border-green-border2 bg-green-bg2 p-[11px] text-left text-[15px] text-green-text2"
            >
              {m.name}
              <span className="text-[13px] text-green-soft2"> · {m.sub}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
