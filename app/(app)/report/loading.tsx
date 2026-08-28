import { DocumentSkeleton } from "@/components/skeleton";

/** The printable report: a stack of sections, at the document's own width. */
export default function Loading() {
  return (
    <div aria-busy="true">
      <DocumentSkeleton sections={4} className="mx-auto max-w-[900px]" />
    </div>
  );
}
