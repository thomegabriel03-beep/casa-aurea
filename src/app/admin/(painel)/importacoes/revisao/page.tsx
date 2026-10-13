import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/admin-guard";
import { Empty, PageHeader } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { approveCuration, quickEdit } from "../pdf-actions";

/** Fila de revisão: imagem + dados extraídos + origem na mesma tela; aprovação em lote. */
const FILTERS: [string, string][] = [
  ["", "Todos"], ["IMAGE_REVIEW_REQUIRED", "Imagem a conferir"], ["NO_IMAGE", "Sem imagem"], ["NO_NAME", "Sem nome"], ["NO_TYPE", "Sem tipo"],
  ["NO_DIMENSIONS", "Sem medidas"], ["SAME_CODE_DUPLICATE", "Mesmo código"], ["POSSIBLE_DUPLICATE", "Possível duplicidade"],
  ["TAXONOMY_REVIEW_REQUIRED", "Classificação incerta"], ["MULTIPLE_PRODUCTS_UNCERTAIN", "Vários produtos incertos"],
  ["POSSIBLE_NON_PRODUCT", "Página informativa?"], ["IMPORT_ERROR", "Importação com erro"],
  ["IMAGE_UPGRADE_RECOMMENDED", "Foto só para miniatura"], ["VARIANT_CODES_TO_CONFIRM", "Vários códigos"], ["RELATED_VARIATION", "Variação real"],
];
const ADVISORY = new Set(["IMAGE_UPGRADE_RECOMMENDED", "VARIANT_CODES_TO_CONFIRM", "RELATED_VARIATION"]);
const LABEL = Object.fromEntries(FILTERS);
const QUALITY: Record<string, string> = { CATALOG_READY: "Pronta p/ catálogo", DETAIL_ACCEPTABLE: "Miniatura/detalhe", EDITORIAL_REVIEW: "Conferir imagem", REJECTED: "Rejeitada" };
const PER = 30;
const RELATION: Record<string, string> = { SAME_CODE: "mesmo código", REAL_VARIATION: "variação real", POSSIBLE_DUPLICATE: "possível duplicidade" };

type Item = {
  id: string; product_id: string | null; title_page: number | null; pages: number[]; flags: string[]; review_status: string;
  scores: { image_quality?: number; data_completeness?: number; taxonomy_confidence?: number } | null;
  extracted: { name?: string; header?: string; original_codes?: { code: string; label: string | null }[]; variants?: { name: string }[];
    classification?: { type: string | null; subtype: string | null; confidence: number }; relations?: { name: string; page: number; category: string; reason: string }[] };
  batch_id: string; suppliers: { name: string } | null; catalogs: { name: string; year: number | null } | null;
  products: { name: string; public_code: string | null; product_type_id: string | null; visibility: string; curation_tier: string } | null;
};

