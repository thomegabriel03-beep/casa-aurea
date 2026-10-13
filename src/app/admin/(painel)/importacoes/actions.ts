"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/admin-guard";
import { parseCatalogCsv } from "@/lib/catalog/import-parse";
import { productSlug, slugify } from "@/lib/catalog/slug";

/** Importa uma planilha CSV. Toda peça nasce INTERNA + ACERVO, nunca publicada.
 *  Fornecedores, catálogos e coleções desconhecidos não são criados automaticamente: viram aviso no log. */
export async function importCsv(form: FormData) {
  const { supabase, user } = await requireAdmin();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) redirect("/admin/importacoes?erro=arquivo");
  const text = await file.text();
  const parsed = parseCatalogCsv(text);

  const { data: batch } = await supabase.from("import_batches").insert({
    source_file: file.name, status: "processing", total_rows: parsed.rows.length + parsed.errors.length, created_by: user.id,
    supplier_id: (form.get("supplier_id") as string) || null, catalog_id: (form.get("catalog_id") as string) || null,
  }).select("id").single();
  if (!batch) redirect("/admin/importacoes?erro=lote");

  // guarda o arquivo de origem no bucket privado
  await supabase.storage.from("importacoes").upload(`${batch.id}/${slugify(file.name.replace(/\.[^.]+$/, ""))}.csv`, file, { upsert: true });

  const [types, subtypes, suppliers, catalogs, materials, finishes, tags, collections] = await Promise.all([
    supabase.from("product_types").select("id, code"), supabase.from("product_subtypes").select("id, type_id, slug, name"),
    supabase.from("suppliers").select("id, name, slug"), supabase.from("catalogs").select("id, name, year, supplier_id"),
    supabase.from("materials").select("id, name, slug"), supabase.from("finishes").select("id, name, slug"),
    supabase.from("tags").select("id, name, slug"), supabase.from("collections").select("id, name, slug"),
  ]);
  type Opt = { id: string; slug?: string; name?: string; code?: string };
  const bySlug = (list: Opt[] | null, v?: string) => (v ? (list ?? []).find((x) => x.slug === slugify(v) || slugify(x.name ?? "") === slugify(v)) : undefined);
  const log: string[] = [...parsed.errors];
  let imported = 0;
  const defaultSupplier = (form.get("supplier_id") as string) || null;
  const defaultCatalog = (form.get("catalog_id") as string) || null;

  for (const r of parsed.rows) {
    const type = r.typeCode ? (types.data ?? []).find((t: Opt) => t.code === r.typeCode) : undefined;
    if (r.typeCode && !type) log.push(`linha ${r.line}: tipo ${r.typeCode} não cadastrado (peça importada sem código)`);
    const supplier = bySlug(suppliers.data, r.supplier);
    if (r.supplier && !supplier) log.push(`linha ${r.line}: fornecedor "${r.supplier}" não cadastrado`);
    const supplierId = supplier?.id ?? defaultSupplier;
    const catalog = r.catalog
      ? (catalogs.data ?? []).find((c: { name: string; year: number | null; supplier_id: string }) => slugify(c.name) === slugify(r.catalog!) && (!supplierId || c.supplier_id === supplierId) && (!r.catalogYear || c.year === r.catalogYear))
      : undefined;
    if (r.catalog && !catalog) log.push(`linha ${r.line}: catálogo "${r.catalog}" não encontrado`);
    const subtype = type && r.subtype ? (subtypes.data ?? []).find((s: { type_id: string; slug: string }) => s.type_id === type.id && s.slug === slugify(r.subtype!)) : undefined;

    const { data: prod, error } = await supabase.from("products").insert({
      name: r.name, slug: `tmp-${crypto.randomUUID()}`, product_type_id: type?.id ?? null, product_subtype_id: subtype?.id ?? null,
      environment: r.environment ?? "indoor", short_description: r.shortDescription ?? null, description: r.description ?? null,
      supplier_id: supplierId, price: r.price ?? null, status: "draft", visibility: "internal", curation_tier: "archive", status_commercial: "unknown",
    }).select("id, public_code").single();
    if (error || !prod) { log.push(`linha ${r.line}: ${error?.message ?? "falha ao criar"}`); continue; }
    imported++;

    const base = productSlug(r.name, prod.public_code);
    const { data: clash } = await supabase.from("products").select("id").eq("slug", base).maybeSingle();
    await supabase.from("products").update({ slug: clash ? `${base}-${prod.id.slice(0, 6)}` : base }).eq("id", prod.id);

    const extra: PromiseLike<unknown>[] = [];
    extra.push(supabase.from("product_source_references").insert({
      product_id: prod.id, supplier_id: supplierId, catalog_id: catalog?.id ?? defaultCatalog, year: r.catalogYear ?? null,
      page: r.page ?? null, original_code: r.originalCode ?? null, original_name: r.originalName ?? null, import_batch_id: batch.id,
    }));
    const link = (names: string[], list: Opt[] | null, table: string, col: string, label: string) => {
      const ids = names.map((nm) => { const f = bySlug(list, nm); if (!f) log.push(`linha ${r.line}: ${label} "${nm}" não cadastrado`); return f?.id; }).filter(Boolean) as string[];
      if (ids.length) extra.push(supabase.from(table).insert(ids.map((id) => ({ product_id: prod.id, [col]: id }))));
    };
    link(r.materials, materials.data, "product_materials", "material_id", "material");
    link(r.finishes, finishes.data, "product_finishes", "finish_id", "acabamento");
    link(r.tags, tags.data, "product_tags", "tag_id", "tag");
    link(r.collections, collections.data, "product_collections", "collection_id", "coleção");
    if (r.variants.length) {
      extra.push(supabase.from("product_variants").insert(r.variants.map((v, i) => ({ product_id: prod.id, seq: i + 1, name: v.name, price: v.price ?? null, sort_order: i + 1 }))));
    }
    await Promise.all(extra);
  }

  const status = parsed.rows.length === 0 ? "failed" : log.length ? "needs_review" : "imported";
  await supabase.from("import_batches").update({ status, imported, failed: parsed.rows.length - imported + parsed.errors.length, log }).eq("id", batch.id);
  revalidatePath("/admin/importacoes"); revalidatePath("/admin/produtos");
  redirect(`/admin/importacoes?lote=${batch.id}`);
}

export async function setBatchStatus(id: string, status: "reviewed" | "approved") {
  const { supabase } = await requireAdmin();
  await supabase.from("import_batches").update({ status }).eq("id", id);
  revalidatePath("/admin/importacoes");
}
