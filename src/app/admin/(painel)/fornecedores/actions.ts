"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/admin-guard";
import { slugify } from "@/lib/catalog/slug";

export async function saveSupplier(id: string | null, form: FormData) {
  const { supabase } = await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  if (!name) return;
  const row = { name, slug: slugify(name), notes: String(form.get("notes") ?? "").trim() || null, active: id ? form.get("active") === "on" : true };
  if (id) await supabase.from("suppliers").update(row).eq("id", id);
  else await supabase.from("suppliers").insert(row);
  revalidatePath("/admin/fornecedores");
}

export async function saveCatalog(id: string | null, form: FormData) {
  const { supabase } = await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  const supplierId = String(form.get("supplier_id") ?? "");
  if (!name || !supplierId) return;
  const year = Number(form.get("year")) || null;
  const row = { name, supplier_id: supplierId, year, file_url: String(form.get("file_url") ?? "").trim() || null,
    notes: String(form.get("notes") ?? "").trim() || null, active: id ? form.get("active") === "on" : true };
  if (id) await supabase.from("catalogs").update(row).eq("id", id);
  else await supabase.from("catalogs").insert(row);
  revalidatePath("/admin/catalogos");
}
