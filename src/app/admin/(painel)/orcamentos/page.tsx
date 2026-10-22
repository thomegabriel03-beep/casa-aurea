import { requireAdmin } from "@/lib/supabase/admin-guard";
import { OrcApp } from "@/components/admin/OrcApp";

/* Orçamento único: cortinas, persianas, móveis do catálogo e itens livres no mesmo orçamento. O motor e as telas vêm de public/admin-orc/orcamentos.js
   (gerado por scripts/build_orcamentos.py a partir da prévia aprovada + scripts/orc_ext.js); os dados ficam
   no Supabase (tabela quote_docs, só administradores). Custos das peças: product_costs (migração 0009). */
export const dynamic = "force-dynamic";
export const metadata = { title: "Orçamentos" };

export default async function OrcamentosPage() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.from("quote_docs").select("kind, id, data").limit(5000);
  if (error) {
    return (
      <div className="adm-alert bad" role="alert">
        Não foi possível abrir os orçamentos: {error.message}. Se for a primeira vez, rode a migração
        <code> supabase/migrations/0007_orcamentos.sql</code> no SQL Editor do Supabase.
      </div>
    );
  }
  // migração 0009 (custos das peças): sem ela, o móvel entra sem custo (digitado à mão)
  const [m9, typesRes] = await Promise.all([
    supabase.from("product_costs").select("product_id", { head: true, count: "exact" }),
    supabase.from("product_types").select("id, name").eq("active", true).order("sort_order"),
  ]);
  const types = ((typesRes.data ?? []) as { id: string; name: string }[]).map((t) => ({ id: t.id, name: t.name }));
  const version = (process.env.VERCEL_GIT_COMMIT_SHA || "dev").slice(0, 8);
  return <OrcApp rows={(data ?? []) as { kind: string; id: string; data: unknown }[]} version={version} m9={!m9.error} types={types} />;
}
