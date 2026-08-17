import "server-only";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServer } from "./supabase/server";

/** The current Discord-authenticated user, or null. Request-scoped cache. */
export const getAuthUser = cache(async (): Promise<User | null> => {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
