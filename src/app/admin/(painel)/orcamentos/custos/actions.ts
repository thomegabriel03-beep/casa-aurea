"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/admin-guard";
import { baseCodeOf } from "@/lib/catalog/codes";
import { parseCostCsv } from "@/lib/catalog/costs";

export type CostImportResult = {
  ok: boolean;
  message: string;
  updated: number;
  notFound: string[];
  ambiguous: string[];
  errors: string[];
};
export type CostImportState = CostImportResult | null;

const CHUNK = 200;
const MAX_BYTES = 2_000_000;

function chunks<T>(list: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Importa a planilha "código; custo" para product_costs (interno, só admin).
 *  O código pode ser o Casa Áurea (CA-MES-0167, inclusive de variante), o SKU interno
 *  ou o código original do fornecedor — nessa ordem. Nada aparece no site. */
export async function importCosts(_prev: CostImportState, form: FormData): Promise<CostImportState> {
  const { supabase } = await requireAdmin();
  const file = form.get("arquivo");
  const fail = (message: string): CostImportResult => ({ ok: false, message, updated: 0, notFound: [], ambiguous: [], errors: [] });
  if (!(file instanceof File) || file.size === 0) return fail("Escolha a planilha (CSV) antes de importar.");
  if (file.size > MAX_BYTES) return fail("Arquivo grande demais (máximo 2 MB). Exporte só as colunas código e custo.");

  const { rows, errors } = parseCostCsv(await file.text());
  if (!rows.length) return { ...fail("Nenhuma linha válida na planilha."), errors };

  const probe = await supabase.from("product_costs").select("product_id", { head: true, count: "exact" });
  if (probe.error) return fail("A tabela de custos ainda não existe: rode a migração supabase/migrations/0009_orcamento_moveis.sql no SQL Editor do Supabase.");

  const found = new Map<string, string>(); // código da planilha → id do produto
  const ambiguous = new Set<string>();

  // 1. código Casa Áurea (CA-XXX-0000 ou variante -V01 → código principal)
  const byBase = new Map<string, string[]>();
  for (const r of rows) {
    const base = baseCodeOf(r.code);
    if (base) byBase.set(base, [...(byBase.get(base) ?? []), r.code]);
  }
  for (const part of chunks([...byBase.keys()])) {
    const { data } = await supabase.from("products").select("id, public_code").in("public_code", part);
    for (const p of (data ?? []) as { id: string; public_code: string }[]) {
      for (const code of byBase.get(p.public_code) ?? []) found.set(code, p.id);
    }
  }

  // 2. SKU interno
  const rest1 = rows.map((r) => r.code).filter((c) => !found.has(c));
  for (const part of chunks(rest1)) {
    const { data } = await supabase.from("products").select("id, sku").in("sku", part);
    const hits = new Map<string, string[]>();
    for (const p of (data ?? []) as { id: string; sku: string | null }[]) {
      if (p.sku) hits.set(p.sku.toUpperCase(), [...(hits.get(p.sku.toUpperCase()) ?? []), p.id]);
    }
    for (const c of part) {
      const ids = hits.get(c);
      if (ids && ids.length === 1) found.set(c, ids[0]);
      else if (ids && ids.length > 1) ambiguous.add(c);
    }
  }

  // 3. código original do fornecedor (só quando aponta para uma única peça)
  const rest2 = rows.map((r) => r.code).filter((c) => !found.has(c) && !ambiguous.has(c));
  for (const part of chunks(rest2)) {
    const { data } = await supabase.from("product_source_references").select("product_id, original_code").in("original_code", part);
    const hits = new Map<string, Set<string>>();
    for (const s of (data ?? []) as { product_id: string; original_code: string | null }[]) {
      if (!s.original_code) continue;
      const k = s.original_code.toUpperCase();
      hits.set(k, (hits.get(k) ?? new Set<string>()).add(s.product_id));
    }
    for (const c of part) {
      const ids = hits.get(c);
      if (ids && ids.size === 1) found.set(c, [...ids][0]);
      else if (ids && ids.size > 1) ambiguous.add(c);
    }
  }

  // se a planilha tiver dois códigos da mesma peça, vale a última linha
  const perProduct = new Map<string, number>();
  for (const r of rows) {
    const id = found.get(r.code);
    if (id) perProduct.set(id, r.cost);
  }
  const upserts = [...perProduct.entries()].map(([product_id, cost]) => ({ product_id, cost, source: "planilha" }));
  for (const part of chunks(upserts, 500)) {
    const { error } = await supabase.from("product_costs").upsert(part, { onConflict: "product_id" });
    if (error) return { ...fail(`Erro ao gravar os custos: ${error.message}`), errors };
  }

  revalidatePath("/admin/orcamentos/custos");
  const notFound = rows.map((r) => r.code).filter((c) => !found.has(c) && !ambiguous.has(c));
  return {
    ok: true,
    message: `${upserts.length} peça(s) com custo atualizado.`,
    updated: upserts.length,
    notFound,
    ambiguous: [...ambiguous],
    errors,
  };
}
