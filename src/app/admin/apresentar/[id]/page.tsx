import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/admin-guard";

/* Ficha de apresentação: a equipe abre a peça em tela cheia para mostrar ao cliente.
   Mostra só o que pode ser visto por um cliente: fotos, nome, código Casa Áurea, tipo,
   medidas, materiais e descrição. Nunca fornecedor, catálogo, código original ou notas internas. */

export const dynamic = "force-dynamic";

type Media = { url: string; alt: string | null; type: string };
type Variant = { name: string; width_cm: number | null; depth_cm: number | null; height_cm: number | null; diameter_cm: number | null };

const n = (v: number | null) => (v == null ? null : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 }));
function dims(v: Variant): string {
  const parts = [v.width_cm != null && `L ${n(v.width_cm)}`, v.depth_cm != null && `P ${n(v.depth_cm)}`, v.height_cm != null && `A ${n(v.height_cm)}`, v.diameter_cm != null && `Ø ${n(v.diameter_cm)}`].filter(Boolean);
  return parts.length ? `${parts.join(" × ")} cm` : "";
}

export default async function Apresentar({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ foto?: string; de?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireAdmin();

  const { data: p } = await supabase
    .from("products")
    .select("id, name, public_code, short_description, description, designer, environment, product_type_id")
    .eq("id", id)
    .maybeSingle();
  if (!p) notFound();

  const [type, media, variants, mats, fins] = await Promise.all([
    p.product_type_id ? supabase.from("product_types").select("name").eq("id", p.product_type_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("product_media").select("url, alt, type").eq("product_id", id).eq("status", "active").order("is_primary", { ascending: false }).order("sort_order"),
    supabase.from("product_variants").select("name, width_cm, depth_cm, height_cm, diameter_cm").eq("product_id", id).order("sort_order").order("seq"),
    supabase.from("product_materials").select("materials(name)").eq("product_id", id),
    supabase.from("product_finishes").select("finishes(name)").eq("product_id", id),
  ]);

  const photos = ((media.data ?? []) as unknown as Media[]).filter((m) => m.type !== "video" && m.url);
  const i = Math.min(Math.max(0, Number(sp.foto) || 0), Math.max(0, photos.length - 1));
  const vs = (variants.data ?? []) as unknown as Variant[];
  const names = (rows: unknown, key: "materials" | "finishes") =>
    ((rows ?? []) as Record<string, { name: string } | { name: string }[] | null>[])
      .flatMap((r) => { const x = r[key]; return Array.isArray(x) ? x : x ? [x] : []; })
      .map((x) => x.name);
  const materials = names(mats.data, "materials");
  const finishes = names(fins.data, "finishes");
  const typeName = (type.data as { name: string } | null)?.name ?? null;
  const back = sp.de && sp.de.startsWith("/admin") ? sp.de : `/admin/produtos/${id}`;
  const text = p.short_description || p.description;
  const wa = `https://wa.me/?text=${encodeURIComponent(`Casa Áurea · ${p.name}${p.public_code ? ` (${p.public_code})` : ""}`)}`;

  return (
    <main className="apr">
      <div className="apr-bar">
        <Link className="apr-back" href={back}>← Voltar ao painel</Link>
        <span className="apr-brand">CASA ÁUREA</span>
        <a className="apr-wa" href={wa} target="_blank" rel="noopener noreferrer">Enviar no WhatsApp</a>
      </div>
      <article className="apr-card">
        <div className="apr-media">
          {photos.length ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="apr-main" src={photos[i].url} alt={photos[i].alt || p.name} />
              {photos.length > 1 && (
                <nav className="apr-thumbs" aria-label="Fotos da peça">
                  {photos.map((m, k) => (
                    <Link key={m.url + k} href={`?foto=${k}${sp.de ? `&de=${encodeURIComponent(sp.de)}` : ""}`} aria-current={k === i ? "true" : undefined} scroll={false}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.url} alt={`Foto ${k + 1}`} loading="lazy" />
                    </Link>
                  ))}
                </nav>
              )}
            </>
          ) : (
            <div className="apr-nophoto">Sem foto</div>
          )}
        </div>
        <div className="apr-info">
          {typeName && <p className="apr-eyebrow">{typeName}{p.environment === "outdoor" ? " · área externa" : ""}</p>}
          <h1>{p.name}</h1>
          {p.public_code && <p className="apr-code">{p.public_code}</p>}
          {text && <p className="apr-desc">{text}</p>}
          <dl className="apr-specs">
            {vs.length > 0 && (
              <div>
                <dt>{vs.length > 1 ? "Medidas" : "Medida"}</dt>
                <dd>{vs.map((v, k) => <span key={k}>{[v.name !== dims(v) ? v.name : null, dims(v)].filter(Boolean).join(" · ")}</span>)}</dd>
              </div>
            )}
            {materials.length > 0 && <div><dt>Materiais</dt><dd>{materials.join(", ")}</dd></div>}
            {finishes.length > 0 && <div><dt>Acabamentos</dt><dd>{finishes.join(", ")}</dd></div>}
            {p.designer && <div><dt>Design</dt><dd>{p.designer}</dd></div>}
          </dl>
          <p className="apr-note">Medidas, tecidos e acabamentos podem ser ajustados sob encomenda. Valores e prazos sob consulta.</p>
        </div>
      </article>
    </main>
  );
}
