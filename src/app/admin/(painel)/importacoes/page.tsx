import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/admin-guard";
import { Card, Empty, Field, Notice, PageHeader, formatDate } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { importCsv, setBatchStatus } from "./actions";
import { pauseBatch, resumeBatch } from "./pdf-actions";
import { PdfImportForm } from "@/components/admin/PdfImportForm";

const COLS = "nome; tipo (SOF, POL…); subtipo; fornecedor; catalogo; ano; pagina; codigo_original; nome_original; descricao_curta; descricao; ambiente (indoor/outdoor/both); materiais; acabamentos; tags; colecoes; variacoes (nome=preço|…); preco";

export default async function Imports({ searchParams }: { searchParams: Promise<{ lote?: string; erro?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const [{ data: batches }, { data: suppliers }, { data: catalogs }] = await Promise.all([
    supabase.from("import_batches").select("*").order("created_at", { ascending: false }).limit(30),
    supabase.from("suppliers").select("id, name").order("name"),
    supabase.from("catalogs").select("id, name, year, supplier_id, suppliers(name)").order("name"),
  ]);
  const current = sp.lote ? (batches ?? []).find((b: { id: string }) => b.id === sp.lote) : null;
  return (
    <>
      <PageHeader title="Importações" description="Catálogos em PDF e planilhas entram como internos e no acervo. Nada é publicado automaticamente.">
        <Link className="adm-btn" href="/admin/importacoes/revisao">Fila de revisão</Link>
      </PageHeader>
      {sp.erro && <Notice kind="bad">{sp.erro === "arquivo" ? "Selecione um arquivo CSV." : "Não foi possível iniciar a importação."}</Notice>}
      {current && (
        <Notice kind={current.status === "imported" ? "ok" : "warn"}>
          {current.imported} peça(s) importada(s) de {current.source_file}. {(current.log ?? []).length > 0 && `${(current.log ?? []).length} aviso(s) abaixo.`}
          {" "}<Link href="/admin/produtos?visibilidade=internal">Revisar peças</Link>
        </Notice>
      )}
      <Card title="Novo catálogo (PDF)">
        <PdfImportForm suppliers={(suppliers ?? []) as { id: string; name: string }[]} catalogs={(catalogs ?? []) as { id: string; name: string; supplier_id: string; year: number | null }[]} />
        <p className="adm-note" style={{ marginTop: "1rem" }}>O processamento roda em segundo plano, por blocos de páginas, com checkpoint: pode ser pausado e retomado sem recomeçar.</p>
      </Card>
      <Card title="Nova importação (CSV)">
        <form action={importCsv} className="adm-grid c3">
          <Field label="Arquivo CSV (separado por ; ou ,)"><input type="file" name="file" accept=".csv,text/csv" required /></Field>
          <Field label="Fornecedor padrão (opcional)"><select name="supplier_id" defaultValue=""><option value="">—</option>
            {(suppliers ?? []).map((s: { id: string; name: string }) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Catálogo padrão (opcional)"><select name="catalog_id" defaultValue=""><option value="">—</option>
            {(catalogs ?? []).map((c: { id: string; name: string; year: number | null; suppliers: { name: string } | null }) => <option key={c.id} value={c.id}>{c.suppliers?.name} · {c.name} {c.year ?? ""}</option>)}</select></Field>
          <div className="adm-actions" style={{ gridColumn: "1/-1" }}><SubmitButton>Importar</SubmitButton></div>
        </form>
        <p className="adm-note" style={{ marginTop: "1rem" }}>Colunas reconhecidas: {COLS}. Listas separadas por “|”. JSON e extração de PDF entram neste mesmo fluxo de lotes.</p>
      </Card>
      <div className="adm-table-wrap" style={{ marginTop: "1rem" }}>
        {(batches ?? []).length === 0 ? <Empty>Nenhuma importação.</Empty> : (
          <table className="adm-table"><thead><tr><th>Data</th><th>Arquivo</th><th>Status</th><th>Progresso</th><th>Peças</th><th>Erros</th><th>Avisos</th><th /></tr></thead>
            <tbody>{(batches ?? []).map((b: { id: string; created_at: string; source_file: string | null; status: string; imported: number; failed: number; log: string[]; kind: string; total_pages: number | null; processed_pages: number; products_detected: number; warnings: string[] }) => (
              <tr key={b.id}>
                <td>{formatDate(b.created_at)}</td><td>{b.source_file}</td><td><span className="adm-badge">{b.status}</span></td>
                <td>{b.kind === "pdf" ? (b.total_pages ? <><progress max={b.total_pages} value={b.processed_pages} style={{ width: "6rem" }} /> {b.processed_pages}/{b.total_pages}</> : "na fila") : "—"}</td>
                <td>{b.kind === "pdf" ? b.products_detected : b.imported}</td><td>{b.failed}</td>
                <td>{(b.log ?? []).length > 0 ? <details><summary>{b.log.length}</summary><ul className="adm-note">{b.log.slice(0, 50).map((l, i) => <li key={i}>{l}</li>)}</ul></details> : "—"}</td>
                <td>{b.kind === "pdf" && b.status === "processing" ? <form action={pauseBatch.bind(null, b.id)}><SubmitButton size="sm" variant="ghost">Pausar</SubmitButton></form>
                  : b.kind === "pdf" && (b.status === "paused" || b.status === "failed") ? <form action={resumeBatch.bind(null, b.id)}><SubmitButton size="sm" variant="ghost">{b.status === "paused" ? "Retomar" : "Tentar de novo"}</SubmitButton></form>
                  : b.kind === "pdf" && (b.status === "needs_review" || b.status === "imported") ? <Link className="adm-btn ghost sm" href={`/admin/importacoes/revisao?lote=${b.id}`}>Revisar</Link>
                  : b.status === "needs_review" || b.status === "imported" ? (
                  <form action={setBatchStatus.bind(null, b.id, b.status === "needs_review" ? "reviewed" : "approved")}><SubmitButton size="sm" variant="ghost">{b.status === "needs_review" ? "Marcar revisado" : "Aprovar lote"}</SubmitButton></form>
                ) : null}</td>
              </tr>))}</tbody></table>
        )}
      </div>
    </>
  );
}
