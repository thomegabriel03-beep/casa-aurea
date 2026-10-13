"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { slugify } from "@/lib/catalog/slug";
import { createPdfBatch } from "@/app/admin/(painel)/importacoes/pdf-actions";

type Opt = { id: string; name: string; supplier_id?: string; year?: number | null };
const LIMIT = 45 * 1024 * 1024;   // acima disso o PDF é processado localmente pelo worker

/** Envio do catálogo PDF direto ao bucket privado (sem passar pelo servidor) e criação do lote na fila. */
export function PdfImportForm({ suppliers, catalogs }: { suppliers: Opt[]; catalogs: Opt[] }) {
  const router = useRouter();
  const [supplier, setSupplier] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [localCmd, setLocalCmd] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const file = f.get("file") as File | null;
    if (!file || !file.size) return setMsg({ kind: "bad", text: "Selecione o PDF." });
    setBusy(true); setMsg(null); setLocalCmd(null);
    const large = file.size > LIMIT;
    let path: string | null = null;
    if (!large) {
      // arquivo temporário: o worker apaga o PDF do Storage ao terminar
      path = `${crypto.randomUUID()}/${slugify(file.name.replace(/\.pdf$/i, "")) || "catalogo"}.pdf`;
      const { error } = await createClient().storage.from("importacoes").upload(path, file, { contentType: "application/pdf", upsert: false });
      if (error) { setBusy(false); return setMsg({ kind: "bad", text: `Falha no envio: ${error.message}` }); }
    }
    const r = await createPdfBatch({ path, fileName: file.name, size: file.size, supplierId: String(f.get("supplier") ?? ""), catalogId: String(f.get("catalog") ?? ""),
      year: String(f.get("year") ?? ""), notes: String(f.get("notes") ?? "") });
    setBusy(false);
    if (r.error) return setMsg({ kind: "bad", text: r.error });
    if (large && r.id) {
      setLocalCmd(`python -m casa_aurea_import.sink --batch ${r.id} --file "${file.name}"`);
      setMsg({ kind: "ok", text: `Catálogo de ${Math.round(file.size / 1048576)} MB: ele não sobe ao Storage. O lote foi criado; rode o comando abaixo na máquina onde está o PDF.` });
    } else setMsg({ kind: "ok", text: "Catálogo enviado. O lote entrou na fila; o PDF temporário é apagado ao final do processamento." });
    (e.target as HTMLFormElement).reset(); setSupplier("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="adm-grid c3">
      <label className="adm-field"><span>Fornecedor</span>
        <select name="supplier" required value={supplier} onChange={(e) => setSupplier(e.target.value)}>
          <option value="">Selecione…</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></label>
      <label className="adm-field"><span>Catálogo</span>
        <select name="catalog" required defaultValue="">
          <option value="">{supplier ? "Selecione…" : "Escolha o fornecedor"}</option>
          {catalogs.filter((c) => c.supplier_id === supplier).map((c) => <option key={c.id} value={c.id}>{c.name} {c.year ?? ""}</option>)}
        </select><small>Cadastre em Origem → Catálogos se ainda não existir.</small></label>
      <label className="adm-field"><span>Ano / coleção</span><input type="text" name="year" placeholder="2026" /></label>
      <label className="adm-field" style={{ gridColumn: "1/-1" }}><span>Arquivo PDF</span><input type="file" name="file" accept="application/pdf" required /></label>
      <label className="adm-field" style={{ gridColumn: "1/-1" }}><span>Observação (opcional)</span><input type="text" name="notes" /></label>
      {msg && <div className={`adm-alert ${msg.kind}`} style={{ gridColumn: "1/-1" }}>{msg.text}</div>}
      {localCmd && <pre className="adm-code" style={{ gridColumn: "1/-1", whiteSpace: "pre-wrap", background: "#f6f3ee", padding: ".75rem", borderRadius: 4 }}>{localCmd}</pre>}
      <div className="adm-actions" style={{ gridColumn: "1/-1" }}><button className="adm-btn" disabled={busy}>{busy ? "Enviando…" : "Processar catálogo"}</button></div>
    </form>
  );
}
