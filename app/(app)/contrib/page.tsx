import { redirect } from "next/navigation";
import { getAppData } from "@/lib/data";
import { ContribView } from "@/components/contrib-view";

export const dynamic = "force-dynamic";

export default async function ContribPage() {
  const data = await getAppData();
  if (!data.isLeader) redirect("/board");
  return <ContribView />;
}
