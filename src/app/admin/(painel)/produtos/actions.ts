"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/admin-guard";
import { productSlug } from "@/lib/catalog/slug";

const s = (f: FormData, k: string) => { const v = f.get(k); return typeof v === "string" && v.trim() !== "" ? v.trim() : null; };
const n = (f: FormData, k: string) => { const v = s(f, k); if (v === null) return null; const x = Number(v.replace(",", ".")); return Number.isFinite(x) ? x : null; };
const b = (f: FormData, k: string) => f.get(k) === "on";

function revalidateProduct(id: string) {
  revalidatePath(`/admin/produtos/${id}`);
  revalidatePath("/admin/produtos");
  revalidatePath("/", "layout"); // vitrine pública (ISR)
}

async function uniqueSlug(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"], base: string, selfId?: string) {
  let slug = base, i = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data } = await supabase.from("products").select("id").eq("slug", slug).maybeSingle();
    if (!data || data.id === selfId) return slug;
    slug = `${base}-${i++}`;
  }
}

/** Cria o produto como INTERNO + ACERVO. O código Casa Áurea é gerado pelo banco a partir do tipo. */
export async function createProduct(form: FormData) {
  const { supabase } = await requireAdmin();
  const name = s(form, "name");
  const typeId = s(form, "product_type_id");
  if (!name || !typeId) redirect("/admin/produtos/novo?erro=campos");
  const tmp = `tmp-${crypto.randomUUID()}`;
  const { data, error } = await supabase.from("products").insert({
    name, slug: tmp, product_type_id: typeId, product_subtype_id: s(form, "product_subtype_id"),
    environment: s(form, "environment") ?? "indoor", supplier_id: s(form, "supplier_id"),
    status: "draft", visibility: "internal", curation_tier: "archive", status_commercial: "unknown",
  }).select("id, public_code").single();
  if (error || !data) redirect(`/admin/produtos/novo?erro=${encodeURIComponent(error?.message ?? "falha")}`);
  const slug = await uniqueSlug(supabase, productSlug(name, data.public_code));
  await supabase.from("products").update({ slug }).eq("id", data.id);
  revalidatePath("/admin/produtos");
  redirect(`/admin/produtos/${data.id}?ok=criado`);
}

export async function saveGeneral(id: string, form: FormData) {
  const { supabase } = await requireAdmin();
  const name = s(form, "name");
  if (!name) return;
  const slugInput = s(form, "slug");
  const slug = slugInput ? await uniqueSlug(supabase, productSlug(slugInput), id) : undefined;
  const { error } = await supabase.from("products").update({
    name, ...(slug && { slug }),
    product_type_id: s(form, "product_type_id"), product_subtype_id: s(form, "product_subtype_id"),
    environment: s(form, "environment") ?? "indoor",
    short_description: s(form, "short_description"), editorial_description: s(form, "editorial_description"),
    description: s(form, "description"), designer: s(form, "designer"), collection_name_original: s(form, "collection_name_original"),
    is_configurable: b(form, "is_configurable"),
    seo_title: s(form, "seo_title"), seo_description: s(form, "seo_description"), og_image: s(form, "og_image"),
  }).eq("id", id);
  revalidateProduct(id);
  redirect(`/admin/produtos/${id}?aba=geral&${error ? `erro=${encodeURIComponent(error.message)}` : "ok=salvo"}`);
}

export async function saveCommercial(id: string, form: FormData) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("products").update({
    supplier_id: s(form, "supplier_id"), status_commercial: s(form, "status_commercial") ?? "unknown",
    price: n(form, "price"), sale_price: n(form, "sale_price"), show_price: b(form, "show_price"),
    availability: s(form, "availability"), sku: s(form, "sku"), internal_notes: s(form, "internal_notes"),
    extra_info: s(form, "extra_info"),
  }).eq("id", id);
  revalidateProduct(id);
  redirect(`/admin/produtos/${id}?aba=comercial&${error ? `erro=${encodeURIComponent(error.message)}` : "ok=salvo"}`);
}

