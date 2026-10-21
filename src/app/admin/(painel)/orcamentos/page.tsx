import { requireAdmin } from "@/lib/supabase/admin-guard";
import { OrcApp } from "@/components/admin/OrcApp";

/* Orçamentos de cortinas, persianas e móveis. O motor e as telas vêm de public/admin-orc/orcamentos.js
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
  // migração 0009 (custos + orçamentos de móveis): sem ela, a aba Móveis avisa em vez de quebrar
  const m9 = await supabase.from("product_costs").select("product_id", { head: true, count: "exact" });
  const version = (process.env.VERCEL_GIT_COMMIT_SHA || "dev").slice(0, 8);
  return <OrcApp rows={(data ?? []) as { kind: string; id: string; data: unknown }[]} version={version} m9={!m9.error} />;
}
