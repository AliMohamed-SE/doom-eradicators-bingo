import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseUrl, supabasePublicKey } from "./env";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Supabase client bound to the request's auth cookies. Used to read the Discord
 * session (auth.getUser) and to run the OAuth code exchange / sign-out. Uses the
 * public key — not the service role.
 */
export async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabasePublicKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // called from a Server Component — middleware refreshes the session
        }
      },
    },
  });
}
