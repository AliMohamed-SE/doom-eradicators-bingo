import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl, supabaseSecretKey } from "./env";

/**
 * Server-only Supabase client using the service-role key. Bypasses RLS, so it is
 * the ONLY thing that writes to the database. Never import this into a client
 * component — the key must never reach the browser.
 */
let cached: SupabaseClient | null = null;

export function admin(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(supabaseUrl(), supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
