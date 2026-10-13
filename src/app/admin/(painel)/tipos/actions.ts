"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/admin-guard";
import { slugify } from "@/lib/catalog/slug";

export async function saveType(id: string | null, form: FormData) {
  const { supabase } = await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  const plural = String(form.get("plural_name") ?? "").trim() || null;
  const section = String(form.get("section") ?? "moveis");
  const order = Number(form.get("sort_order")) || 0;
  if (!name) return;
  if (id) {
    // o código do tipo não muda: ele compõe os códigos Casa Áurea já emitidos
    await supabase.from("product_types").update({ name, plural_name: plural, section, sort_order: order, active: form.get("active") === "on" }).eq("id", id);
  } else {
    const code = String(form.get("code") ?? "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) return;
    await supabase.from("product_types").insert({ code, name, plural_name: plural, slug: slugify(plural ?? name), section, sort_order: order });
  }
  revalidatePath("/admin/tipos");
}

export async function saveSubtype(typeId: string, id: string | null, form: FormData) {
  const { supabase } = await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  if (!name) return;
  if (id) await supabase.from("product_subtypes").update({ name, slug: slugify(name), active: form.get("active") === "on" }).eq("id", id);
  else await supabase.from("product_subtypes").insert({ type_id: typeId, name, slug: slugify(name) });
  revalidatePath("/admin/tipos");
}
