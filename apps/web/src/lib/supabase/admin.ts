import "server-only";
import { createClient } from "@supabase/supabase-js";

// Supabase client with the secret (service-role) key: it bypasses RLS. Only the billing code
// may import it (lib/billing/* and app/api/billing/*; test/billing.test.ts enforces that),
// to write membership facts, which clients can never write. Returns null when the key isn't
// set, so billing quietly switches itself off.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
