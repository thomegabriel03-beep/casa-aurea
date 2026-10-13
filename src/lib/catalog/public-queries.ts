import "server-only";
import { publicClient } from "@/lib/supabase/public";

/** Consultas do site público. Leem SOMENTE as views públicas (public_*),
 *  que já excluem peças não públicas e campos internos. Sem credenciais, retornam vazio. */

export interface CardProduct {
  id: string;
  publicCode: string | null;
  name: string;
  slug: string;
  typeName: string | null;
  subtypeName: string | null;
  curationTier: "archive" | "curated" | "signature";
  price: number | null;
  image: { url: string; alt: string; focalPoint: string | null } | null;
}

export interface PublicCollection {
  id: string; name: string; slug: string; eyebrow: string | null; titleLines: string[] | null;
  subtitle: string | null; description: string | null; coverImage: string | null; mobileCoverImage: string | null;
  coverPosition: string | null; featured: boolean; isLive: boolean; order: number;
  seoTitle: string | null; seoDescription: string | null; ogImage: string | null;
}

const PAGE = 24;
type Row = Record<string, unknown>;

const PRODUCT_CARD_COLS = "id, public_code, name, slug, type_name, subtype_name, curation_tier, price, sale_price, sort_order";

/** Busca a foto principal de várias peças numa consulta só (evita N+1). */
async function withImages(rows: Row[]): Promise<CardProduct[]> {
  const db = publicClient();
  if (!db || !rows.length) return [];
  const ids = rows.map((r) => r.id as string);
  const { data: media } = await db
    .from("public_product_media").select("product_id, url, alt, focal_point, is_primary, sort_order")
    .in("product_id", ids).order("is_primary", { ascending: false }).order("sort_order");
  const first = new Map<string, Row>();
  (media ?? []).forEach((m: Row) => { if (!first.has(m.product_id as string)) first.set(m.product_id as string, m); });
  return rows.map((r) => {
    const m = first.get(r.id as string);
    return {
      id: r.id as string, publicCode: (r.public_code as string) ?? null, name: r.name as string, slug: r.slug as string,
      typeName: (r.type_name as string) ?? null, subtypeName: (r.subtype_name as string) ?? null,
      curationTier: r.curation_tier as CardProduct["curationTier"],
      price: (r.sale_price as number) ?? (r.price as number) ?? null,
      image: m ? { url: m.url as string, alt: (m.alt as string) || (r.name as string), focalPoint: (m.focal_point as string) ?? null } : null,
    };
  });
}

const mapCollection = (c: Row): PublicCollection => ({
  id: c.id as string, name: c.name as string, slug: c.slug as string, eyebrow: (c.eyebrow as string) ?? null,
  titleLines: (c.title_lines as string[]) ?? null, subtitle: (c.subtitle as string) ?? null, description: (c.description as string) ?? null,
  coverImage: (c.cover_image as string) ?? null, mobileCoverImage: (c.mobile_cover_image as string) ?? null,
  coverPosition: (c.cover_position as string) ?? null, featured: Boolean(c.featured), isLive: Boolean(c.is_live),
  order: (c.sort_order as number) ?? 0, seoTitle: (c.seo_title as string) ?? null, seoDescription: (c.seo_description as string) ?? null,
  ogImage: (c.og_image as string) ?? null,
});

export async function getLiveCollections(): Promise<PublicCollection[]> {
  const db = publicClient(); if (!db) return [];
  const { data } = await db.from("public_collections").select("*").eq("is_live", true)
    .order("featured", { ascending: false }).order("sort_order");
  return (data ?? []).map(mapCollection);
}

export async function getFeaturedCollection(): Promise<PublicCollection | null> {
  return (await getLiveCollections()).find((c) => c.featured) ?? null;
}

export async function getCollection(slug: string): Promise<PublicCollection | null> {
  const db = publicClient(); if (!db) return null;
  const { data } = await db.from("public_collections").select("*").eq("slug", slug).maybeSingle();
  return data ? mapCollection(data) : null;
}

