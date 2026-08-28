import { PanelSkeleton, BoardSkeleton, Shimmer } from "@/components/skeleton";

/** Team-intel panel, the nine-region board, then the score bar. */
export default function Loading() {
  return (
    <div aria-busy="true">
      <PanelSkeleton lines={2} className="mb-3" />
      <BoardSkeleton />
      <Shimmer className="mt-3 h-[44px] w-full" />
    </div>
  );
}
