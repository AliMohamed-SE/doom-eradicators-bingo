import { redirect } from "next/navigation";
import { getAppData } from "@/lib/data";
import { OnboardingClient } from "@/components/onboarding-client";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const data = await getAppData();
  if (data.me) redirect("/board");
  return <OnboardingClient claimedNames={data.players.map((p) => p.name)} />;
}
