import { BoardSkeleton } from "../loading";

/**
 * Tab-switch skeleton.
 *
 * Nested inside the (app) layout, so switching tabs replaces the CONTENT and
 * leaves the header, the score and the nav where they are. Without this boundary
 * the nearest fallback is the root app/loading.tsx, which would blank the chrome
 * too — the page appearing to reload every time somebody taps PLANNING.
 */
export default function Loading() {
  return (
    <div aria-busy="true">
      <div className="mb-3 flex items-center gap-2 border-2 border-border-default bg-surface-inset p-[10px_12px]">
        <span className="font-mono text-[11px] text-ink-dim">LOADING…</span>
      </div>
      <BoardSkeleton />
    </div>
  );
}
