"use client";

import { useApp } from "./app-provider";
import { SheetShell } from "./sheet-shell";
import { compareBoards, compareState, type CompareState } from "@/lib/rival";
import { REGIONS } from "@/lib/board-data";
import { cn } from "@/lib/cn";

/**
 * The four cell treatments, and the words that go with them.
 *
 * The label is not decoration. This app already prints PROOF / NO PROOF in words
 * rather than in colour because a printed report drops background fills, and the
 * same reasoning applies to anyone reading a screenshot of this sheet in Discord
 * on a bad phone screen: the state has to survive without the colour.
 */
const COMPARE_SKIN: Record<
  CompareState,
  { className: string; badge: string; legend: string }
> = {
  both: {
    className: "border-tile-done-border bg-tile-done-bg text-tile-done-text",
    badge: "BOTH",
    legend: "Both teams have finished it.",
  },
  us: {
    className: "border-blue-border bg-blue-bg text-blue-text",
    badge: "US",
    legend: "We have it, they do not — our lead.",
  },
  them: {
    className: "border-red-border bg-red-bg text-red-text",
    badge: "THEM",
    legend: "They have it, we do not — the gap.",
  },
  none: {
    className: "border-tile-locked-border bg-tile-locked-bg text-tile-locked-text",
    badge: "—",
    legend: "Nobody has it yet — still up for grabs.",
  },
};

/** Legend order, which is also the order the tallies read best in. */
const ORDER: CompareState[] = ["both", "us", "them", "none"];

/**
 * Our board and theirs, tile for tile.
 *
 * Read-only by construction: it takes both done-sets off the provider and renders,
 * with no action imported and nothing clickable inside. That is the whole promise
 * of the feature — anybody can open it, including the players who cannot mark the
 * rival board, because there is nothing here to get wrong.
 */
export function CompareSheet() {
  const { state, rival, rivalDone, closeDrawer } = useApp();

  // Tracking can be stopped by a leader while somebody else has this open; realtime
  // then clears `rival` under us. Closing is the honest response to comparing
  // against a board that no longer exists.
  if (!rival) return null;

  const { us, them, lead, counts } = compareBoards(state.done, rivalDone);

  return (
    <SheetShell kindLabel="COMPARE" name={`Us vs ${rival.name}`} onClose={closeDrawer} maxWidth="1180px">
      {/* Score line. The delta is the one number anybody actually opened this for. */}
      <div className="grid gap-2 sm:grid-cols-3">
        <ScoreCard label="US" score={us.total} detail={`${us.rows / 5} rows · ${us.cols / 5} cols`} />
        <ScoreCard
          label={rival.name.toUpperCase()}
          score={them.total}
          detail={`${them.rows / 5} rows · ${them.cols / 5} cols`}
        />
        <div
          className={cn(
            "border-2 p-[10px_12px]",
            lead > 0
              ? "border-green-border bg-green-bg"
              : lead < 0
                ? "border-red-border bg-red-bg"
                : "border-border-default bg-surface-inset",
          )}
        >
          <div className="font-mono text-[11px] text-ink-dim">
            {lead > 0 ? "WE LEAD BY" : lead < 0 ? "WE TRAIL BY" : "LEVEL"}
          </div>
          <div
            className={cn(
              "mt-1 font-mono text-[22px] [text-shadow:1px_1px_0_#000]",
              lead > 0 ? "text-green-soft" : lead < 0 ? "text-red-text" : "text-ink-dim2",
            )}
          >
            {Math.abs(lead)}
          </div>
        </div>
      </div>

      {/* Legend + tallies in one block: the count is the thing the colour means. */}
      <div className="border-2 border-border-default bg-surface-inset p-[10px_12px]">
        <div className="mb-2 font-mono text-[11px] text-ink-dim">
          LEGEND · {counts.total} TILES
        </div>
        <div className="grid gap-[6px] sm:grid-cols-2">
          {ORDER.map((k) => (
            <div key={k} className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-[30px] w-[62px] flex-none items-center justify-center border-2 font-mono text-[11px]",
                  COMPARE_SKIN[k].className,
                )}
              >
                {COMPARE_SKIN[k].badge}
              </span>
              <span className="text-[14px] leading-[1.35] text-ink-dim2">
                <b className="text-yellow">{counts[k]}</b> — {COMPARE_SKIN[k].legend}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* The board itself, nine regions of nine cells. No unlock state, no bridges,
          no progress: this view is only ever about who has what. */}
      <div className="grid gap-2 board:grid-cols-3">
        {REGIONS.map((r) => {
          const cells = r.tiles.map((t) => ({
            tile: t,
            st: compareState(state.done, rivalDone, t.id),
          }));
          const ours = cells.filter((c) => c.st === "us").length;
          const theirs = cells.filter((c) => c.st === "them").length;
          return (
            <div key={r.id} className="region-gradient border-2 border-border-default p-[9px]">
              <div className="flex items-baseline justify-between gap-[6px] pb-[8px]">
                <span className="font-mono text-[12px] text-orange">{r.name}</span>
                <span className="text-[12px] text-ink-dim">
                  +{ours} / −{theirs}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-[4px]">
                {cells.map(({ tile, st }) => (
                  <div key={tile.id} className="aspect-square">
                    <div
                      title={`${tile.n} — ${COMPARE_SKIN[st].legend}`}
                      className={cn(
                        "flex h-full w-full flex-col items-center justify-between gap-[3px] border p-[4px_3px] text-center",
                        COMPARE_SKIN[st].className,
                      )}
                    >
                      <span className="font-mono text-[9px]">{COMPARE_SKIN[st].badge}</span>
                      <span className="flex flex-1 items-center overflow-hidden text-[11px] leading-[1.1]">
                        {tile.n}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-[13px] leading-[1.45] text-ink-dim">
        Their side is whatever a leader has marked off the screenshots, so it is only as
        current as the last update. Nothing in this view changes either board.
      </div>
    </SheetShell>
  );
}

function ScoreCard({ label, score, detail }: { label: string; score: number; detail: string }) {
  return (
    <div className="border-2 border-border-default bg-surface-inset p-[10px_12px]">
      <div className="truncate font-mono text-[11px] text-ink-dim" title={label}>
        {label}
      </div>
      <div className="mt-1 font-mono text-[22px] text-yellow [text-shadow:1px_1px_0_#000]">
        {score}
      </div>
      <div className="mt-1 text-[12px] text-ink-dim">{detail}</div>
    </div>
  );
}
