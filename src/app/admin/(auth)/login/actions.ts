"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function signIn(_: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  if (!isSupabaseConfigured) return { error: "Supabase ainda não configurado neste ambiente (.env.local)." };
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/admin");
  if (!email || !password) return { error: "Informe e-mail e senha." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "E-mail ou senha incorretos." };
  const { data: isAdmin } = await supabase.rpc("is_catalog_admin");
  if (!isAdmin) {
    await supabase.auth.signOut();
    return { error: "Este usuário não tem acesso ao painel." };
  }
  redirect(next.startsWith("/admin") ? next : "/admin");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
