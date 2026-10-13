"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/admin-guard";
import { slugify } from "@/lib/catalog/slug";

const s = (f: FormData, k: string) => { const v = f.get(k); return typeof v === "string" && v.trim() ? v.trim() : null; };

export async function createCollection(form: FormData) {
  const { supabase } = await requireAdmin();
  const name = s(form, "name");
  if (!name) return;
  const { data } = await supabase.from("collections").insert({ name, slug: slugify(s(form, "slug") ?? name), active: false, featured: false }).select("id").single();
  revalidatePath("/admin/colecoes");
  if (data) redirect(`/admin/colecoes/${data.id}?ok=criada`);
}

export async function saveCollection(id: string, form: FormData) {
  const { supabase } = await requireAdmin();
  const lines = (s(form, "title_lines") ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const { error } = await supabase.from("collections").update({
    name: s(form, "name"), slug: slugify(s(form, "slug") ?? s(form, "name") ?? ""), eyebrow: s(form, "eyebrow"),
    title_lines: lines.length ? lines : null, subtitle: s(form, "subtitle"), description: s(form, "description"),
    cover_image: s(form, "cover_image"), mobile_cover_image: s(form, "mobile_cover_image"), cover_position: s(form, "cover_position") ?? "50% 50%",
    start_date: s(form, "start_date"), end_date: s(form, "end_date"),
    featured: form.get("featured") === "on", active: form.get("active") === "on", sort_order: Number(form.get("sort_order")) || 0,
    headline: s(form, "headline"), manifesto: s(form, "manifesto"), theme: s(form, "theme"),
    story_enabled: form.get("story_enabled") === "on", story_type: s(form, "story_type"),
    story_desktop_media: s(form, "story_desktop_media"), story_mobile_media: s(form, "story_mobile_media"), story_height: s(form, "story_height"),
    hero_media: s(form, "hero_media"), hero_mobile_media: s(form, "hero_mobile_media"), poster_image: s(form, "poster_image"),
    seo_title: s(form, "seo_title"), seo_description: s(form, "seo_description"), og_image: s(form, "og_image"),
  }).eq("id", id);
  revalidatePath(`/admin/colecoes/${id}`); revalidatePath("/admin/colecoes"); revalidatePath("/", "layout");
  redirect(`/admin/colecoes/${id}?${error ? `erro=${encodeURIComponent(error.message)}` : "ok=salvo"}`);
}

export async function saveCollectionProducts(id: string, form: FormData) {
  const { supabase } = await requireAdmin();
  const keep = form.getAll("keep").map(String);
  const { data: current } = await supabase.from("product_collections").select("product_id").eq("collection_id", id);
  const remove = (current ?? []).map((c: { product_id: string }) => c.product_id).filter((p) => !keep.includes(p));
  if (remove.length) await supabase.from("product_collections").delete().eq("collection_id", id).in("product_id", remove);
  for (const pid of keep) {
    await supabase.from("product_collections").update({ sort_order: Number(form.get(`order_${pid}`)) || 0 }).eq("collection_id", id).eq("product_id", pid);
  }
  revalidatePath(`/admin/colecoes/${id}`); revalidatePath("/", "layout");
  redirect(`/admin/colecoes/${id}?ok=salvo`);
}

export async function addProductsByCode(id: string, form: FormData) {
  const { supabase } = await requireAdmin();
  const codes = (s(form, "codes") ?? "").toUpperCase().split(/[\s,;]+/).filter(Boolean);
  if (!codes.length) return;
  const { data: prods } = await supabase.from("products").select("id, public_code").in("public_code", codes);
  const { data: last } = await supabase.from("product_collections").select("sort_order").eq("collection_id", id).order("sort_order", { ascending: false }).limit(1);
  let order = (last?.[0]?.sort_order ?? 0) + 1;
  if (prods?.length) {
    await supabase.from("product_collections").upsert(prods.map((p: { id: string }) => ({ product_id: p.id, collection_id: id, sort_order: order++ })), { onConflict: "product_id,collection_id", ignoreDuplicates: true });
  }
  const missing = codes.filter((c) => !(prods ?? []).some((p: { public_code: string }) => p.public_code === c));
  revalidatePath(`/admin/colecoes/${id}`); revalidatePath("/", "layout");
  redirect(`/admin/colecoes/${id}?${missing.length ? `erro=${encodeURIComponent(`Não encontrados: ${missing.join(", ")}`)}` : "ok=salvo"}`);
}
