import { redirect } from "next/navigation";
import { getAppData } from "@/lib/data";
import { RosterView } from "@/components/roster-view";

export const dynamic = "force-dynamic";

export default async function RosterPage() {
  const data = await getAppData();
  if (!data.isLeader) redirect("/board");
  return <RosterView />;
}
