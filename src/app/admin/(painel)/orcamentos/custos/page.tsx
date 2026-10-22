import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/admin-guard";
import { Card, PageHeader } from "@/components/admin/ui";
import { CostImportForm } from "@/components/admin/CostImportForm";

/* Custos internos das peças (para o orçamento de móveis). Só o painel lê; o site nunca. */
export const dynamic = "force-dynamic";
export const metadata = { title: "Custos das peças" };

export default async function CustosPage() {
  const { supabase } = await requireAdmin();
  const [costs, products] = await Promise.all([
    supabase.from("product_costs").select("product_id", { head: true, count: "exact" }),
    supabase.from("products").select("id", { head: true, count: "exact" }),
  ]);

  return (
    <>
      <PageHeader title="Custos das peças" description="Preço de custo interno usado nos móveis do orçamento (custo + margem). Nunca aparece no site nem no documento do cliente.">
        <Link className="adm-btn ghost" href="/admin/orcamentos#/orcamentos">Orçamentos</Link>
      </PageHeader>
      {costs.error ? (
        <div className="adm-alert bad" role="alert">
          A tabela de custos ainda não existe. Rode a migração <code>supabase/migrations/0009_orcamento_moveis.sql</code> no SQL Editor do Supabase e recarregue esta página.
        </div>
      ) : (
        <>
          <Card title="Situação">
            <p><b>{costs.count ?? 0}</b> de {products.count ?? 0} peças com custo cadastrado.</p>
            <p className="adm-note" style={{ marginTop: ".35rem" }}>O custo de uma peça também pode ser editado no produto, aba Comercial.</p>
          </Card>
          <Card title="Importar planilha de custos">
            <p className="adm-note" style={{ marginBottom: "1rem" }}>
              Exporte do sistema da loja uma planilha com o <b>código</b> e o <b>custo</b> de cada peça. O código pode ser o Casa Áurea
              (<span className="adm-code">CA-MES-0167</span>), o SKU interno ou o código do fornecedor. Peças já com custo são atualizadas.
            </p>
            <CostImportForm />
          </Card>
        </>
      )}
    </>
  );
}
