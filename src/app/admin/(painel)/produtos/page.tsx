import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/admin-guard";
import { Badge, Empty, PageHeader, QUALITY_LABELS, formatDate } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { bulkAction, releaseGoodPhotos, setShowState } from "./actions";
import { FiltersToggle } from "@/components/admin/FiltersToggle";

type SP = { liberadas?: string; erro?: string; q?: string; tipo?: string; fornecedor?: string; visibilidade?: string; curadoria?: string; status?: string; pendencia?: string; p?: string };
const PER = 50;

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const page = Math.max(1, Number(sp.p) || 1);
  const [types, suppliers, result] = await Promise.all([
    supabase.from("product_types").select("id, code, name").order("sort_order"),
    supabase.from("suppliers").select("id, name").order("name"),
    supabase.rpc("admin_search_products", {
      q: sp.q ?? null, f_type: sp.tipo || null, f_supplier: sp.fornecedor || null,
      f_visibility: sp.visibilidade || null, f_curation: sp.curadoria || null, f_status: sp.status || null,
      f_flag: sp.pendencia && sp.pendencia !== "possibleDuplicate" ? sp.pendencia : null, p_limit: PER, p_offset: (page - 1) * PER,
    }),
  ]);
  let rows = (result.data ?? []) as {
    id: string; public_code: string | null; name: string; type_name: string | null; supplier_name: string | null;
    status_commercial: string; visibility: string; curation_tier: string; primary_image: string | null; updated_at: string; total: number;
  }[];
  if (sp.pendencia === "possibleDuplicate") {
    const { data: d } = await supabase.from("product_possible_duplicates").select("product_id, duplicate_of");
    const ids = new Set((d ?? []).flatMap((x: { product_id: string; duplicate_of: string }) => [x.product_id, x.duplicate_of]));
    rows = rows.filter((r) => ids.has(r.id));
  }
  const total = rows[0]?.total ?? 0;
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "p") as [string, string][]).toString();

  return (
    <>
      <PageHeader title="Produtos" description="Cada peça tem três estados no site: Vitrine (seleção em destaque), Acervo (disponível em /acervo e na busca) e Oculta (só a equipe vê).">
        <form action={releaseGoodPhotos}><SubmitButton variant="ghost">Liberar no acervo as peças com foto boa</SubmitButton></form>
        <Link className="adm-btn ghost" href="/admin/importacoes">Importar</Link>
        <Link className="adm-btn" href="/admin/produtos/novo">Novo produto</Link>
      </PageHeader>

      <form className="adm-filters" role="search">
        <input type="search" name="q" defaultValue={sp.q} placeholder="Código, nome, fornecedor, catálogo, material, tag…" aria-label="Buscar" />
        <FiltersToggle active={[sp.tipo, sp.fornecedor, sp.visibilidade, sp.curadoria, sp.pendencia].filter(Boolean).length} />
        <select name="tipo" defaultValue={sp.tipo ?? ""} aria-label="Tipo"><option value="">Todos os tipos</option>
          {(types.data ?? []).map((t: { id: string; code: string; name: string }) => <option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}</select>
        <select name="fornecedor" defaultValue={sp.fornecedor ?? ""} aria-label="Fornecedor"><option value="">Fornecedores</option>
          {(suppliers.data ?? []).map((s: { id: string; name: string }) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select name="visibilidade" defaultValue={sp.visibilidade ?? ""} aria-label="Visibilidade"><option value="">Visibilidade</option>
          <option value="public">Pública</option><option value="internal">Interna</option><option value="hidden">Oculta</option><option value="archived">Arquivada</option></select>
        <select name="curadoria" defaultValue={sp.curadoria ?? ""} aria-label="Curadoria"><option value="">Curadoria</option>
          <option value="archive">Acervo</option><option value="curated">Curated</option><option value="signature">Signature</option></select>
        <select name="pendencia" defaultValue={sp.pendencia ?? ""} aria-label="Pendência"><option value="">Pendências</option>
          {Object.entries(QUALITY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <button className="adm-btn">Filtrar</button>
      </form>

      {sp.liberadas && <div className="adm-alert ok" style={{ marginBottom: "1rem" }}>{sp.liberadas} peça(s) liberada(s) no acervo.</div>}
      {sp.erro === "publicar" && <div className="adm-alert bad" style={{ marginBottom: "1rem" }}>Para aparecer no site, a peça precisa de tipo confirmado (código Casa Áurea) e de uma foto ativa.</div>}
      {result.error && <div className="adm-alert bad" style={{ marginBottom: "1rem" }}>{result.error.message}</div>}

      <form action={bulkAction}>
        <input type="hidden" name="qs" value={qs + (page > 1 ? `&p=${page}` : "")} />
        <div className="adm-table-wrap">
          {rows.length === 0 ? <Empty>Nenhuma peça encontrada.{!sp.q && " Crie a primeira ou importe uma planilha."}</Empty> : (
            <table className="adm-table">
              <thead><tr><th><span className="sr">Selecionar</span></th><th>Imagem</th><th>Código</th><th>Nome</th><th>Tipo</th><th>Fornecedor</th><th>No site</th><th>Comercial</th><th>Atualizado</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><input type="checkbox" name="ids" value={r.id} aria-label={`Selecionar ${r.name}`} /></td>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <td><Link className="adm-thumb-link" href={`/admin/apresentar/${r.id}?de=${encodeURIComponent(`/admin/produtos${qs ? `?${qs}` : ""}`)}`} title="Abrir ficha para mostrar ao cliente">{r.primary_image ? <img className="adm-thumb" src={r.primary_image} alt={`Abrir ficha de ${r.name}`} loading="lazy" /> : <span className="adm-thumb" />}</Link></td>
                    <td className="adm-code">{r.public_code ?? "—"}</td>
                    <td className="adm-title"><Link href={`/admin/produtos/${r.id}`}>{r.name}</Link><Link className="adm-show" href={`/admin/apresentar/${r.id}?de=${encodeURIComponent(`/admin/produtos${qs ? `?${qs}` : ""}`)}`}>Mostrar ao cliente</Link></td>
                    <td>{r.type_name ?? "—"}</td>
                    <td>{r.supplier_name ?? "—"}</td>
                    <td>
                      <div className="adm-seg" role="group" aria-label={`Exibição de ${r.name}`}>
                        {([["vitrine", "Vitrine"], ["acervo", "Acervo"], ["oculta", "Oculta"]] as const).map(([v, l]) => {
                          const cur = r.visibility !== "public" ? "oculta" : r.curation_tier === "archive" ? "acervo" : "vitrine";
                          return <button key={v} type="submit" formAction={setShowState} name="show" value={`${r.id}|${v}`} aria-pressed={cur === v}>{l}</button>;
                        })}
                      </div>
                      {r.curation_tier === "signature" && r.visibility === "public" && <> <Badge map="curation" value="signature" /></>}
                    </td>
                    <td><Badge map="commercial" value={r.status_commercial} /></td>
                    <td>{formatDate(r.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {rows.length > 0 && (
          <div className="adm-actions">
            <select name="bulk" aria-label="Ação em lote" defaultValue="">
              <option value="" disabled>Ação nas selecionadas…</option>
              <option value="curated">Marcar como Curated</option><option value="signature">Marcar como Signature</option>
              <option value="archive">Voltar para Acervo</option><option value="internal">Tornar internas</option>
              <option value="hidden">Ocultar</option><option value="archived">Arquivar</option>
            </select>
            <SubmitButton variant="ghost">Aplicar</SubmitButton>
            <span className="adm-note">Publicação é feita peça a peça (exige tipo e foto principal).</span>
          </div>
        )}
      </form>

      <div className="adm-pager">
        <span>{total} peça(s)</span>
        {page > 1 && <Link className="adm-btn ghost sm" href={`?${qs}&p=${page - 1}`}>Anterior</Link>}
        {page * PER < total && <Link className="adm-btn ghost sm" href={`?${qs}&p=${page + 1}`}>Próxima</Link>}
      </div>
    </>
  );
}
