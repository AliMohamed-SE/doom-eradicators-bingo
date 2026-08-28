"use client";

import { useState, useTransition } from "react";
import { useApp, patchRivalName } from "./app-provider";
import { useConfirm } from "./confirm";
import { RivalRegionPanel } from "./rival-region-panel";
import {
  startRivalTracking,
  renameRivalBoard,
  clearRivalBoard,
  stopRivalTracking,
} from "@/app/actions";
import { scoreOf } from "@/lib/scoring";
import { cleanRivalName, RIVAL_NAME_MAX } from "@/lib/rival";
import { REGIONS } from "@/lib/board-data";
import { cn } from "@/lib/cn";

/**
 * Timestamps formatted in UTC, by hand.
 *
 * toLocaleString() would render in the server's timezone during SSR and the
 * reader's on hydration, which React reports as a mismatch — the same trap
 * /report avoids by stamping its date on the server. There is no server stamp to
 * lean on here (the value comes out of the database), so the format is made
 * timezone-free instead, and says so.
 */
function stampUtc(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  const s = d.toISOString();
  return `${s.slice(0, 10)} ${s.slice(11, 16)} UTC`;
}

/**
 * The rival board tab.
 *
 * Three shapes, in order of how often they are seen: the board (tracking is on),
 * the setup form (tracking is off and you are a leader), and the "nothing to see"
 * card (tracking is off and you are not — which the route already redirects away
 * from, so it is a backstop for the instant between a leader stopping tracking and
 * everyone else's realtime refresh landing).
 */
