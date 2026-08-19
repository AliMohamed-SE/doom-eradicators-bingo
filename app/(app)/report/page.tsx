import { redirect } from "next/navigation";
import { getAppData } from "@/lib/data";
import { ReportView } from "@/components/report-view";

export const dynamic = "force-dynamic";

/**
 * A PDF's filename can't be set from the page, but Chrome and Edge seed the "Save as
 * PDF" name from document.title — so the route title is the filename. No ":" or "/",
 * which are illegal in filenames on Windows.
 */
export async function generateMetadata() {
  return { title: `Doom Eradicators bingo report ${new Date().toISOString().slice(0, 10)}` };
}

export default async function ReportPage() {
  const data = await getAppData();
  if (!data.isLeader) redirect("/board");
  // Stamped on the server and passed down, so the SSR pass and the client render format
  // the same instant — a new Date() inside the view would be a hydration mismatch.
  return <ReportView generatedAt={new Date().toISOString()} />;
}
