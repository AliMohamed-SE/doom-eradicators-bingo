import { Shimmer } from "@/components/skeleton";

/** A narrow form: intro panel, the rares chip grid, the task box, the save button. */
export default function Loading() {
  return (
    <div aria-busy="true" className="flex max-w-[620px] flex-col gap-3">
      <div className="border-2 border-border-default panel-gradient p-3">
        <Shimmer className="h-[13px] w-[120px]" />
        <Shimmer className="mt-2 h-[14px] w-full" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Shimmer key={i} delay={i * 70} className="h-[58px]" />
        ))}
      </div>
      <Shimmer className="h-[48px] w-full" />
      <Shimmer className="h-[50px] w-full" />
    </div>
  );
}
