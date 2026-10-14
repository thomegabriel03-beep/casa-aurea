import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/* Ficha de apresentação ao cliente: só o que um cliente pode ver.
   Nunca fornecedor, catálogo, código original, custos ou notas internas. */

export type Ficha = {
  id: string;
  name: string;
  code: string | null;
  type: string | null;
  outdoor: boolean;
  text: string | null;
  designer: string | null;
  photos: { url: string; alt: string }[];
  sizes: string[];
  materials: string[];
  finishes: string[];
};

type Variant = { name: string; width_cm: number | null; depth_cm: number | null; height_cm: number | null; diameter_cm: number | null };

const n = (v: number | null) => (v == null ? null : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 }));

function dims(v: Variant): string {
  const parts = [
    v.width_cm != null && `L ${n(v.width_cm)}`,
    v.depth_cm != null && `P ${n(v.depth_cm)}`,
    v.height_cm != null && `A ${n(v.height_cm)}`,
    v.diameter_cm != null && `Ø ${n(v.diameter_cm)}`,
  ].filter(Boolean);
  return parts.length ? `${parts.join(" × ")} cm` : "";
}

function names(rows: unknown, key: "materials" | "finishes"): string[] {
  return ((rows ?? []) as Record<string, { name: string } | { name: string }[] | null>[])
    .flatMap((r) => {
      const x = r[key];
      return Array.isArray(x) ? x : x ? [x] : [];
    })
    .map((x) => x.name);
}

export async function getFicha(supabase: Client, id: string): Promise<Ficha | null> {
  const [prod, media, variants, mats, fins] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, public_code, short_description, description, designer, environment, product_types(name)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("product_media").select("url, alt, type").eq("product_id", id).eq("status", "active").order("is_primary", { ascending: false }).order("sort_order"),
    supabase.from("product_variants").select("name, width_cm, depth_cm, height_cm, diameter_cm").eq("product_id", id).order("sort_order").order("seq"),
    supabase.from("product_materials").select("materials(name)").eq("product_id", id),
    supabase.from("product_finishes").select("finishes(name)").eq("product_id", id),
  ]);
  const p = prod.data as unknown as {
    id: string; name: string; public_code: string | null; short_description: string | null; description: string | null;
    designer: string | null; environment: string | null; product_types: { name: string } | { name: string }[] | null;
  } | null;
  if (!p) return null;
  const pt = Array.isArray(p.product_types) ? p.product_types[0] : p.product_types;
  const photos = ((media.data ?? []) as unknown as { url: string; alt: string | null; type: string }[])
    .filter((m) => m.type !== "video" && m.url)
    .map((m, k) => ({ url: m.url, alt: m.alt || `${p.name} — foto ${k + 1}` }));
  const sizes = ((variants.data ?? []) as unknown as Variant[])
    .map((v) => {
      const d = dims(v);
      return [v.name && v.name !== d ? v.name : null, d].filter(Boolean).join(" · ");
    })
    .filter(Boolean);
  return {
    id: p.id,
    name: p.name,
    code: p.public_code,
    type: pt?.name ?? null,
    outdoor: p.environment === "outdoor",
    text: p.short_description || p.description || null,
    designer: p.designer,
    photos,
    sizes,
    materials: names(mats.data, "materials"),
    finishes: names(fins.data, "finishes"),
  };
}
