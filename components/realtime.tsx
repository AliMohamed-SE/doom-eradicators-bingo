"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const TABLES = [
  "players",
  "tile_claims",
  "tile_progress",
  "tile_items",
  "tile_notes",
  "tile_proofs",
  "tile_completions",
  "tile_intents",
  "focus",
  "rival_board",
  "rival_completions",
];

/** Refreshes server components whenever any mutable table changes elsewhere. */
export function Realtime() {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout>;
    const ping = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 150);
    };
    const channel = supabase.channel("bingo-live");
    TABLES.forEach((table) =>
      channel.on("postgres_changes", { event: "*", schema: "public", table }, ping),
    );
    channel.subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router]);
  return null;
}
