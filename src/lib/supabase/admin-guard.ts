import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./server";

/** Garante usuário logado E presente em catalog_admins. Use no layout do painel e em toda Server Action. */
export async function requireAdmin() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/admin/login");
  const { data: isAdmin, error } = await supabase.rpc("is_catalog_admin");
  if (error || !isAdmin) redirect("/admin/login?erro=sem-permissao");
  return { supabase, user: auth.user };
}
