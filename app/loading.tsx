/**
 * First-load skeleton for the whole shell.
 *
 * The (app) layout awaits getAppData() before it can render anything, which is a
 * Supabase round trip. Until now that gap was an unpainted page, so a slow load
 * and a broken app looked the same from the outside — and the natural response to
 * a blank screen is to reload, which is exactly the habit this app wants to stop
 * (see components/load-warning.tsx for the other half of that story).
 *
 * Deliberately shaped like the real chrome — header block, tab row, region grid —
 * so the content lands into the layout it was already occupying instead of
 * shoving the page around when it arrives.
 *
 * There is a nested app/(app)/loading.tsx as well: this one is the cold start,
 * that one keeps the header on screen when you switch tabs.
 */
export default function Loading() {
  return (
    <div className="pb-[44px]" aria-busy="true">
      <div className="border-b-2 border-border-default header-gradient">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-[10px] p-[10px_12px]">
          <div className="min-w-[150px] flex-1">
            <div className="font-mono text-[15px] tracking-[.5px] text-orange [text-shadow:2px_2px_0_#000]">
              DOOM ERADICATORS
            </div>
            <div className="mt-1 h-[13px] w-[110px] animate-pulse bg-surface-btn" />
          </div>
          <div className="h-[46px] w-[92px] animate-pulse border-2 border-border-default bg-surface-inset" />
        </div>
        <div className="mx-auto flex max-w-[1280px] gap-[6px] p-[0_8px_8px]">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-[42px] w-[92px] animate-pulse border-2 border-border-default bg-surface-dark"
            />
          ))}
        </div>
        <div className="h-[3px] w-full overflow-hidden">
          <div className="working-bar h-full w-full" />
        </div>
      </div>

      <main className="mx-auto max-w-[1280px] p-3">
        <div className="mb-3 flex items-center gap-2 border-2 border-border-default bg-surface-inset p-[10px_12px]">
          <span className="font-mono text-[11px] text-ink-dim">LOADING THE BOARD…</span>
        </div>
        <BoardSkeleton />
      </main>
    </div>
  );
}

/** Nine region panels of nine tiles — the shape /board settles into. */
export function BoardSkeleton() {
  return (
    <div className="grid gap-[6px] board:grid-cols-3">
      {Array.from({ length: 9 }).map((_, r) => (
        <div key={r} className="region-gradient border-2 border-border-default p-[9px]">
          <div className="mb-[10px] h-[14px] w-[120px] animate-pulse bg-surface-btn" />
          <div className="grid grid-cols-3 gap-[4px]">
            {Array.from({ length: 9 }).map((_, t) => (
              <div key={t} className="aspect-square">
                <div
                  className="h-full w-full animate-pulse border border-tile-locked-border bg-tile-locked-bg"
                  /* Staggered so the grid reads as loading rather than as one
                     block flashing — 81 cells pulsing in lockstep is a strobe. */
                  style={{ animationDelay: `${((r * 9 + t) % 12) * 70}ms` }}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