/** Visibilidade e curadoria. Publicar exige tipo (código Casa Áurea) e foto principal. */
export async function saveCuration(id: string, form: FormData) {
  const { supabase } = await requireAdmin();
  const visibility = s(form, "visibility") ?? "internal";
  if (visibility === "public") {
    const { data: p } = await supabase.from("products").select("public_code").eq("id", id).single();
    const { count } = await supabase.from("product_media").select("id", { count: "exact", head: true }).eq("product_id", id).eq("is_primary", true);
    if (!p?.public_code || !count) redirect(`/admin/produtos/${id}?aba=curadoria&erro=${encodeURIComponent("Para publicar, defina o tipo (código Casa Áurea) e uma foto principal.")}`);
  }
  const { error } = await supabase.from("products").update({
    visibility, curation_tier: s(form, "curation_tier") ?? "archive", featured: b(form, "featured"),
    sort_order: n(form, "sort_order") ?? 0, status: visibility === "public" ? "active" : "draft",
  }).eq("id", id);
  revalidateProduct(id);
  redirect(`/admin/produtos/${id}?aba=curadoria&${error ? `erro=${encodeURIComponent(error.message)}` : "ok=salvo"}`);
}

export async function setVisibility(id: string, visibility: "hidden" | "archived" | "internal") {
  const { supabase } = await requireAdmin();
  await supabase.from("products").update({ visibility, status: "draft", ...(visibility === "archived" && { curation_tier: "archive" }) }).eq("id", id);
  revalidateProduct(id);
}

export async function bulkAction(form: FormData) {
  const { supabase } = await requireAdmin();
  const ids = form.getAll("ids").map(String).filter(Boolean);
  const action = s(form, "bulk");
  if (ids.length && action) {
    if (action === "hidden" || action === "internal" || action === "archived") {
      await supabase.from("products").update({ visibility: action, status: "draft" }).in("id", ids);
    } else if (action === "curated" || action === "archive" || action === "signature") {
      await supabase.from("products").update({ curation_tier: action }).in("id", ids);
    }
    revalidatePath("/admin/produtos"); revalidatePath("/", "layout");
  }
  redirect(`/admin/produtos?${String(form.get("qs") ?? "")}`);
}

export async function duplicateProduct(id: string) {
  const { supabase } = await requireAdmin();
  const { data: p } = await supabase.from("products").select("*").eq("id", id).single();
  if (!p) return;
  const { id: _id, public_code: _c, slug: _s, created_at: _ca, updated_at: _ua, search_text: _st, ...rest } = p;
  void _id; void _c; void _s; void _ca; void _ua; void _st;
  const { data: copy } = await supabase.from("products").insert({
    ...rest, name: `${p.name} (cópia)`, slug: `tmp-${crypto.randomUUID()}`, visibility: "internal", curation_tier: "archive", status: "draft", featured: false,
  }).select("id, public_code, name").single();
  if (!copy) return;
  await supabase.from("products").update({ slug: await uniqueSlug(supabase, productSlug(copy.name, copy.public_code)) }).eq("id", copy.id);
  const [{ data: mats }, { data: fins }, { data: tags }] = await Promise.all([
    supabase.from("product_materials").select("material_id, is_primary").eq("product_id", id),
    supabase.from("product_finishes").select("finish_id").eq("product_id", id),
    supabase.from("product_tags").select("tag_id").eq("product_id", id),
  ]);
  if (mats?.length) await supabase.from("product_materials").insert(mats.map((m) => ({ ...m, product_id: copy.id })));
  if (fins?.length) await supabase.from("product_finishes").insert(fins.map((f) => ({ ...f, product_id: copy.id })));
  if (tags?.length) await supabase.from("product_tags").insert(tags.map((t) => ({ ...t, product_id: copy.id })));
  redirect(`/admin/produtos/${copy.id}?ok=duplicado`);
}

/* ---------- variantes ---------- */
export async function addVariant(id: string, form: FormData) {
  const { supabase } = await requireAdmin();
  const name = s(form, "name");
  if (name) {
    const { error } = await supabase.from("product_variants").insert({
      product_id: id, name, width_cm: n(form, "width_cm"), height_cm: n(form, "height_cm"), depth_cm: n(form, "depth_cm"),
      diameter_cm: n(form, "diameter_cm"), configuration: s(form, "configuration"), arm_type: s(form, "arm_type"),
      chaise_type: s(form, "chaise_type"), supplier_variant_code: s(form, "supplier_variant_code"), price: n(form, "price"),
      commercial_status: s(form, "commercial_status") ?? "unknown", sort_order: n(form, "sort_order") ?? 0,
    });
    if (error) redirect(`/admin/produtos/${id}?aba=variantes&erro=${encodeURIComponent(error.message)}`);
  }
  revalidateProduct(id);
  redirect(`/admin/produtos/${id}?aba=variantes&ok=salvo`);
}

