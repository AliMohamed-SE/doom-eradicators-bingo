"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "./app-provider";

/**
 * "Some of this board did not load."
 *
 * The one thing this app must never do is render an incomplete load as if it were
 * the truth. A failed read of tile_completions produces an empty done-set, and an
 * empty done-set draws a perfectly healthy board on which nobody has finished
 * anything — no error, no gap, nothing to notice. The reader's only clue is that a
 * reload "fixes" it, which is how the failure stays unreported for weeks.
 *
 * So a failed read gets a banner the reader cannot miss, naming what is missing,
 * with the reload right there. lib/data.ts has already retried once by this point:
 * if this is on screen, two attempts failed and a human should press the button.
 */
export function LoadWarning() {
  const { failedReads } = useApp();
  const router = useRouter();
  const [retrying, startRetry] = useTransition();

  if (failedReads.length === 0) return null;

  return (
    /* no-print: this is a live-state warning, not part of the exported report. */
    <div
      role="alert"
      className="no-print mx-auto mt-3 max-w-[1280px] border-2 border-red-border bg-red-bg p-[10px_12px]"
    >
      <div className="font-mono text-[12px] text-red-text">INCOMPLETE BOARD</div>
      <div className="mt-1 text-[14px] leading-[1.45] text-red-text">
        {failedReads.length === 1
          ? `The ${failedReads[0]} table did not load.`
          : `${failedReads.length} tables did not load (${failedReads.join(", ")}).`}{" "}
        What you are looking at is missing data — completed tiles, progress or points may
        read low. Nothing you do here is lost, but reload before trusting the board.
      </div>
      <button
        type="button"
        disabled={retrying}
        onClick={() => startRetry(() => router.refresh())}
        className="mt-2 min-h-[42px] cursor-pointer border-2 border-red-border bg-surface-dark p-[10px_14px] font-mono text-[12px] text-red-text"
      >
        {retrying ? "RELOADING…" : "RELOAD"}
      </button>
    </div>
  );
}
