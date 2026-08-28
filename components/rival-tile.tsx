"use client";

import { useApp, patchRivalTile } from "./app-provider";
import { setRivalTile } from "@/app/actions";
import { isDone } from "@/lib/scoring";
import { FREE_SPACE, type Tile } from "@/lib/board-data";
import { cn } from "@/lib/cn";

/**
 * One tile on the rival board: marked, or not.
 *
 * Deliberately NOT components/tile.tsx. That one paints four states (locked,
 * open, on it, done), a progress count, a claim badge and a rules marker, every
 * one of which is a fact about OUR event that a screenshot of somebody else's
 * board cannot tell us. Two states is the honest number here, and reusing the
 * four-state skin would have this board quietly claiming to know the other three.
 *
 * A leader taps to toggle; everyone else gets a plain div, because the rival board
 * is intel the leader curates, not a thing the team edits together.
 */
export function RivalTile({ tile, variant }: { tile: Tile; variant: "phone" | "desktop" }) {
  const { rivalDone, isLeader, run } = useApp();
  const phone = variant === "phone";

  const done = isDone(rivalDone, tile.id);
  // The free space is complete for every team by rule, so it is shown done and is
  // never markable — there is no row behind it on either board.
  const markable = isLeader && tile.id !== FREE_SPACE;

  const body = (
    <>
      <span
        className={cn(
          "font-mono",
          done ? "text-green-soft" : "text-ink-faint",
          phone ? "text-[10px]" : "text-[9px]",
        )}
      >
        {done ? "DONE" : "—"}
      </span>
      <span className="flex flex-1 flex-col items-center justify-center overflow-hidden">
        <span className={cn("leading-[1.1]", phone ? "text-[13px]" : "text-[11px]")}>{tile.n}</span>
      </span>
    </>
  );

  const skin = done
    ? "bg-tile-done-bg border-tile-done-border text-tile-done-text"
    : "bg-tile-locked-bg border-tile-locked-border text-tile-locked-text";
  const shape = cn(
    "flex h-full w-full flex-col items-center justify-between gap-[3px] text-center",
    skin,
    phone ? "border-2 p-[6px_4px]" : "border p-[4px_3px]",
  );

  return (
    <div className="aspect-square">
      {markable ? (
        <button
          type="button"
          title={done ? `Unmark ${tile.n}` : `Mark ${tile.n} complete`}
          onClick={() =>
            run(() => setRivalTile(tile.id, !done), patchRivalTile(tile.id, !done))
          }
          className={cn(shape, "cursor-pointer")}
        >
          {body}
        </button>
      ) : (
        <div className={shape}>{body}</div>
      )}
    </div>
  );
}
