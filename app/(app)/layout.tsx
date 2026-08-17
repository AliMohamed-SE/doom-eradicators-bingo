import { redirect } from "next/navigation";
import { getAppData, toSnapshot } from "@/lib/data";
import { AppProvider } from "@/components/app-provider";
import { ConfirmProvider } from "@/components/confirm";
import { Header } from "@/components/header";
import { Sheets } from "@/components/sheets";
import { Realtime } from "@/components/realtime";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const data = await getAppData();
  if (!data.authed) redirect("/login");
  if (!data.me) redirect("/onboarding");

  return (
    <AppProvider initial={toSnapshot(data)}>
      <ConfirmProvider>
        <Realtime />
        <div className="pb-[44px]">
          <Header />
          <main className="mx-auto max-w-[1280px] p-3">{children}</main>
        </div>
        <Sheets />
      </ConfirmProvider>
    </AppProvider>
  );
}
