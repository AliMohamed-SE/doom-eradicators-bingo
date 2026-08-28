import { PanelSkeleton, BoardSkeleton, Shimmer } from "@/components/skeleton";

/**
 * Board-shaped, which is the right guess even though this tab has a second face:
 * a leader who has not set tracking up gets the setup form instead. The board is
 * what the whole team sees once tracking is on, so it is the common case, and the
 * form is small enough that landing on it costs nothing.
 */
export default function Loading() {
  return (
    <div aria-busy="true">
      <PanelSkeleton lines={2} className="mb-3" />
      <BoardSkeleton />
      <Shimmer className="mt-3 h-[44px] w-full" />
    </div>
  );
}
