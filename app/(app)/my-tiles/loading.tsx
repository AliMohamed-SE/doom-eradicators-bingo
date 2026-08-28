import { ListSkeleton, Shimmer } from "@/components/skeleton";

/** One narrow panel listing the tiles you are on — not a board. */
export default function Loading() {
  return (
    <div
      aria-busy="true"
      className="mine-gradient max-w-[620px] border-2 border-green-border2 p-3"
    >
      <Shimmer className="h-[13px] w-[130px]" />
      <Shimmer className="mt-2 mb-3 h-[14px] w-[210px]" />
      <ListSkeleton rows={4} />
    </div>
  );
}
