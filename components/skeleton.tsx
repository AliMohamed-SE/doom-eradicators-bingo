/**
 * Doom Eradicators — loading skeletons.
 *
 * A skeleton is a promise about what is arriving. Get the shape wrong and it is
 * worse than a blank page: a 9×9 board pulsing where the contributions table is
 * about to land tells the reader they are waiting for something they are not, and
 * then makes the real content shove the page around when it disagrees.
 *
 * So there is no one "app skeleton". Only /board, /planning and /rival are
 * board-shaped; the rest are cards, lists, forms and documents, and each route's
 * loading.tsx picks the primitive that matches what its page actually renders.
 *
 * Server components — these are static markup with no state, so they cost nothing
 * on the client and can be rendered straight from a loading.tsx.
 */
import { cn } from "@/lib/cn";

/**
 * One pulsing block. `delay` staggers a grid of them: dozens of cells pulsing in
 * lockstep reads as a strobe rather than as loading.
 */
export function Shimmer({ className, delay = 0 }: { className?: string; delay?: number }) {
  return (
    <div
      className={cn("animate-pulse bg-surface-btn", className)}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    />
  );
}

/** The bordered panel every page opens with — a title line and a few rows under it. */
export function PanelSkeleton({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("border-2 border-border-default panel-gradient p-3", className)}>
      <Shimmer className="h-[13px] w-[140px]" />
      <div className="mt-3 flex flex-col gap-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Shimmer
            key={i}
            delay={i * 80}
            className="h-[14px]"
            /* Ragged widths, because a stack of identical bars reads as a table
               rather than as prose that has not arrived yet. */
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The nine-region board, in the two layouts the real one uses: a chip row plus a
 * single region on a phone, the 3×3 map above the `board` breakpoint. Matching
 * both matters — a phone showing nine stacked regions would collapse to one the
 * moment the data lands.
 */
export function BoardSkeleton() {
  return (
    <>
      <div className="board:hidden">
        <div className="mb-[10px] flex gap-[6px] overflow-hidden pb-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Shimmer key={i} delay={i * 60} className="h-[44px] w-[104px] flex-none" />
          ))}
        </div>
        <RegionSkeleton />
      </div>
      <div className="hidden board:grid board:grid-cols-3 board:gap-[6px]">
        {Array.from({ length: 9 }).map((_, i) => (
          <RegionSkeleton key={i} seed={i} />
        ))}
      </div>
    </>
  );
}

/** One region panel: heading, then its 3×3 of tiles. */
function RegionSkeleton({ seed = 0 }: { seed?: number }) {
  return (
    <div className="region-gradient border-2 border-border-default p-[9px]">
      <div className="flex items-baseline justify-between gap-2 pb-[8px]">
        <Shimmer delay={seed * 40} className="h-[13px] w-[110px]" />
        <Shimmer delay={seed * 40} className="h-[12px] w-[64px]" />
      </div>
      <div className="grid grid-cols-3 gap-[4px]">
        {Array.from({ length: 9 }).map((_, t) => (
          <div key={t} className="aspect-square">
            <div
              className="h-full w-full animate-pulse border border-tile-locked-border bg-tile-locked-bg"
              style={{ animationDelay: `${((seed * 9 + t) % 12) * 70}ms` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The auto-fit card grids: one card per player (/contrib) or per seat (/roster). */
export function CardGridSkeleton({
  count = 6,
  min = 280,
  lines = 3,
}: {
  count?: number;
  min?: number;
  lines?: number;
}) {
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="region-gradient border-2 border-border-default p-3">
          <div className="flex items-baseline justify-between gap-2">
            <Shimmer delay={i * 70} className="h-[15px] w-[120px]" />
            <Shimmer delay={i * 70} className="h-[13px] w-[48px]" />
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {Array.from({ length: lines }).map((_, r) => (
              <Shimmer key={r} delay={i * 70 + r * 60} className="h-[13px]" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** A stack of read-heavy blocks — /rules and /report. */
export function DocumentSkeleton({
  sections = 4,
  className,
}: {
  sections?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {Array.from({ length: sections }).map((_, i) => (
        <div key={i} className="border-2 border-border-default panel-gradient p-[14px]">
          <Shimmer delay={i * 90} className="h-[14px] w-[180px]" />
          <div className="mt-3 flex flex-col gap-2">
            <Shimmer delay={i * 90} className="h-[12px]" />
            <Shimmer delay={i * 90 + 60} className="h-[12px]" />
            <Shimmer delay={i * 90 + 120} className="h-[12px] w-[70%]" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A vertical list of tappable rows — /my-tiles. */
export function ListSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-[6px]", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Shimmer key={i} delay={i * 80} className="h-[48px] w-full" />
      ))}
    </div>
  );
}