export async function updateVariant(id: string, variantId: string, form: FormData) {
  const { supabase } = await requireAdmin();
  await supabase.from("product_variants").update({
    name: s(form, "name") ?? "—", width_cm: n(form, "width_cm"), height_cm: n(form, "height_cm"), depth_cm: n(form, "depth_cm"),
    diameter_cm: n(form, "diameter_cm"), configuration: s(form, "configuration"), price: n(form, "price"),
    supplier_variant_code: s(form, "supplier_variant_code"), commercial_status: s(form, "commercial_status") ?? "unknown",
    sort_order: n(form, "sort_order") ?? 0,
  }).eq("id", variantId).eq("product_id", id);
  revalidateProduct(id);
  redirect(`/admin/produtos/${id}?aba=variantes&ok=salvo`);
}

export async function deleteVariant(id: string, variantId: string) {
  const { supabase } = await requireAdmin();
  await supabase.from("product_variants").delete().eq("id", variantId).eq("product_id", id);
  revalidateProduct(id);
}

/* ---------- materiais, acabamentos e tags ---------- */
export async function saveTaxonomy(id: string, form: FormData) {
  const { supabase } = await requireAdmin();
  const mats = form.getAll("materials").map(String);
  const primary = s(form, "primary_material");
  const fins = form.getAll("finishes").map(String);
  const tags = form.getAll("tags").map(String);
  await Promise.all([
    supabase.from("product_materials").delete().eq("product_id", id),
    supabase.from("product_finishes").delete().eq("product_id", id),
    supabase.from("product_tags").delete().eq("product_id", id),
  ]);
  await Promise.all([
    mats.length ? supabase.from("product_materials").insert(mats.map((m) => ({ product_id: id, material_id: m, is_primary: m === primary }))) : null,
    fins.length ? supabase.from("product_finishes").insert(fins.map((f) => ({ product_id: id, finish_id: f }))) : null,
    tags.length ? supabase.from("product_tags").insert(tags.map((t) => ({ product_id: id, tag_id: t }))) : null,
  ]);
  revalidateProduct(id);
  redirect(`/admin/produtos/${id}?aba=materiais&ok=salvo`);
}

/* ---------- coleções ---------- */
export async function saveCollections(id: string, form: FormData) {
  const { supabase } = await requireAdmin();
  const ids = form.getAll("collections").map(String);
  await supabase.from("product_collections").delete().eq("product_id", id);
  if (ids.length) {
    await supabase.from("product_collections").insert(ids.map((c) => ({ product_id: id, collection_id: c, sort_order: n(form, `order_${c}`) ?? 0 })));
  }
  revalidateProduct(id);
  redirect(`/admin/produtos/${id}?aba=colecoes&ok=salvo`);
}

/* ---------- origem (fornecedor/catálogo/página/código original) ---------- */
export async function addSource(id: string, form: FormData) {
  const { supabase } = await requireAdmin();
  const catalogId = s(form, "catalog_id");
  let supplierId = s(form, "supplier_id");
  let year = n(form, "year");
  if (catalogId) {
    const { data: c } = await supabase.from("catalogs").select("supplier_id, year").eq("id", catalogId).single();
    supplierId = supplierId ?? c?.supplier_id ?? null; year = year ?? c?.year ?? null;
  }
  await supabase.from("product_source_references").insert({
    product_id: id, supplier_id: supplierId, catalog_id: catalogId, year, page: s(form, "page"),
    original_code: s(form, "original_code"), original_name: s(form, "original_name"), notes: s(form, "notes"),
  });
  revalidateProduct(id);
  redirect(`/admin/produtos/${id}?aba=origem&ok=salvo`);
}

export async function deleteSource(id: string, sourceId: string) {
  const { supabase } = await requireAdmin();
  await supabase.from("product_source_references").delete().eq("id", sourceId).eq("product_id", id);
  revalidateProduct(id);
}

/* ---------- pendências manuais ---------- */
export async function saveFlags(id: string, form: FormData) {
  const { supabase } = await requireAdmin();
  const flags = form.getAll("flags").map(String);
  await supabase.from("product_quality_flags").delete().eq("product_id", id).in("flag", ["needsCopyReview", "needsCommercialReview", "possibleDuplicate"]);
  if (flags.length) await supabase.from("product_quality_flags").insert(flags.map((f) => ({ product_id: id, flag: f })));
  revalidateProduct(id);
  redirect(`/admin/produtos/${id}?aba=notas&ok=salvo`);
}

