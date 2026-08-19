"use client";

import Image from "next/image";
import { useApp, patchClaim } from "./app-provider";
import { useConfirm } from "./confirm";
import { SheetShell } from "./sheet-shell";
import { TileProgress } from "./tile-progress";
import { SKIN } from "./variants";
import { RARES } from "@/lib/board-data";
import {
  findTarget,
  tileState,
  contributors,
  tileRuleList,
  intentCounts,
  intentPlayers,
  infoFor,
  fmtHrs,
  bridgeApproach,
} from "@/lib/scoring";
import { toggleClaim, removeWorker, toggleFocus, forceCompletion } from "@/app/actions";
import {
  bridgeJoins,
  bridgeHeading,
  bridgeObjective,
  bridgeLabel,
  regionName,
} from "@/lib/bridge-text";
import { cn } from "@/lib/cn";

const STATE_LABEL = { locked: "LOCKED", available: "OPEN", working: "ON IT", done: "DONE" } as const;

export function TileSheet({ id }: { id: string }) {
  const app = useApp();
  const { state, me, isLeader, playerById, playerName, completionMeta, closeDrawer, run } = app;
  const confirm = useConfirm();
  const target = findTarget(id);
  if (!target) return null;

  const displayName = target.kind === "bridge" ? bridgeLabel(target) : target.n;
  const approach = target.kind === "bridge" ? bridgeApproach(target, state) : null;

  const uid = me?.id ?? "";
  const st = tileState(target, state);
  const skin = SKIN[st];
  const isDone = st === "done";
  const crew = state.claims[id] || [];
  const iAmOn = !!uid && crew.includes(uid);
  const mineCount = state.progress[id]?.[uid] ?? 0;
  const focused = state.focusTiles.includes(id);
  const canProgress = !!uid && st !== "locked" && !isDone && (isLeader || iAmOn || mineCount > 0);
  const canDown = !!uid && !isDone && st !== "locked";

  const kindLabel =
    target.kind === "bridge"
      ? "BRIDGE · " + bridgeJoins(target).toUpperCase()
      : target.regionName.toUpperCase() + " REGION";

  const rules = tileRuleList(id);
  const contribs = contributors(state.progress, id);
  const iCount = intentCounts(state.intents, id);

  const meta = completionMeta[id];
  const doneStamp = meta?.completedAt
    ? "Finished " +
      new Date(meta.completedAt).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Finished (no date recorded)";
  const finishedBy =
    contribs.length === 1
      ? "Finished by " + playerName(contribs[0].playerId)
      : contribs.length
        ? "Everyone who chipped in:"
        : "No contributions were logged.";

  const info = infoFor(target);
  const infoRows = info.rows.map((r) => ({
    name: r.name,
    detail: r.detail,
    est: r.hours ? "≈ " + fmtHrs(r.hours) : "—",
    best: !!r.hours && r.hours === info.best,
  }));

  let estLine = "";
  if (info.fixed && !info.rows.length) estLine = "Deterministic grind — no drop rate involved.";
  else if (info.fixed)
    estLine =
      "Set grind — the rows above are single-item rates and don't simply add up. See the note below.";
  else if (info.kind === "rate") estLine = info.rows.length ? info.rows[0].detail : "";
  else if (info.kind === "drops")
    estLine =
      (info.need > 1 ? info.need + "× needed · " : "") +
      (infoRows.length > 1 ? "fastest route: " + info.bestName : info.bestName);

  const nameLine = (v: "want" | "ok" | "no", word: string) => {
    const names = intentPlayers(state.intents, id, v).map(playerName);
    return names.length ? word + ": " + names.join(", ") : "";
  };

  const staffLine = isDone
    ? "Locked in"
    : crew.length
      ? crew.length + (crew.length === 1 ? " person on this" : " people on this")
      : "Nobody on this yet";

  return (
    <SheetShell kindLabel={kindLabel} name={displayName} onClose={closeDrawer}>
      {/* Objective */}
      <div className="border-2 border-border-default bg-parchment p-3 text-[16px] leading-[1.35] text-parchment-ink">
        {target.kind === "bridge" ? bridgeObjective(target) : target.o}
      </div>

      {/* Where this bridge lies, and which way it would be crossed. */}
      {target.kind === "bridge" && approach && (
        <div className="grid gap-[5px] border-2 border-border-default bg-surface-inset p-[10px]">
          <div className="font-mono text-[11px] text-ink-dim">WHERE IT LIES</div>
          <div className="text-[15px] leading-[1.35]">
            On the border between {regionName(target.between[0])} and{" "}
            {regionName(target.between[1])}.
          </div>
          <div className={cn("font-mono text-[11px]", approach.status === "locked" ? "text-ink-dim" : "text-amber-text")}>
            {bridgeHeading(target, approach)}
          </div>
          <div className="text-[13px] leading-[1.35] text-ink-dim">
            {approach.status === "redundant"
              ? "Both regions are already open, so clearing this one opens nothing new."
              : approach.from
                ? "Crossed from " + regionName(approach.from) + ", which is already open."
                : "Neither side is open yet — get to one of them first."}
          </div>
        </div>
      )}

      {/* Rules for this tile */}
      {rules.length > 0 && (
        <div className="grid gap-[6px] border-2 border-amber-border bg-amber-bg p-[10px]">
          <div className="flex items-center gap-[7px]">
            <span className="inline-flex h-[18px] w-[18px] items-center justify-center border border-amber-border bg-surface-inset font-mono text-[12px] text-amber-text">
              ?
            </span>
            <span className="font-mono text-[11px] text-amber-text">RULES FOR THIS TILE</span>
          </div>
          {rules.map((r, i) => (
            <div key={i} className="text-[15px] leading-[1.35] text-amber-body">
              · {r}
            </div>
          ))}
        </div>
      )}

      {/* State chip + crew line */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("border-2 px-[10px] py-[7px] font-mono text-[11px]", skin.className)}>
          {STATE_LABEL[st]}
          {crew.length && !isDone ? " · " + crew.length : ""}
        </span>
        <span className="text-[14px] text-ink-dim">{staffLine}</span>
      </div>

      {/* Progress — counter, checklist or bulk entry, depending on the objective */}
      <TileProgress
        target={target}
        canProgress={canProgress}
        isDone={isDone}
        name={displayName}
      />

      {/* Completion panel */}
      {isDone && (
        <div className="grid gap-[5px] border-2 border-green-border bg-green-bg p-[10px]">
          <div className="font-mono text-[11px] text-green-soft">{doneStamp}</div>
          <div className="text-[15px] text-green-text2">{finishedBy}</div>
          {contribs.length > 1 && (
            <div className="flex flex-col gap-[3px]">
              {contribs.map((c) => (
                <div key={c.playerId} className="text-[14px] text-green-text">
                  {playerName(c.playerId)} — {c.count}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* I'm on this */}
      {canDown && (
        <button
          type="button"
          onClick={() =>
            run(() => toggleClaim(id, !iAmOn), uid ? patchClaim(uid, id, !iAmOn) : undefined)
          }
          className={cn(
            "min-h-[52px] w-full cursor-pointer border-2 p-[15px] font-mono text-[13px]",
            iAmOn
              ? "border-red-border bg-red-bg text-red-text"
              : "border-green-border2 bg-green-bg2 text-green-text2",
          )}
        >
          {iAmOn ? "I'M OFF THIS" : "I'M ON THIS"}
        </button>
      )}

      {/* Crew */}
      {!isDone && (
        <div className="border-2 border-green-border2 bg-green-bg4 p-[10px]">
          <div className="mb-2 font-mono text-[11px] text-green-text">WORKING ON THIS</div>
          {crew.length === 0 ? (
            <div className="text-[14px] text-green-soft2">Nobody on this yet.</div>
          ) : (
            <div className="flex flex-col gap-[6px]">
              {crew.map((pid) => {
                const p = playerById(pid);
                const rareIds = p?.rares ?? [];
                return (
                  <div key={pid} className="flex items-stretch gap-[6px]">
                    <div className="min-h-[52px] flex-1 border-2 border-green-border2 bg-green-bg3 p-[9px_10px] text-[15px] text-green-text2">
                      <span className="flex items-center gap-[7px]">
                        <span className="flex-1">
                          {playerName(pid)}
                        </span>
                        <span className="text-[13px] text-green-soft2">
                          {(state.progress[id]?.[pid] ?? 0) + " logged"}
                        </span>
                        {RARES.filter((r) => rareIds.includes(r.id)).map((r) => (
                          <Image
                            key={r.id}
                            src={r.img}
                            alt={r.name}
                            title={r.name}
                            width={20}
                            height={20}
                            className="pixelated h-[20px] w-[20px] object-contain"
                          />
                        ))}
                      </span>
                      <span className="mt-[2px] block text-[13px] text-green-soft2">
                        {p?.task || "No task set"}
                      </span>
                    </div>
                    {isLeader && (
                      <button
                        type="button"
                        onClick={() => run(() => removeWorker(id, pid))}
                        className="min-h-[52px] w-[46px] cursor-pointer border-2 border-red-border bg-red-bg text-[16px] text-red-text"
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* From planning */}
      <div className="grid gap-[7px] border-2 border-border-default bg-surface-inset p-[10px]">
        <div className="font-mono text-[11px] text-ink-dim">FROM PLANNING</div>
        <div className="text-[15px] text-ink-dim2">
          {iCount.total
            ? `${iCount.want} want · ${iCount.ok} willing · ${iCount.no} won't`
            : "Nobody has answered for this tile yet"}
        </div>
        {nameLine("want", "Want it") && (
          <div className="text-[14px] leading-[1.35] text-green-text">{nameLine("want", "Want it")}</div>
        )}
        {nameLine("ok", "Willing") && (
          <div className="text-[14px] leading-[1.35] text-amber-body">{nameLine("ok", "Willing")}</div>
        )}
        {nameLine("no", "Won't") && (
          <div className="text-[14px] leading-[1.35] text-red-text2">{nameLine("no", "Won't")}</div>
        )}
      </div>

      {/* Leader controls */}
      {isLeader && (
        <div className="grid gap-[9px] border-2 border-amber-border bg-amber-bg p-[10px]">
          <div className="font-mono text-[11px] text-amber-text">LEADER CONTROLS</div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(135px,1fr))] gap-[6px]">
            <button
              type="button"
              onClick={() => run(() => toggleFocus("tile", id, !focused))}
              className={cn(
                "min-h-[46px] cursor-pointer border-2 border-amber-border p-[11px] text-[14px] text-amber-body",
                focused ? "bg-amber-btn" : "bg-surface-dark",
              )}
            >
              {focused ? "Drop focus" : "Focus this tile"}
            </button>
            <button
              type="button"
              onClick={async () => {
                // Undoing wipes the completion, every logged count and every tick.
                // On a bulk tile that is thousands of units, so it asks first.
                if (isDone) {
                  const ok = await confirm({
                    title: "UNDO DONE?",
                    message: `This un-completes "${displayName}" and clears everything logged on it. Are you sure?`,
                    confirmLabel: "UNDO IT",
                    tone: "danger",
                  });
                  if (!ok) return;
                }
                run(() => forceCompletion(id, !isDone));
              }}
              className={cn(
                "min-h-[46px] cursor-pointer border-2 p-[11px] text-[14px]",
                isDone
                  ? "border-border-default bg-surface-dark text-ink"
                  : "border-green-border2 bg-green-bg2 text-green-text2",
              )}
            >
              {isDone ? "Undo done" : "Mark done"}
            </button>
          </div>
        </div>
      )}

      {/* OSRS info */}
      <div className="grid gap-2 border-2 border-border-default bg-surface-inset p-[10px]">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] text-ink-dim">OSRS INFO</span>
          <span
            className="border px-[7px] py-[4px] font-mono text-[11px]"
            style={
              info.conf
                ? { borderColor: info.conf.border, color: info.conf.color }
                : { borderColor: "#6b5c44", color: "#a2957a" }
            }
          >
            {info.conf ? info.conf.label : "CHALLENGE"}
          </span>
        </div>
        <div className="text-[15px]">
          Source: <span className="text-link">{target.s || "—"}</span>
        </div>

        {infoRows.length > 0 && (
          <div className="flex flex-col gap-[5px]">
            {infoRows.map((rw, i) => (
              <div
                key={i}
                className="border bg-surface-inset2 p-[8px_9px]"
                style={{ borderColor: rw.best ? "#a8862c" : "#4b4030" }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[15px] leading-[1.2] text-ink">{rw.name}</span>
                  <span
                    className="whitespace-nowrap font-mono text-[13px]"
                    style={{ color: rw.best ? "#ffff5c" : "#c8b98f" }}
                  >
                    {rw.est}
                  </span>
                </div>
                <div className="mt-1 text-[13px] text-ink-dim">{rw.detail}</div>
              </div>
            ))}
          </div>
        )}

        {info.best && (
          <div className="border-2 border-amber-border bg-amber-bg p-[10px]">
            <div className="font-mono text-[11px] text-amber-text">EST. TIME TO COMPLETE · SOLO</div>
            <div className="mt-[6px] font-mono text-[21px] text-amber-body">
              ≈ {fmtHrs(info.best)}
            </div>
            <div className="mt-[5px] text-[14px] leading-[1.35] text-ink-dim2">{estLine}</div>
          </div>
        )}

        {!info.best && infoRows.length === 0 && (
          <div className="text-[14px] leading-[1.35] text-ink-dim2">
            {info.kind === "challenge"
              ? "Challenge tile — nothing to roll for, so no rate and no time estimate."
              : "No drop rate on record for this tile yet."}
          </div>
        )}

        {info.note && <div className="text-[13px] leading-[1.35] text-ink-dim">{info.note}</div>}

        {info.best && (
          <div className="border-t border-[#3d3427] pt-[7px] text-[12px] leading-[1.35] text-ink-faint">
            Kills per hour are a rough average for decent gear. Your gear, prayer, team size and
            experience move it a long way in both directions, so read every estimate as a ballpark,
            not a promise.
          </div>
        )}

        {target.w && (
          <a href={target.w} target="_blank" rel="noreferrer" className="text-[15px]">
            Open OSRS Wiki ↗
          </a>
        )}
      </div>
    </SheetShell>
  );
}
