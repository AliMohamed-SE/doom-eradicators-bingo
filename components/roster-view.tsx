"use client";

import Image from "next/image";
import { useApp } from "./app-provider";
import { useConfirm } from "./confirm";
import { RARES, isLeaderPlayer } from "@/lib/board-data";
import { findTarget } from "@/lib/scoring";
import { unlinkPlayer } from "@/app/actions";
import { cn } from "@/lib/cn";

export function RosterView() {
  const { state, players, isLeader, openTile, run } = useApp();
  const confirm = useConfirm();

  return (
    <div className="border-2 border-border-default panel-gradient p-3">
      <div className="mb-[10px] font-mono text-[13px] text-orange">THE ROSTER</div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-2">
        {players.map((p) => {
          const onIds = Object.keys(state.claims).filter(
            (id) => id !== "free_space" && (state.claims[id] || []).includes(p.id),
          );
          const rareIds = p.rares ?? [];
          return (
            <div
              key={p.id}
              className={cn(
                "border-2 bg-surface-inset2 p-[10px]",
                onIds.length ? "border-green-border2" : "border-border-default",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[16px] text-amber-soft">
                  {p.name}
                  {isLeaderPlayer(p) ? " (leader)" : ""}
                </span>
                <span className="flex items-center gap-1">
                  {RARES.filter((r) => rareIds.includes(r.id)).map((r) => (
                    <Image
                      key={r.id}
                      src={r.img}
                      alt={r.name}
                      title={r.name}
                      width={22}
                      height={22}
                      className="pixelated h-[22px] w-[22px] object-contain"
                    />
                  ))}
                </span>
              </div>
              <div className="mt-[5px] text-[14px] text-ink-dim2">Task: {p.task || "No task set"}</div>
              {onIds.length ? (
                <div className="mt-2 flex flex-wrap gap-[5px]">
                  {onIds.map((id) => {
                    const t = findTarget(id);
                    const name = t ? (t.kind === "bridge" ? t.name : t.n) : id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => openTile(id)}
                        className="min-h-[40px] cursor-pointer border-2 border-green-border2 bg-green-bg2 p-[8px_10px] text-[14px] text-green-text2"
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-2 text-[14px] text-ink-dim">Not on anything</div>
              )}
              {isLeader && (
                <div className="mt-[10px] flex items-center justify-between gap-2 border-t border-border-dim pt-[8px]">
                  <span
                    className={cn(
                      "font-mono text-[11px]",
                      p.linked ? "text-green-soft2" : "text-ink-dim",
                    )}
                  >
                    {p.linked ? "● Discord linked" : "○ not linked"}
                  </span>
                  {p.linked && (
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await confirm({
                          title: "UNLINK MEMBER?",
                          message: `${p.name}'s Discord is removed and they'll have to sign in and pick their character again. Their progress is kept.`,
                          confirmLabel: "UNLINK",
                          tone: "danger",
                        });
                        if (ok) run(() => unlinkPlayer(p.id));
                      }}
                      className="min-h-[36px] cursor-pointer border-2 border-red-border bg-red-bg p-[6px_12px] font-mono text-[11px] text-red-text"
                    >
                      UNLINK
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
