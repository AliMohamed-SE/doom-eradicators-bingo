import { redirect } from "next/navigation";
import { admin } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/auth";
import { SELECTABLE_NAMES } from "@/lib/board-data";
import { LinkForm } from "@/components/link-form";
import { NoSeats } from "@/components/no-seats";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ full?: string }>;
}) {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  // TEMP preview: visit /onboarding?full=1 to see the "team full" screen. Remove later.
  if ((await searchParams).full) return <NoSeats />;

  const { data: rows } = await admin().from("players").select("name, auth_user_id");
  const players = rows ?? [];

  // already linked -> go play
  if (players.some((p) => p.auth_user_id === user.id)) redirect("/board");

  const taken = new Set(players.filter((p) => p.auth_user_id).map((p) => p.name));
  const available = SELECTABLE_NAMES.filter((n) => !taken.has(n));

  if (available.length === 0) return <NoSeats />;
  return <LinkForm available={available} />;
}
