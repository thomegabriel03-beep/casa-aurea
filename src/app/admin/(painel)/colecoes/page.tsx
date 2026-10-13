import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/admin-guard";
import { Card, Empty, PageHeader, formatDate } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { createCollection } from "./actions";

export default async function Collections() {
  const { supabase } = await requireAdmin();
  const [{ data }, { data: links }, { data: live }] = await Promise.all([
    supabase.from("collections").select("*").order("sort_order"),
    supabase.from("product_collections").select("collection_id"),
    supabase.from("live_collections").select("id"),
  ]);
  const liveIds = new Set((live ?? []).map((l: { id: string }) => l.id));
  return (
    <>
      <PageHeader title="Coleções" description="Agrupamentos editoriais. Coleções em destaque e no período aparecem na Home e no menu." />
      <Card title="Nova coleção">
        <form action={createCollection} className="adm-actions" style={{ marginTop: 0 }}>
          <input type="text" name="name" placeholder="Nome" required aria-label="Nome" style={{ maxWidth: "20rem" }} />
          <SubmitButton>Criar</SubmitButton>
        </form>
      </Card>
      <div className="adm-table-wrap" style={{ marginTop: "1rem" }}>
        {(data ?? []).length === 0 ? <Empty>Nenhuma coleção.</Empty> : (
          <table className="adm-table"><thead><tr><th>Coleção</th><th>Status</th><th>Peças</th><th>Período</th></tr></thead>
            <tbody>{(data ?? []).map((c: { id: string; name: string; slug: string; active: boolean; featured: boolean; start_date: string | null; end_date: string | null }) => (
              <tr key={c.id}>
                <td><Link href={`/admin/colecoes/${c.id}`}>{c.name}</Link> <span className="adm-note">/colecoes/{c.slug}</span></td>
                <td>{liveIds.has(c.id) ? <span className="adm-badge ok">No ar</span> : c.active ? <span className="adm-badge warn">Fora do período</span> : <span className="adm-badge">Inativa</span>} {c.featured && <span className="adm-badge gold">Destaque</span>}</td>
                <td>{(links ?? []).filter((l: { collection_id: string }) => l.collection_id === c.id).length}</td>
                <td>{c.start_date || c.end_date ? `${formatDate(c.start_date)} até ${formatDate(c.end_date)}` : "Sem período"}</td>
              </tr>))}</tbody></table>
        )}
      </div>
    </>
  );
}
