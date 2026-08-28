import { DocumentSkeleton } from "@/components/skeleton";

/** A column of read-heavy rule sections. */
export default function Loading() {
  return (
    <div aria-busy="true">
      <DocumentSkeleton sections={5} className="max-w-[860px]" />
    </div>
  );
}
