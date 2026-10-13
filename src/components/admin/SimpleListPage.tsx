import { requireAdmin } from "@/lib/supabase/admin-guard";
import { Card, Empty, PageHeader } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { createItem, deleteItem, updateItem } from "@/app/admin/(painel)/_shared/simple-actions";

export async function SimpleListPage({ table, title, description }: { table: "materials" | "finishes" | "tags"; title: string; description: string }) {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from(table).select("*").order("name");
  const hasActive = table !== "tags";
  return (
    <>
      <PageHeader title={title} description={description} />
      <Card title="Adicionar">
        <form action={createItem.bind(null, table)} className="adm-actions" style={{ marginTop: 0 }}>
          <input type="text" name="name" placeholder="Nome" required style={{ maxWidth: "20rem" }} aria-label="Nome" />
          <SubmitButton>Adicionar</SubmitButton>
        </form>
      </Card>
      <div className="adm-table-wrap" style={{ marginTop: "1rem" }}>
        {(data ?? []).length === 0 ? <Empty>Nada cadastrado.</Empty> : (
          <table className="adm-table"><thead><tr><th>Nome</th><th>Slug</th>{hasActive && <th>Ativo</th>}<th /></tr></thead>
            <tbody>{(data ?? []).map((r: { id: string; name: string; slug: string; active?: boolean }) => (
              <tr key={r.id}>
                <td colSpan={hasActive ? 3 : 2}>
                  <form action={updateItem.bind(null, table, r.id)} className="adm-actions" style={{ marginTop: 0 }}>
                    <input type="text" name="name" defaultValue={r.name} aria-label="Nome" style={{ maxWidth: "16rem" }} />
                    <span className="adm-code adm-note">{r.slug}</span>
                    {hasActive && <label className="adm-check"><input type="checkbox" name="active" defaultChecked={r.active} /> ativo</label>}
                    <SubmitButton size="sm" variant="ghost">Salvar</SubmitButton>
                  </form>
                </td>
                <td><form action={deleteItem.bind(null, table, r.id)}><SubmitButton size="sm" variant="danger" confirm="Excluir? (só é possível sem peças vinculadas)">Excluir</SubmitButton></form></td>
              </tr>))}</tbody></table>
        )}
      </div>
    </>
  );
}