export async function getCollectionProducts(collectionId: string, page = 1) {
  const db = publicClient(); if (!db) return { items: [] as CardProduct[], total: 0 };
  const { data: links, count } = await db.from("public_collection_products")
    .select("product_id, sort_order", { count: "exact" }).eq("collection_id", collectionId)
    .order("sort_order").range((page - 1) * PAGE, page * PAGE - 1);
  const ids: string[] = (links ?? []).map((l: Row) => l.product_id as string);
  if (!ids.length) return { items: [], total: count ?? 0 };
  const { data } = await db.from("public_products").select(PRODUCT_CARD_COLS).in("id", ids);
  const order = new Map<string, number>(ids.map((id, i): [string, number] => [id, i]));
  const rows = (data ?? []).sort((a: Row, b: Row) => (order.get(a.id as string) ?? 0) - (order.get(b.id as string) ?? 0));
  return { items: await withImages(rows), total: count ?? 0 };
}

/** Tipos com peças públicas numa seção (ex.: 'moveis'), para /moveis. */
export interface PublicType { code: string; name: string; plural: string; slug: string; count: number }

export async function getTypesWithProducts(section = "moveis"): Promise<PublicType[]> {
  const db = publicClient(); if (!db) return [];
  const [{ data: types }, { data: used }] = await Promise.all([
    db.from("product_types").select("code, name, plural_name, slug, sort_order, section").eq("section", section).eq("active", true).order("sort_order"),
    db.from("public_products").select("type_code").eq("type_section", section).in("curation_tier", ["curated", "signature"]),
  ]);
  const counts = new Map<string, number>();
  (used ?? []).forEach((r: Row) => counts.set(r.type_code as string, (counts.get(r.type_code as string) ?? 0) + 1));
  return (types ?? []).filter((t: Row) => counts.has(t.code as string))
    .map((t: Row) => ({ code: t.code as string, name: t.name as string, plural: (t.plural_name as string) ?? (t.name as string), slug: t.slug as string, count: counts.get(t.code as string) ?? 0 }));
}

export async function getTypeBySlug(slug: string) {
  const db = publicClient(); if (!db) return null;
  const { data } = await db.from("product_types").select("code, name, plural_name, slug, section").eq("slug", slug).eq("active", true).maybeSingle();
  return data ? { code: data.code as string, name: data.name as string, plural: (data.plural_name as string) ?? (data.name as string), slug: data.slug as string, section: data.section as string } : null;
}

/** Vitrine curada: só Curated e Signature aparecem nas listagens públicas. */
export async function getProducts(opts: { typeSlug?: string; outdoor?: boolean; page?: number }) {
  const db = publicClient(); if (!db) return { items: [] as CardProduct[], total: 0 };
  const page = opts.page ?? 1;
  let q = db.from("public_products").select(PRODUCT_CARD_COLS, { count: "exact" }).in("curation_tier", ["curated", "signature"]);
  if (opts.typeSlug) q = q.eq("type_slug", opts.typeSlug);
  if (opts.outdoor) q = q.in("environment", ["outdoor", "both"]);
  const { data, count } = await q.order("curation_tier", { ascending: false }).order("sort_order").range((page - 1) * PAGE, page * PAGE - 1);
  return { items: await withImages(data ?? []), total: count ?? 0 };
}

export interface ProductPageData {
  id: string; publicCode: string | null; name: string; slug: string; shortDescription: string | null; description: string | null;
  typeName: string | null; typeSlug: string | null; subtypeName: string | null; environment: string; isConfigurable: boolean;
  designer: string | null; availability: string | null; price: number | null; salePrice: number | null;
  seoTitle: string | null; seoDescription: string | null; ogImage: string | null; updatedAt: string;
  media: { type: string; url: string; alt: string; width: number | null; height: number | null; focalPoint: string | null; posterUrl: string | null }[];
  variants: { code: string | null; name: string; widthCm: number | null; heightCm: number | null; depthCm: number | null; diameterCm: number | null; configuration: string | null; price: number | null }[];
  materials: string[]; finishes: string[];
  collections: { name: string; slug: string }[];
}

