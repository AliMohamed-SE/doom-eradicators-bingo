// Resolves Supabase keys across both naming schemes:
//   - Legacy: NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY
//   - New (2025 API keys): NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY + SUPABASE_SECRET_KEY
// Either works; fill whichever your Supabase dashboard shows.

export function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  return url;
}

/** Public key for the browser (read-only board + realtime). */
export function supabasePublicKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)",
    );
  }
  return key;
}

/** Secret key used only on the server for all writes. Never sent to the browser. */
export function supabaseSecretKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY). " +
        "Add your Supabase service_role / secret key to .env — it is required for all writes.",
    );
  }
  return key;
}
