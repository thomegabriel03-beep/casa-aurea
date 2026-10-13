import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./env";

/** Cliente para Server Components, Server Actions e Route Handlers.
 *  Usa a sessão do usuário (cookies); o acesso é controlado por RLS no banco. */
export async function createClient() {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado (.env.local)");
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(list: { name: string; value: string; options: CookieOptions }[]) {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          /* chamado de um Server Component: o middleware renova a sessão */
        }
      },
    },
  });
}
