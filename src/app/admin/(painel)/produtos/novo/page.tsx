import { requireAdmin } from "@/lib/supabase/admin-guard";
import { Card, Field, Notice, PageHeader } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { createProduct } from "../actions";

export default async function NewProduct({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const { supabase } = await requireAdmin();
  const [types, subtypes, suppliers] = await Promise.all([
    supabase.from("product_types").select("id, code, name").eq("active", true).order("sort_order"),
    supabase.from("product_subtypes").select("id, type_id, name").eq("active", true).order("sort_order"),
    supabase.from("suppliers").select("id, name").eq("active", true).order("name"),
  ]);
  return (
    <>
      <PageHeader title="Novo produto" description="A peça nasce interna e no acervo. O código Casa Áurea é gerado a partir do tipo e não muda mais." />
      {erro && <Notice kind="bad">{erro === "campos" ? "Informe nome e tipo." : erro}</Notice>}
      <Card>
        <form action={createProduct} className="adm-grid c2">
          <Field label="Nome"><input type="text" name="name" required /></Field>
          <Field label="Tipo" hint="Define o código: CA-[TIPO]-0000">
            <select name="product_type_id" required defaultValue="">
              <option value="" disabled>Selecione…</option>
              {(types.data ?? []).map((t: { id: string; code: string; name: string }) => <option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}
            </select>
          </Field>
          <Field label="Subtipo (opcional)">
            <select name="product_subtype_id" defaultValue="">
              <option value="">—</option>
              {(subtypes.data ?? []).map((s: { id: string; type_id: string; name: string }) => {
                const t = (types.data ?? []).find((x: { id: string }) => x.id === s.type_id);
                return <option key={s.id} value={s.id}>{t ? `${t.code} · ` : ""}{s.name}</option>;
              })}
            </select>
          </Field>
          <Field label="Ambiente">
            <select name="environment" defaultValue="indoor"><option value="indoor">Indoor</option><option value="outdoor">Outdoor</option><option value="both">Indoor e outdoor</option></select>
          </Field>
          <Field label="Fornecedor (interno)">
            <select name="supplier_id" defaultValue=""><option value="">—</option>
              {(suppliers.data ?? []).map((s: { id: string; name: string }) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </Field>
          <div className="adm-actions" style={{ gridColumn: "1/-1" }}><SubmitButton>Criar produto</SubmitButton></div>
        </form>
      </Card>
    </>
  );
}
