import { redirect } from "next/navigation";
import { getAppData } from "@/lib/data";
import { RivalView } from "@/components/rival-view";

export const dynamic = "force-dynamic";

/**
 * Tracking off is the resting state, and the tab is hidden for it — so a member who
 * kept the URL from when tracking WAS on gets bounced rather than shown an empty
 * shell. Leaders always get through: this route is where they switch it on.
 */
export default async function RivalPage() {
  const data = await getAppData();
  if (!data.rival && !data.isLeader) redirect("/board");
  return <RivalView />;
}
