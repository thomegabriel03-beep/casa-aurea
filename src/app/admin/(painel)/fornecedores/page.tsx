import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/admin-guard";
import { Card, Empty, PageHeader } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { saveSupplier } from "./actions";

export default async function Suppliers() {
  const { supabase } = await requireAdmin();
  const [{ data }, { data: cats }, { data: prods }] = await Promise.all([
    supabase.from("suppliers").select("*").order("name"),
    supabase.from("catalogs").select("supplier_id"),
    supabase.from("products").select("supplier_id").not("supplier_id", "is", null),
  ]);
  const count = (list: { supplier_id: string }[] | null, id: string) => (list ?? []).filter((x) => x.supplier_id === id).length;
  return (
    <>
      <PageHeader title="Fornecedores" description="Dado interno. Nunca aparece no site público." />
      <Card title="Novo fornecedor">
        <form action={saveSupplier.bind(null, null)} className="adm-actions" style={{ marginTop: 0 }}>
          <input type="text" name="name" placeholder="Nome" required style={{ maxWidth: "20rem" }} aria-label="Nome" />
          <input type="text" name="notes" placeholder="Observações" style={{ maxWidth: "24rem" }} aria-label="Observações" />
          <SubmitButton>Adicionar</SubmitButton>
        </form>
      </Card>
      <div className="adm-table-wrap" style={{ marginTop: "1rem" }}>
        {(data ?? []).length === 0 ? <Empty>Nenhum fornecedor.</Empty> : (
          <table className="adm-table"><thead><tr><th>Fornecedor</th><th>Catálogos</th><th>Peças</th></tr></thead>
            <tbody>{(data ?? []).map((s: { id: string; name: string; notes: string | null; active: boolean }) => (
              <tr key={s.id}>
                <td>
                  <form action={saveSupplier.bind(null, s.id)} className="adm-actions" style={{ marginTop: 0 }}>
                    <input type="text" name="name" defaultValue={s.name} aria-label="Nome" style={{ maxWidth: "16rem" }} />
                    <input type="text" name="notes" defaultValue={s.notes ?? ""} placeholder="Observações" aria-label="Observações" style={{ maxWidth: "18rem" }} />
                    <label className="adm-check"><input type="checkbox" name="active" defaultChecked={s.active} /> ativo</label>
                    <SubmitButton size="sm" variant="ghost">Salvar</SubmitButton>
                  </form>
                </td>
                <td><Link href={`/admin/catalogos?fornecedor=${s.id}`}>{count(cats as { supplier_id: string }[], s.id)}</Link></td>
                <td><Link href={`/admin/produtos?fornecedor=${s.id}`}>{count(prods as { supplier_id: string }[], s.id)}</Link></td>
              </tr>))}</tbody></table>
        )}
      </div>
    </>
  );
}
