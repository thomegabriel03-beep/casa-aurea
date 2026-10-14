import { requireAdmin } from "@/lib/supabase/admin-guard";
import { OrcApp } from "@/components/admin/OrcApp";

/* Orçamentos de cortinas e persianas. O motor e as telas são os da prévia aprovada
   (public/admin-orc/orcamentos.js, gerado por scripts/build_orcamentos.py); os dados ficam
   no Supabase (tabela quote_docs, só administradores). */
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
  const version = (process.env.VERCEL_GIT_COMMIT_SHA || "dev").slice(0, 8);
  return <OrcApp rows={(data ?? []) as { kind: string; id: string; data: unknown }[]} version={version} />;
}
