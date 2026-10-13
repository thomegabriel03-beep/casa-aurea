"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/admin-guard";
import { slugify } from "@/lib/catalog/slug";

/** Listas simples de taxonomia (nome + slug + ativo). Tabelas permitidas explicitamente. */
const TABLES = { materials: "/admin/materiais", finishes: "/admin/acabamentos", tags: "/admin/tags" } as const;
type T = keyof typeof TABLES;
const isT = (t: string): t is T => t in TABLES;

export async function createItem(table: string, form: FormData) {
  if (!isT(table)) return;
  const { supabase } = await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  if (name) await supabase.from(table).insert({ name, slug: slugify(name) });
  revalidatePath(TABLES[table]);
}

export async function updateItem(table: string, id: string, form: FormData) {
  if (!isT(table)) return;
  const { supabase } = await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  const patch: Record<string, unknown> = { name, slug: slugify(name) };
  if (table !== "tags") patch.active = form.get("active") === "on";
  if (name) await supabase.from(table).update(patch).eq("id", id);
  revalidatePath(TABLES[table]);
}

/** Exclusão segura: só remove se não houver peças vinculadas. */
export async function deleteItem(table: string, id: string) {
  if (!isT(table)) return;
  const { supabase } = await requireAdmin();
  const link = table === "materials" ? ["product_materials", "material_id"] : table === "finishes" ? ["product_finishes", "finish_id"] : ["product_tags", "tag_id"];
  const { count } = await supabase.from(link[0]).select("product_id", { count: "exact", head: true }).eq(link[1], id);
  if (!count) await supabase.from(table).delete().eq("id", id);
  revalidatePath(TABLES[table]);
}
