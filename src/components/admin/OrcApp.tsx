"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/browser";

type Row = { kind: string; id: string; data: unknown };
type Up = { kind: string; id: string; data: unknown };
type Del = { kind: string; id: string };

/** Peça encontrada pelo código ou nome, para o orçamento de móveis (somente no painel). */
export type OrcHit = {
  pid: string;
  vid: string | null;
  code: string;
  nome: string;
  foto: string;
  medidas: string;
  custo: number | null;
  preco: number | null;
};

declare global {
  interface Window {
    __orcStore?: {
      rows: Row[];
      m9: boolean;
      sync: (up: Up[], del: Del[]) => Promise<void>;
      findProducts: (q: string) => Promise<OrcHit[]>;
    };
  }
}

type SearchRow = { id: string; public_code: string | null; name: string; primary_image: string | null };
type ProdRow = { id: string; dimensions: string | null; price: number | string | null };
type VarRow = {
  id: string; product_id: string; variant_code: string | null; name: string | null;
  width_cm: number | null; height_cm: number | null; depth_cm: number | null; diameter_cm: number | null;
  price: number | string | null; sort_order: number | null;
};
type MediaRow = { product_id: string; url: string };
type CostRow = { product_id: string; cost: number | string };

const toNum = (v: number | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** "L 220 × P 95 × A 80 cm" a partir das medidas da variante. */
function variantDims(v: VarRow): string {
  const f = (n: number | null) => (n == null ? null : String(Number(n)).replace(".", ","));
  const parts: string[] = [];
  if (v.diameter_cm != null) parts.push(`Ø ${f(v.diameter_cm)}`);
  if (v.width_cm != null) parts.push(`L ${f(v.width_cm)}`);
  if (v.depth_cm != null) parts.push(`P ${f(v.depth_cm)}`);
  if (v.height_cm != null) parts.push(`A ${f(v.height_cm)}`);
  return parts.length ? `${parts.join(" × ")} cm` : "";
}

/** Busca no catálogo (RLS: só administradores). Nunca devolve fornecedor nem código de fornecedor. */
async function searchProducts(supabase: ReturnType<typeof createClient>, q: string): Promise<OrcHit[]> {
  const term = q.trim().replace(/\s+/g, " ");
  if (term.length < 2) return [];
  const { data, error } = await supabase.rpc("admin_search_products", {
    q: term, f_type: null, f_supplier: null, f_visibility: null, f_curation: null, f_status: null, f_flag: null,
    p_limit: 8, p_offset: 0,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as SearchRow[];
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [prods, vars, media, costs] = await Promise.all([
    supabase.from("products").select("id, dimensions, price").in("id", ids),
    supabase.from("product_variants")
      .select("id, product_id, variant_code, name, width_cm, height_cm, depth_cm, diameter_cm, price, sort_order")
      .in("product_id", ids).order("sort_order"),
    supabase.from("product_media").select("product_id, url").in("product_id", ids).eq("is_primary", true).eq("status", "active"),
    supabase.from("product_costs").select("product_id, cost").in("product_id", ids),
  ]);
  const prodBy = new Map<string, ProdRow>(((prods.data ?? []) as ProdRow[]).map((p): [string, ProdRow] => [p.id, p]));
  const fotoBy = new Map<string, string>(((media.data ?? []) as MediaRow[]).map((m): [string, string] => [m.product_id, m.url]));
  const costBy = new Map<string, number | null>(
    costs.error ? [] : ((costs.data ?? []) as CostRow[]).map((c): [string, number | null] => [c.product_id, toNum(c.cost)]),
  );
  const varsBy = new Map<string, VarRow[]>();
  for (const v of (vars.data ?? []) as VarRow[]) varsBy.set(v.product_id, [...(varsBy.get(v.product_id) ?? []), v]);

  const upper = term.toUpperCase();
  const hits: OrcHit[] = [];
  for (const r of rows) {
    const p = prodBy.get(r.id);
    const base: OrcHit = {
      pid: r.id, vid: null, code: r.public_code ?? "", nome: r.name,
      foto: fotoBy.get(r.id) ?? r.primary_image ?? "",
      medidas: p?.dimensions ?? "",
      custo: costBy.get(r.id) ?? null,
      preco: toNum(p?.price ?? null),
    };
    const vs = varsBy.get(r.id) ?? [];
    if (!base.medidas && vs.length === 1) base.medidas = variantDims(vs[0]);
    hits.push(base);
    for (const v of vs.length > 1 ? vs : []) {
      hits.push({
        ...base,
        vid: v.id,
        code: v.variant_code ?? base.code,
        nome: v.name ? `${r.name} · ${v.name}` : r.name,
        medidas: variantDims(v) || base.medidas,
        preco: toNum(v.price) ?? base.preco,
      });
    }
  }
  // código digitado por inteiro (peça ou variante) vem primeiro
  hits.sort((a, b) => Number(b.code === upper) - Number(a.code === upper));
  return hits.slice(0, 12);
}

/* Monta o módulo de orçamentos e liga o salvamento ao banco (quote_docs). */
export function OrcApp({ rows, version, m9 }: { rows: Row[]; version: string; m9: boolean }) {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const supabase = createClient();
    window.__orcStore = {
      rows,
      m9,
      async sync(up, del) {
        if (up.length) {
          const { error } = await supabase.from("quote_docs").upsert(up.map((u) => ({ kind: u.kind, id: u.id, data: u.data })));
          if (error) throw new Error(error.message);
        }
        for (const d of del) {
          const { error } = await supabase.from("quote_docs").delete().eq("kind", d.kind).eq("id", d.id);
          if (error) throw new Error(error.message);
        }
      },
      findProducts: (q) => searchProducts(supabase, q),
    };
    const s = document.createElement("script");
    s.src = `/admin-orc/orcamentos.js?v=${version}`;
    s.async = true;
    document.body.appendChild(s);
  }, [rows, version, m9]);

  return <div id="orcRoot" className="orc-app"><p className="adm-note">Carregando orçamentos…</p></div>;
}