export function RivalView() {
  const { rival, rivalDone, isLeader, openCompare } = useApp();

  if (!rival) return isLeader ? <RivalSetup /> : <RivalOff />;

  const score = scoreOf(rivalDone);

  return (
    <div>
      <RivalHeader />

      {isLeader && (
        <div className="mb-3 border-2 border-amber-border focus-gradient p-[10px_12px]">
          <div className="mb-1 font-mono text-[12px] text-amber-text">LEADER · MARKING</div>
          <div className="text-[14px] leading-[1.45] text-amber-body">
            Tap a tile to mark it complete on their board, tap it again to take the mark back
            off. MARK ALL / CLEAR do a whole region at once, which is usually the shape a
            screenshot arrives in. Nothing on this tab writes to our board.
          </div>
        </div>
      )}

      {/* Phone: chip row + single region, the same shape as /board. */}
      <div className="board:hidden">
        <RivalPhoneBoard />
      </div>

      {/* Desktop: the nine regions as a plain 3x3. No bridge gutters — bridges only
          gate OUR unlocks and score nothing, so they have no meaning here. */}
      <div className="hidden board:grid board:grid-cols-3 board:gap-[6px]">
        {REGIONS.map((r) => (
          <RivalRegionPanel key={r.id} region={r} variant="desktop" />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-[14px] border-2 border-border-default bg-surface-inset p-[10px_12px]">
        <span className="font-mono text-[11px] text-ink-dim">THEIR SCORE</span>
        <span className="text-[14px]">
          Rows <b className="text-yellow">{score.rows}</b>
        </span>
        <span className="text-[14px]">
          Columns <b className="text-yellow">{score.cols}</b>
        </span>
        <span className="text-[14px]">
          Middles <b className="text-yellow">{score.mids}</b>
        </span>
        <span className="text-[14px]">
          Blackouts <b className="text-yellow">{score.blackouts}</b>
        </span>
        <span className="font-mono text-[13px] text-green-soft">TOTAL {score.total}</span>
        <button
          type="button"
          onClick={openCompare}
          className="ml-auto min-h-[42px] cursor-pointer border-2 border-orange bg-amber-btn p-[10px_14px] font-mono text-[12px] text-amber-soft"
        >
          COMPARE
        </button>
      </div>

      {isLeader && <RivalLeaderControls />}
    </div>
  );
}

/**
 * The two destructive controls, kept at the bottom and behind a confirm each.
 * STOP TRACKING is the only thing in the app that takes a whole tab away from the
 * team, so it says so in the dialog rather than only in the button.
 */
function RivalLeaderControls() {
  const confirm = useConfirm();
  const [busy, setBusy] = useState<"clear" | "stop" | null>(null);
  const [err, setErr] = useState("");
  const [, startWork] = useTransition();

  /*
   * These two get their own busy state rather than leaning on the header's global
   * strip. Both are confirmed, destructive and NOT optimistic — there is no local
   * patch to make them feel instant, so between the confirm closing and the
   * refresh landing the page is simply unchanged, which reads as "the button did
   * not work" and invites a second press. STOP TRACKING pressed twice is harmless;
   * pressed once and doubted is the actual problem.
   */
  function work(kind: "clear" | "stop", action: () => Promise<{ error?: string } | undefined>) {
    setBusy(kind);
    setErr("");
    startWork(async () => {
      const res = await action();
      const failed = res && "error" in res ? res.error : "";
      // The action revalidates on success, so on the happy path this component is
      // about to be replaced (stop) or re-rendered (clear) and the flag goes with
      // it. Clearing it here is what matters on the failure path.
      setBusy(null);
      if (failed) setErr(failed);
    });
  }

  async function clearAll() {
    const ok = await confirm({
      title: "CLEAR EVERY MARK?",
      message:
        "Unmark every tile on their board? Tracking stays on and the name is kept, but you would be re-reading the screenshots from scratch.",
      confirmLabel: "CLEAR ALL",
      tone: "danger",
    });
    if (ok) work("clear", clearRivalBoard);
  }

  async function stop() {
    const ok = await confirm({
      title: "STOP TRACKING?",
      message:
        "Delete the tracked board, its name and every mark, and hide the RIVAL tab from the whole team? Setting tracking up again starts from an empty board.",
      confirmLabel: "STOP TRACKING",
      tone: "danger",
    });
    if (ok) work("stop", stopRivalTracking);
  }

  return (
    <div className="mt-3 border-2 border-border-default panel-gradient p-3">
      <div className="mb-[10px] font-mono text-[13px] text-orange">LEADER CONTROLS</div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={clearAll}
          disabled={busy !== null}
          className={cn(
            "min-h-[44px] cursor-pointer border-2 border-border-default bg-surface-dark p-[11px_14px] font-mono text-[12px] text-ink-dim",
            busy !== null && "opacity-60",
          )}
        >
          {busy === "clear" ? "CLEARING…" : "CLEAR ALL MARKS"}
        </button>
        <button
          type="button"
          onClick={stop}
          disabled={busy !== null}
          className={cn(
            "min-h-[44px] cursor-pointer border-2 border-red-border bg-red-bg p-[11px_14px] font-mono text-[12px] text-red-text",
            busy !== null && "opacity-60",
          )}
        >
          {busy === "stop" ? "STOPPING…" : "STOP TRACKING"}
        </button>
      </div>
      {err && (
        <div className="mt-2 border-2 border-red-border bg-red-bg p-[8px_10px] text-[13px] text-red-text">
          {err}
        </div>
      )}
      <div className="mt-[10px] text-[13px] leading-[1.45] text-ink-dim">
        Stopping tracking hides this tab for everyone. Our board, our progress and our points
        are untouched either way — this tab has never written to them.
      </div>
    </div>
  );
}

/** Board name, freshness, and the leader's rename control. */
function RivalHeader() {
  const { rival, isLeader, run } = useApp();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState("");
  const [saving, startSaving] = useTransition();

  if (!rival) return null;
  const clean = cleanRivalName(draft);

  /*
   * Reports inline and stays open on failure, exactly like the proof popup: this is
   * one of the two places in this tab where a rejected save would throw away
   * something somebody typed. Everything else here is a toggle you can just tap
   * again.
   */
  const save = () => {
    if (!clean || saving) return;
    setErr("");
    startSaving(async () => {
      const res = await renameRivalBoard(clean);
      const failed = res && "error" in res ? res.error : "";
      if (failed) {
        setErr(failed);
        return;
      }
      // The action has already revalidated server-side; this patches the snapshot so
      // the header shows the new name before the refresh lands.
      run(async () => {}, patchRivalName(clean));
      setEditing(false);
    });
  };

  return (
    <div className="mb-3 border-2 border-border-default panel-gradient p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-mono text-[11px] text-ink-dim">TRACKING THEIR BOARD</div>
          <div className="mt-1 font-mono text-[17px] text-orange [text-shadow:1px_1px_0_#000]">
            {rival.name}
          </div>
          <div className="mt-1 text-[13px] text-ink-dim">
            Last updated {stampUtc(rival.updatedAt)}
          </div>
        </div>
        {isLeader && !editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(rival.name);
              setErr("");
              setEditing(true);
            }}
            className="min-h-[42px] cursor-pointer border-2 border-amber-border bg-surface-dark p-[10px_12px] font-mono text-[11px] text-amber-text"
          >
            RENAME
          </button>
        )}
      </div>

      {isLeader && editing && (
        <>
          <div className="mt-[10px] flex flex-wrap gap-2">
            <input
              autoFocus
              value={draft}
              maxLength={RIVAL_NAME_MAX}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="Their clan / board name"
              className="min-h-[44px] min-w-[220px] flex-1 border-2 border-border-default bg-surface-inset p-[10px] text-[15px] text-ink"
            />
            <button
              type="button"
              disabled={!clean || saving}
              onClick={save}
              className={cn(
                "min-h-[44px] cursor-pointer border-2 p-[10px_14px] font-mono text-[12px]",
                clean && !saving
                  ? "border-green-border2 bg-green-bg2 text-green-text2"
                  : "border-border-dim bg-surface-dark text-ink-faint",
              )}
            >
              {saving ? "SAVING…" : "SAVE"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="min-h-[44px] cursor-pointer border-2 border-border-default bg-surface-dark p-[10px_14px] font-mono text-[12px] text-ink-dim"
            >
              CANCEL
            </button>
          </div>
          {err && (
            <div className="mt-2 border-2 border-red-border bg-red-bg p-[8px_10px] text-[13px] text-red-text">
              {err}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Region chips + one region, mirroring the phone half of /board. */
function RivalPhoneBoard() {
  const { rivalDone, region, selectRegion } = useApp();
  const current = REGIONS.find((r) => r.id === region) ?? REGIONS[0];

  return (
    <>
      <div className="scroll-x mb-[10px] flex gap-[6px] overflow-x-auto pb-2">
        {REGIONS.map((r) => {
          const n = r.tiles.filter((t) => rivalDone.has(t.id)).length;
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
              {r.name.toUpperCase()} · {n}/{r.tiles.length}
            </button>
          );
        })}
      </div>
      {current && <RivalRegionPanel region={current} variant="phone" />}
    </>
  );
}

/** Leader, tracking off: name the board and switch it on. */
function RivalSetup() {
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [saving, startSaving] = useTransition();
  const clean = cleanRivalName(name);

  // No optimistic patch and no run(): switching tracking on adds a tab for the whole
  // team, so the honest thing is to wait for the server to say it happened. Reports
  // inline for the same reason the rename does — the name is typed, not tapped.
  const start = () => {
    if (!clean || saving) return;
    setErr("");
    startSaving(async () => {
      const res = await startRivalTracking(clean);
      const failed = res && "error" in res ? res.error : "";
      if (failed) setErr(failed);
    });
  };

  return (
    <div className="border-2 border-border-default panel-gradient p-3">
      <div className="mb-[10px] font-mono text-[13px] text-orange">TRACK A RIVAL BOARD</div>
      <div className="mb-3 text-[15px] leading-[1.5] text-ink [text-wrap:pretty]">
        Name the board you want to track, then mark off the tiles you see completed in the
        screenshots you are given. Their points are worked out with the same rule as ours, and
        COMPARE lays the two boards side by side.
      </div>
      <div className="mb-3 border-2 border-amber-border focus-gradient p-[10px_12px] text-[14px] leading-[1.45] text-amber-body">
        Nothing here is visible to the team until you switch it on — not even the RIVAL tab
        itself. Once it is on, everyone can read it and use COMPARE; only leaders can mark
        tiles.
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          value={name}
          maxLength={RIVAL_NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && start()}
          placeholder="Their clan / board name"
          className="min-h-[46px] min-w-[220px] flex-1 border-2 border-border-default bg-surface-inset p-[11px] text-[15px] text-ink"
        />
        <button
          type="button"
          disabled={!clean || saving}
          onClick={start}
          className={cn(
            "min-h-[46px] cursor-pointer border-2 p-[11px_16px] font-mono text-[12px]",
            clean && !saving
              ? "border-orange bg-amber-btn text-amber-soft"
              : "border-border-dim bg-surface-dark text-ink-faint",
          )}
        >
          {saving ? "STARTING…" : "START TRACKING"}
        </button>
      </div>
      {err && (
        <div className="mt-2 border-2 border-red-border bg-red-bg p-[8px_10px] text-[13px] text-red-text">
          {err}
        </div>
      )}
    </div>
  );
}

/** Not a leader, tracking off. The route redirects, so this is the race backstop. */
function RivalOff() {
  return (
    <div className="border-2 border-border-default panel-gradient p-3">
      <div className="mb-2 font-mono text-[13px] text-orange">NO RIVAL BOARD</div>
      <div className="text-[15px] leading-[1.5] text-ink-dim">
        Nobody is tracking a rival board right now. A leader has to set one up.
      </div>
    </div>
  );
}
