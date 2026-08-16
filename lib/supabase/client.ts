import { createBrowserClient } from "@supabase/ssr";
import { supabaseUrl, supabasePublicKey } from "./env";

/** Supabase client for Client Components (browser) — read + realtime only. */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabasePublicKey());
}
