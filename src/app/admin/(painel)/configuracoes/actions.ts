"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/admin-guard";

export async function saveSettings(form: FormData) {
  const { supabase } = await requireAdmin();
  const number = String(form.get("whatsapp_number") ?? "").replace(/\D/g, "");
  const siteUrl = String(form.get("site_url") ?? "").trim();
  const rows = [{ key: "whatsapp_number", value: number || null }, { key: "site_url", value: siteUrl || null }];
  await supabase.from("site_settings").upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })));
  revalidatePath("/admin/configuracoes"); revalidatePath("/", "layout"); revalidatePath("/site-html");
}