export default async function ReviewQueue({ searchParams }: { searchParams: Promise<{ f?: string; lote?: string; status?: string; p?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const page = Math.max(1, Number(sp.p) || 1);
  let q = supabase.from("import_items")
    .select("id, product_id, title_page, pages, flags, review_status, scores, extracted, batch_id, suppliers(name), catalogs(name, year), products(name, public_code, product_type_id, visibility, curation_tier)", { count: "exact" })
    .order("title_page");
  if (sp.f) q = q.contains("flags", [sp.f]);
  if (sp.lote) q = q.eq("batch_id", sp.lote);
  q = q.eq("review_status", sp.status || "pending");
  const [{ data, count }, { data: types }] = await Promise.all([
    q.range((page - 1) * PER, page * PER - 1),
    supabase.from("product_types").select("id, code, name").order("sort_order"),
  ]);
  const items = (data ?? []) as unknown as Item[];
  const productIds = items.map((i) => i.product_id).filter(Boolean) as string[];
  const batchIds = [...new Set(items.map((i) => i.batch_id))];
  const [{ data: media }, { data: pages }] = await Promise.all([
    productIds.length ? supabase.from("product_media").select("product_id, url, quality, width, height").in("product_id", productIds).eq("is_primary", true) : Promise.resolve({ data: [] }),
    batchIds.length ? supabase.from("import_pages").select("batch_id, page_number, render_path").in("batch_id", batchIds).in("page_number", items.map((i) => i.title_page ?? 0)) : Promise.resolve({ data: [] }),
  ]);
  type Med = { product_id: string; url: string; quality: string; width: number; height: number };
  const img = new Map<string, Med>((media ?? []).map((m: Med): [string, Med] => [m.product_id, m]));
  // miniaturas das páginas ficam no bucket privado: URL assinada válida por 1 hora
  const rp = (pages ?? []).filter((p: { render_path: string | null }) => p.render_path) as { batch_id: string; page_number: number; render_path: string }[];
  const signed = rp.length ? (await supabase.storage.from("importacoes").createSignedUrls(rp.map((p) => p.render_path), 3600)).data ?? [] : [];
  const pageImg = new Map<string, string>(rp.map((p, i): [string, string] => [`${p.batch_id}:${p.page_number}`, signed[i]?.signedUrl ?? ""]));
  const base = new URLSearchParams(Object.entries({ f: sp.f, lote: sp.lote, status: sp.status }).filter(([, v]) => v) as [string, string][]);
  const qs = base.toString();
  const total = count ?? 0;

  return (
    <>
      <PageHeader title="Fila de revisão" description="Peças importadas aguardando conferência. Aprovar curadoria não publica: a peça segue interna.">
        <Link className="adm-btn ghost" href="/admin/importacoes">Importações</Link>
      </PageHeader>
      <nav className="adm-tabs" aria-label="Filtros da fila">
        {FILTERS.map(([k, l]) => { const p = new URLSearchParams(base); if (k) p.set("f", k); else p.delete("f");
          return <Link key={k || "todos"} href={`?${p.toString()}`} aria-current={(sp.f ?? "") === k ? "page" : undefined}>{l}</Link>; })}
      </nav>
      <div className="adm-actions" style={{ marginTop: 0, marginBottom: "1rem" }}>
        {[["pending", "Pendentes"], ["reviewed", "Revisadas"], ["approved", "Aprovadas"]].map(([k, l]) => { const p = new URLSearchParams(base); p.set("status", k);
          return <Link key={k} className={`adm-btn sm ${(sp.status || "pending") === k ? "" : "ghost"}`} href={`?${p.toString()}`}>{l}</Link>; })}
        <span className="adm-note">{total} peça(s)</span>
      </div>

      {items.length === 0 ? <div className="adm-table-wrap"><Empty>Nada nesta fila.</Empty></div> : (
        <form action={approveCuration} id="bulk">
          <input type="hidden" name="qs" value={qs} />
          <div className="adm-actions" style={{ marginTop: 0, marginBottom: "1rem" }}>
            <SubmitButton>Aprovar curadoria das selecionadas</SubmitButton>
            <span className="adm-note">Marca como Curated. Visibilidade continua interna.</span>
          </div>
        </form>
      )}
      <div className="adm-review">
        {items.map((it) => {
          const m = it.product_id ? img.get(it.product_id) : undefined;
          const origin = it.batch_id && it.title_page ? pageImg.get(`${it.batch_id}:${it.title_page}`) : undefined;
          const cls = it.extracted.classification;
          return (
            <article key={it.id} className="adm-rv">
              <label className="adm-rv-check"><input type="checkbox" name="items" value={it.id} form="bulk" aria-label={`Selecionar ${it.products?.name ?? it.extracted.name}`} /></label>
              <div className="adm-rv-img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {m ? <img src={m.url} alt="" loading="lazy" /> : <span className="adm-note">Sem imagem</span>}
                {m && <span className={`adm-badge ${m.quality === "CATALOG_READY" ? "ok" : m.quality === "REJECTED" ? "bad" : "warn"}`}>{QUALITY[m.quality] ?? m.quality} · {m.width}×{m.height}</span>}
              </div>
              <div className="adm-rv-data">
                <form action={quickEdit.bind(null, it.id, it.product_id ?? "")} className="adm-grid" style={{ gap: ".5rem" }}>
                  <input type="hidden" name="qs" value={qs} />
                  <input type="text" name="name" defaultValue={it.products?.name ?? it.extracted.name ?? ""} aria-label="Nome" />
                  <select name="product_type_id" defaultValue={it.products?.product_type_id ?? ""} aria-label="Tipo">
                    <option value="">Sem tipo</option>
                    {(types ?? []).map((t: { id: string; code: string; name: string }) => <option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}
                  </select>
                  <p className="adm-note">
                    {it.products?.public_code && <span className="adm-code">{it.products.public_code}</span>}
                    {cls?.type && <> · sugestão {cls.type}{cls.subtype ? `/${cls.subtype}` : ""} ({Math.round(cls.confidence * 100)}%)</>}
                  </p>
                  <p className="adm-note">Códigos: {(it.extracted.original_codes ?? []).map((c) => `${c.code}${c.label ? ` (${c.label})` : ""}`).join(", ") || "—"}</p>
                  <p className="adm-note">Medidas: {(it.extracted.variants ?? []).length} variante(s){(it.extracted.variants ?? [])[0] ? ` · ${(it.extracted.variants ?? [])[0].name}` : ""}</p>
                  {(it.extracted.relations ?? []).filter((r) => r.category !== "SAME_NAME_DIFFERENT_PRODUCT").length > 0 && <p className="adm-note">Relacionado a: {(it.extracted.relations ?? []).filter((r) => r.category !== "SAME_NAME_DIFFERENT_PRODUCT").map((d) => `${d.name}, p. ${d.page} (${RELATION[d.category] ?? d.category})`).join("; ")}</p>}
                  <div className="adm-checks">{it.flags.map((f) => <span key={f} className={`adm-badge ${ADVISORY.has(f) ? "" : "warn"}`}>{LABEL[f] ?? f}</span>)}</div>
                  <div className="adm-actions" style={{ marginTop: ".25rem" }}>
                    <SubmitButton size="sm">Salvar e marcar revisada</SubmitButton>
                    {it.product_id && <Link className="adm-btn ghost sm" href={`/admin/produtos/${it.product_id}`}>Editar tudo</Link>}
                  </div>
                </form>
              </div>
              <div className="adm-rv-origin">
                <p className="adm-note">{it.suppliers?.name} · {it.catalogs?.name} {it.catalogs?.year ?? ""}</p>
                <p className="adm-note">Página {it.title_page}{it.pages.length > 1 ? ` (até ${it.pages[it.pages.length - 1]})` : ""}</p>
                {origin && <a href={origin} target="_blank" rel="noopener" className="adm-rv-page">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={origin} alt={`Página ${it.title_page} do catálogo`} loading="lazy" /><span>Ver página original</span></a>}
              </div>
            </article>
          );
        })}
      </div>
      <div className="adm-pager">
        {page > 1 && <Link className="adm-btn ghost sm" href={`?${qs}&p=${page - 1}`}>Anterior</Link>}
        {page * PER < total && <Link className="adm-btn ghost sm" href={`?${qs}&p=${page + 1}`}>Próxima</Link>}
      </div>
    </>
  );
}
