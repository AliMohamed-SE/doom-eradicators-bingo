import { PanelSkeleton, BoardSkeleton } from "@/components/skeleton";

/** The picks summary panel, then the same nine-region board of intent tiles. */
export default function Loading() {
  return (
    <div aria-busy="true">
      <PanelSkeleton lines={2} className="mb-3" />
      <BoardSkeleton />
    </div>
  );
}