/* ---------- mídia (o upload acontece no navegador, direto no Storage) ---------- */
export async function addMedia(id: string, items: { url: string; path: string; type: string; width?: number; height?: number; alt?: string }[]) {
  const { supabase } = await requireAdmin();
  const { count } = await supabase.from("product_media").select("id", { count: "exact", head: true }).eq("product_id", id).eq("is_primary", true);
  const { data: last } = await supabase.from("product_media").select("sort_order").eq("product_id", id).order("sort_order", { ascending: false }).limit(1);
  let order = (last?.[0]?.sort_order ?? 0) + 1;
  let hasPrimary = Boolean(count);
  const rows = items.map((m) => {
    const isPrimary = !hasPrimary && m.type !== "video";
    if (isPrimary) hasPrimary = true;
    return { product_id: id, url: m.url, type: isPrimary ? "primary" : m.type, width: m.width ?? null, height: m.height ?? null, alt: m.alt ?? null, sort_order: order++, is_primary: isPrimary };
  });
  const { error } = await supabase.from("product_media").insert(rows);
  revalidateProduct(id);
  return { error: error?.message ?? null };
}

export async function updateMedia(id: string, mediaId: string, form: FormData) {
  const { supabase } = await requireAdmin();
  const makePrimary = b(form, "is_primary");
  if (makePrimary) await supabase.from("product_media").update({ is_primary: false, type: "gallery" }).eq("product_id", id).eq("is_primary", true);
  await supabase.from("product_media").update({
    alt: s(form, "alt"), sort_order: n(form, "sort_order") ?? 0, focal_point: s(form, "focal_point") ?? "50% 50%",
    type: makePrimary ? "primary" : (s(form, "type") ?? "gallery"), poster_url: s(form, "poster_url"),
    ...(makePrimary && { is_primary: true }),
  }).eq("id", mediaId).eq("product_id", id);
  revalidateProduct(id);
  redirect(`/admin/produtos/${id}?aba=midia&ok=salvo`);
}

export async function deleteMedia(id: string, mediaId: string) {
  const { supabase } = await requireAdmin();
  const { data: m } = await supabase.from("product_media").select("url").eq("id", mediaId).single();
  await supabase.from("product_media").delete().eq("id", mediaId).eq("product_id", id);
  const marker = "/storage/v1/object/public/";
  if (m?.url?.includes(marker)) {
    const [bucket, ...rest] = m.url.split(marker)[1].split("/");
    await supabase.storage.from(bucket).remove([decodeURIComponent(rest.join("/"))]);
  }
  revalidateProduct(id);
}

/* ---------------------------------------------------------------------
 * Exibição no site, em três estados:
 *  - vitrine: pública e em destaque (curated, ou signature se já for)
 *  - acervo:  pública, disponível em /acervo e na busca (archive)
 *  - oculta:  interna, só a equipe vê
 * Publicar exige código Casa Áurea (tipo confirmado) e foto principal.
 * ------------------------------------------------------------------- */
export async function setShowState(form: FormData) {
  const { supabase } = await requireAdmin();
  const [id, state] = String(form.get("show") ?? "").split("|");
  const back = `/admin/produtos?${String(form.get("qs") ?? "")}`;
  if (!id || !["vitrine", "acervo", "oculta"].includes(state)) redirect(back);
  if (state === "oculta") {
    await supabase.from("products").update({ visibility: "internal" }).eq("id", id);
  } else {
    const { data: p } = await supabase.from("products").select("public_code, curation_tier").eq("id", id).maybeSingle();
    const { count: media } = await supabase.from("product_media").select("id", { count: "exact", head: true }).eq("product_id", id).eq("status", "active");
    if (!p?.public_code || !media) redirect(`${back}${back.endsWith("?") ? "" : "&"}erro=publicar`);
    const tier = state === "acervo" ? "archive" : p.curation_tier === "signature" ? "signature" : "curated";
    await supabase.from("products").update({ visibility: "public", status: "active", curation_tier: tier }).eq("id", id);
  }
  revalidateProduct(id);
  redirect(back);
}

/** Libera de uma vez no Acervo as peças internas com tipo confirmado e foto principal boa. */
export async function releaseGoodPhotos() {
  const { supabase } = await requireAdmin();
  const { data: cands } = await supabase.from("products").select("id").eq("visibility", "internal").not("public_code", "is", null).limit(5000);
  const ids = (cands ?? []).map((r: { id: string }) => r.id);
  let released = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { data: bad } = await supabase.from("product_quality_auto").select("product_id").eq("flag", "missingHighQualityImage").in("product_id", chunk);
    const badSet = new Set((bad ?? []).map((r: { product_id: string }) => r.product_id));
    const ok = chunk.filter((id) => !badSet.has(id));
    if (ok.length) {
      await supabase.from("products").update({ visibility: "public", status: "active", curation_tier: "archive" }).in("id", ok);
      released += ok.length;
    }
  }
  revalidatePath("/admin/produtos"); revalidatePath("/", "layout");
  redirect(`/admin/produtos?liberadas=${released}`);
}
