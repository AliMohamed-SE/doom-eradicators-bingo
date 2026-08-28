import { Shimmer, PanelSkeleton } from "@/components/skeleton";

/**
 * Cold-start skeleton for the shell.
 *
 * The (app) layout awaits getAppData() before it can render anything, which is a
 * Supabase round trip. Until now that gap was an unpainted page, so a slow load
 * and a broken app looked identical from outside — and the natural response to a
 * blank screen is to reload, which is the habit components/load-warning.tsx exists
 * to make unnecessary.
 *
 * Deliberately ROUTE-AGNOSTIC. This boundary sits above the route segments, so it
 * fires before anything knows whether /board or /contrib is being loaded — which
 * means it must not promise a shape. It draws the chrome (which every tab has) and
 * one neutral panel, and nothing else. The board grid, the card grids and the
 * document stacks belong to the per-route loading.tsx files under app/(app)/,
 * where the shape is actually known.
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
            <Shimmer className="mt-1 h-[13px] w-[110px]" />
          </div>
          <Shimmer className="h-[46px] w-[92px]" />
        </div>
        <div className="mx-auto flex max-w-[1280px] gap-[6px] overflow-hidden p-[0_8px_8px]">
          {Array.from({ length: 5 }).map((_, i) => (
            <Shimmer key={i} delay={i * 60} className="h-[42px] w-[92px] flex-none" />
          ))}
        </div>
        {/* Same strip the header shows while a mutation is in flight, so a cold
            load and a working app read as the same kind of "busy". */}
        <div className="h-[3px] w-full overflow-hidden">
          <div className="working-bar h-full w-full" />
        </div>
      </div>

      <main className="mx-auto max-w-[1280px] p-3">
        <PanelSkeleton lines={3} />
      </main>
    </div>
  );
}