export async function getProduct(slug: string): Promise<ProductPageData | null> {
  const db = publicClient(); if (!db) return null;
  const { data: p } = await db.from("public_products").select("*").eq("slug", slug).maybeSingle();
  if (!p) return null;
  const id = p.id as string;
  const [media, variants, materials, finishes, links] = await Promise.all([
    db.from("public_product_media").select("*").eq("product_id", id).order("is_primary", { ascending: false }).order("sort_order"),
    db.from("public_product_variants").select("*").eq("product_id", id).order("sort_order"),
    db.from("public_product_materials").select("name, is_primary").eq("product_id", id).order("is_primary", { ascending: false }),
    db.from("public_product_finishes").select("name").eq("product_id", id),
    db.from("public_collection_products").select("collection_id").eq("product_id", id),
  ]);
  const colIds = (links.data ?? []).map((l: Row) => l.collection_id as string);
  const cols = colIds.length ? (await db.from("public_collections").select("name, slug, is_live").in("id", colIds)).data ?? [] : [];
  return {
    id, publicCode: (p.public_code as string) ?? null, name: p.name as string, slug: p.slug as string,
    shortDescription: (p.short_description as string) ?? null, description: (p.description as string) ?? null,
    typeName: (p.type_name as string) ?? null, typeSlug: (p.type_slug as string) ?? null, subtypeName: (p.subtype_name as string) ?? null,
    environment: p.environment as string, isConfigurable: Boolean(p.is_configurable), designer: (p.designer as string) ?? null,
    availability: (p.availability as string) ?? null, price: (p.price as number) ?? null, salePrice: (p.sale_price as number) ?? null,
    seoTitle: (p.seo_title as string) ?? null, seoDescription: (p.seo_description as string) ?? null, ogImage: (p.og_image as string) ?? null,
    updatedAt: p.updated_at as string,
    media: (media.data ?? []).map((m: Row) => ({ type: m.type as string, url: m.url as string, alt: (m.alt as string) || (p.name as string),
      width: (m.width as number) ?? null, height: (m.height as number) ?? null, focalPoint: (m.focal_point as string) ?? null, posterUrl: (m.poster_url as string) ?? null })),
    variants: (variants.data ?? []).map((v: Row) => ({ code: (v.variant_code as string) ?? null, name: v.name as string,
      widthCm: (v.width_cm as number) ?? null, heightCm: (v.height_cm as number) ?? null, depthCm: (v.depth_cm as number) ?? null,
      diameterCm: (v.diameter_cm as number) ?? null, configuration: (v.configuration as string) ?? null, price: (v.price as number) ?? null })),
    materials: (materials.data ?? []).map((m: Row) => m.name as string),
    finishes: (finishes.data ?? []).map((f: Row) => f.name as string),
    collections: cols.filter((c: Row) => c.is_live).map((c: Row) => ({ name: c.name as string, slug: c.slug as string })),
  };
}

export interface PublicSlugs { products: { slug: string; updatedAt: string }[]; collections: string[] }

export async function getPublicSlugs(): Promise<PublicSlugs> {
  const db = publicClient(); if (!db) return { products: [], collections: [] };
  const [{ data: products }, { data: collections }] = await Promise.all([
    db.from("public_products").select("slug, updated_at").in("curation_tier", ["curated", "signature", "archive"]).limit(5000),
    db.from("public_collections").select("slug").eq("is_live", true),
  ]);
  return {
    products: (products ?? []).map((p: Row) => ({ slug: p.slug as string, updatedAt: p.updated_at as string })),
    collections: (collections ?? []).map((c: Row) => c.slug as string),
  };
}

