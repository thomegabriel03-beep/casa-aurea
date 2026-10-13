"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/admin-guard";

/** Cria o lote do catálogo PDF (o arquivo já foi enviado ao bucket privado pelo navegador).
 *  O processamento acontece no worker (casa_aurea_import.sink), fora da requisição HTTP. */
export async function createPdfBatch(input: { path: string | null; fileName: string; size: number; supplierId: string; catalogId: string; year: string; notes: string }) {
  const { supabase, user } = await requireAdmin();
  if (!input.supplierId || !input.catalogId || !input.fileName) return { error: "Informe fornecedor, catálogo e arquivo.", id: null };
  // sem path = catálogo grande processado pelo worker direto do disco (o PDF não sobe ao Storage)
  const { data, error } = await supabase.from("import_batches").insert({
    kind: "pdf", status: "queued", source_path: input.path, source_file: input.fileName, source_size: input.size, processing_mode: input.path ? "upload" : "local",
    supplier_id: input.supplierId, catalog_id: input.catalogId, catalog_year: input.year || null, notes: input.notes || null, created_by: user.id,
  }).select("id").single();
  revalidatePath("/admin/importacoes");
  return { error: error?.message ?? null, id: data?.id ?? null };
}

export async function pauseBatch(id: string) {
  const { supabase } = await requireAdmin();
  await supabase.from("import_batches").update({ pause_requested: true }).eq("id", id);
  revalidatePath("/admin/importacoes");
}

/** Retomar e reprocessar voltam o lote para a fila; o worker continua do checkpoint (next_page)
 *  e a importação é idempotente: peças já criadas não são duplicadas. */
export async function resumeBatch(id: string) {
  const { supabase } = await requireAdmin();
  await supabase.from("import_batches").update({ status: "queued", pause_requested: false, error: null }).eq("id", id);
  revalidatePath("/admin/importacoes");
}

/* ---------- troca de foto (não altera a peça) ---------- */
export async function replaceMedia(productId: string, mediaId: string, items: { url: string; path: string; type: string; width?: number; height?: number }[]) {
  const { supabase } = await requireAdmin();
  const item = items[0];
  if (!item) return { error: "Nenhum arquivo." };
  const { data: old } = await supabase.from("product_media").select("id, is_primary, type, sort_order, alt, focal_point").eq("id", mediaId).eq("product_id", productId).single();
  if (!old) return { error: "Mídia não encontrada." };
  await supabase.from("product_media").update({ status: "replaced", is_primary: false, replaced_at: new Date().toISOString() }).eq("id", mediaId);
  const long = Math.max(item.width ?? 0, item.height ?? 0);
  const quality = long >= 800 ? "CATALOG_READY" : long >= 500 ? "DETAIL_ACCEPTABLE" : "REJECTED";
  const { data: created, error } = await supabase.from("product_media").insert({
    product_id: productId, url: item.url, type: old.type, is_primary: old.is_primary, sort_order: old.sort_order, alt: old.alt, focal_point: old.focal_point,
    width: item.width ?? null, height: item.height ?? null, source_type: "manual_upload", quality, hero_ready: long >= 2000, status: "active",
  }).select("id").single();
  if (created) await supabase.from("product_media").update({ replaced_by: created.id }).eq("id", mediaId);
  revalidatePath(`/admin/produtos/${productId}`); revalidatePath("/", "layout");
  return { error: error?.message ?? null };
}

/* ---------- fila de revisão ---------- */
export async function quickEdit(itemId: string, productId: string, form: FormData) {
  const { supabase } = await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  const typeId = String(form.get("product_type_id") ?? "") || null;
  const patch: Record<string, unknown> = {};
  if (name) patch.name = name;
  if (typeId) patch.product_type_id = typeId;   // peça sem código recebe o código ao ganhar o tipo
  if (Object.keys(patch).length) await supabase.from("products").update(patch).eq("id", productId);
  await supabase.from("import_items").update({ review_status: "reviewed", reviewed_at: new Date().toISOString() }).eq("id", itemId);
  revalidatePath("/admin/importacoes/revisao");
  redirect(`/admin/importacoes/revisao?${String(form.get("qs") ?? "")}`);
}

/** Aprovação de curadoria em lote: marca como Curated, mas a peça continua INTERNA (não publica). */
export async function approveCuration(form: FormData) {
  const { supabase, user } = await requireAdmin();
  const ids = form.getAll("items").map(String);
  if (ids.length) {
    const { data } = await supabase.from("import_items").select("id, product_id").in("id", ids);
    const products = (data ?? []).map((r: { product_id: string | null }) => r.product_id).filter(Boolean) as string[];
    if (products.length) await supabase.from("products").update({ curation_tier: "curated" }).in("id", products);
    await supabase.from("import_items").update({ review_status: "approved", reviewed_by: user.id, reviewed_at: new Date().toISOString() }).in("id", ids);
  }
  revalidatePath("/admin/importacoes/revisao");
  redirect(`/admin/importacoes/revisao?${String(form.get("qs") ?? "")}`);
}
