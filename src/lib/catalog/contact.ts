import "server-only";
import { site } from "@/config/site";
import { publicClient } from "@/lib/supabase/public";

/** Número do WhatsApp e URL do site: configuração do painel com recuo para o .env (site.ts). */
export async function getContact() {
  let whatsapp = site.contact.whatsapp ?? "";
  let siteUrl = site.url;
  const db = publicClient();
  if (db) {
    const { data } = await db.from("site_settings").select("key, value").in("key", ["whatsapp_number", "site_url"]);
    for (const r of (data ?? []) as { key: string; value: string | null }[]) {
      if (r.key === "whatsapp_number" && r.value) whatsapp = r.value.replace(/\D/g, "");
      if (r.key === "site_url" && r.value) siteUrl = r.value.replace(/\/$/, "");
    }
  }
  return { whatsapp, siteUrl };
}