/* ---------------------------------------------------------------------
 * Acervo completo: tudo o que a equipe liberou no site (Vitrine + Acervo).
 * Vitrine = curation_tier curated/signature; Acervo = archive. Oculta = visibility <> public
 * (essas nem chegam às views públicas).
 * ------------------------------------------------------------------- */
const ALL_TIERS = ["curated", "signature", "archive"];

export interface AcervoFilters { typeSlug?: string; outdoor?: boolean; material?: string; page?: number }

async function idsWithMaterial(material: string): Promise<string[] | null> {
  const db = publicClient(); if (!db) return null;
  const { data } = await db.from("public_product_materials").select("product_id").ilike("name", material).limit(5000);
  return (data ?? []).map((r: Row) => r.product_id as string);
}

export async function getAcervo(f: AcervoFilters) {
  const db = publicClient(); if (!db) return { items: [] as CardProduct[], total: 0 };
  const page = f.page ?? 1;
  let q = db.from("public_products").select(PRODUCT_CARD_COLS, { count: "exact" }).in("curation_tier", ALL_TIERS);
  if (f.typeSlug) q = q.eq("type_slug", f.typeSlug);
  if (f.outdoor) q = q.in("environment", ["outdoor", "both"]);
  if (f.material) {
    const ids = await idsWithMaterial(f.material);
    if (!ids || !ids.length) return { items: [] as CardProduct[], total: 0 };
    q = q.in("id", ids);
  }
  // vitrine primeiro (signature > curated > archive), depois a ordem definida pela equipe
  const { data, count } = await q.order("curation_tier", { ascending: false }).order("sort_order").range((page - 1) * PAGE, page * PAGE - 1);
  return { items: await withImages(data ?? []), total: count ?? 0 };
}

/** Quantas peças existem no acervo para um recorte (usado no convite "Ver todo o acervo"). */
export async function countAcervo(f: { typeSlug?: string; outdoor?: boolean; section?: string }) {
  const db = publicClient(); if (!db) return 0;
  let q = db.from("public_products").select("id", { count: "exact", head: true }).in("curation_tier", ALL_TIERS);
  if (f.typeSlug) q = q.eq("type_slug", f.typeSlug);
  if (f.section) q = q.eq("type_section", f.section);
  if (f.outdoor) q = q.in("environment", ["outdoor", "both"]);
  const { count } = await q;
  return count ?? 0;
}

/** Tipos com peças no acervo (Vitrine + Acervo). */
export async function getAcervoTypes(section = "moveis"): Promise<PublicType[]> {
  const db = publicClient(); if (!db) return [];
  const [{ data: types }, { data: used }] = await Promise.all([
    db.from("product_types").select("code, name, plural_name, slug, sort_order, section").eq("section", section).eq("active", true).order("sort_order"),
    db.from("public_products").select("type_code").eq("type_section", section).in("curation_tier", ALL_TIERS).limit(10000),
  ]);
  const counts = new Map<string, number>();
  (used ?? []).forEach((r: Row) => counts.set(r.type_code as string, (counts.get(r.type_code as string) ?? 0) + 1));
  return (types ?? []).filter((t: Row) => counts.has(t.code as string))
    .map((t: Row) => ({ code: t.code as string, name: t.name as string, plural: (t.plural_name as string) ?? (t.name as string), slug: t.slug as string, count: counts.get(t.code as string) ?? 0 }));
}

/** Materiais presentes nas peças públicas, do mais frequente ao menos frequente. */
export async function getAcervoMaterials(limit = 14): Promise<string[]> {
  const db = publicClient(); if (!db) return [];
  const { data } = await db.from("public_product_materials").select("name").limit(10000);
  const c = new Map<string, number>();
  (data ?? []).forEach((r: Row) => { const n = r.name as string; if (n) c.set(n, (c.get(n) ?? 0) + 1); });
  return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([n]) => n);
}
