import { CardGridSkeleton, Shimmer } from "@/components/skeleton";

/** One card per seat, inside the roster panel. */
export default function Loading() {
  return (
    <div aria-busy="true" className="border-2 border-border-default panel-gradient p-3">
      <Shimmer className="mb-[10px] h-[13px] w-[110px]" />
      <CardGridSkeleton count={8} min={280} lines={2} />
    </div>
  );
}
