"use client";

import { useApp, patchIntent } from "./app-provider";
import { SheetShell } from "./sheet-shell";
import { INTENT_BTN, PLAN_TONE } from "./variants";
import { findTarget, intentCounts, intentPlayers, type Intent } from "@/lib/scoring";
import { setIntent } from "@/app/actions";
import { cn } from "@/lib/cn";

export function PlanPickSheet({ id }: { id: string }) {
  const { state, me, planViewing, planUid, playerName, closeDrawer, openTile, run } = useApp();
  const target = findTarget(id);
  if (!target || target.kind !== "tile") return null;

  const uid = me?.id ?? "";
  // While a leader is inspecting someone else's board this sheet reports their
  // answer and cannot be edited — picking here would silently record your own.
  const readOnly = !!planViewing;
  const mine = (state.intents[id]?.[planUid] ?? "") as Intent | "";
  const c = intentCounts(state.intents, id);

  const nameLine = (v: Intent, word: string) => {
    const names = intentPlayers(state.intents, id, v).map(playerName);
    return names.length ? word + ": " + names.join(", ") : "";
  };

  const pick = (v: Intent) => {
    if (readOnly) return;
    const next = mine === v ? null : v;
    run(() => setIntent(id, next), uid ? patchIntent(uid, id, next) : undefined);
  };

  return (
    <SheetShell
      kindLabel={(target.regionName || "BRIDGE").toUpperCase()}
      name={target.n}
      onClose={closeDrawer}
      maxWidth="520px"
    >
      <div className="border-2 border-border-default bg-parchment p-3 text-[16px] leading-[1.35] text-parchment-ink">
        {target.o}
      </div>
      <div className="text-[14px] text-ink-dim">
        Source: <span className="text-link">{target.s || "—"}</span>
      </div>

      <div className="grid grid-cols-3 gap-[7px]">
        {(["want", "ok", "no"] as Intent[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => pick(v)}
            disabled={readOnly}
            aria-pressed={mine === v}
            className={cn(
              "min-h-[66px] border-2 p-[12px_6px] font-mono text-[12px]",
              readOnly ? "cursor-default" : "cursor-pointer",
              mine === v ? INTENT_BTN[v].on : INTENT_BTN[v].off,
            )}
          >
            {INTENT_BTN[v].label}
          </button>
        ))}
      </div>

      <div
        className={cn(
          "text-[15px]",
          mine === "want"
            ? "text-green-text"
            : mine === "ok"
              ? "text-amber-soft"
              : mine === "no"
                ? "text-red-text"
                : "text-ink-dim",
        )}
      >
        {planViewing
          ? mine
            ? `${planViewing.name} said: ${PLAN_TONE[mine].badge}`
            : `${planViewing.name} hasn't answered this one`
          : mine
            ? "You said: " + PLAN_TONE[mine].badge
            : "You haven't answered this one"}
      </div>
      {planViewing && (
        <div className="text-[13px] text-amber-body">
          You&apos;re viewing {planViewing.name}&apos;s planning board — switch back to your own on
          the planning tab to change your answers.
        </div>
      )}

      <div className="grid gap-[5px] border-2 border-border-default bg-surface-inset p-[10px]">
        <div className="font-mono text-[11px] text-ink-dim">THE TEAM</div>
        <div className="text-[15px] text-ink-dim2">
          {c.total
            ? `${c.want} want · ${c.ok} willing · ${c.no} won't`
            : "Nobody has answered this tile yet"}
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

      <button
        type="button"
        onClick={() => openTile(id)}
        className="min-h-[50px] w-full cursor-pointer border-2 border-border-default bg-surface-btn p-[13px] text-[15px] text-ink"
      >
        Open full tile info (rates, estimate)
      </button>
    </SheetShell>
  );
}
