import "server-only";
import { createClient as createJsClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./env";

/** Cliente anônimo para o site público: sem cookies (permite cache/ISR) e
 *  restrito às views públicas pelas permissões do banco. */
export function publicClient() {
  if (!isSupabaseConfigured) return null;
  return createJsClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
