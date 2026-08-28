import { PanelSkeleton, CardGridSkeleton } from "@/components/skeleton";

/** Totals panel, then one card per player. */
export default function Loading() {
  return (
    <div aria-busy="true">
      <PanelSkeleton lines={2} className="mb-3" />
      <CardGridSkeleton count={6} min={300} lines={4} />
    </div>
  );
}
