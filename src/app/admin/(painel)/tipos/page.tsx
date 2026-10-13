import { requireAdmin } from "@/lib/supabase/admin-guard";
import { Card, Field, PageHeader } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { saveSubtype, saveType } from "./actions";

type Sub = { id: string; type_id: string; name: string; active: boolean };
type Ty = { id: string; code: string; name: string; plural_name: string | null; slug: string; section: string; sort_order: number; active: boolean };

export default async function Types() {
  const { supabase } = await requireAdmin();
  const [{ data: types }, { data: subs }] = await Promise.all([
    supabase.from("product_types").select("*").order("sort_order"),
    supabase.from("product_subtypes").select("*").order("sort_order"),
  ]);
  return (
    <>
      <PageHeader title="Tipos e subtipos" description="O código de 3 letras do tipo compõe o código Casa Áurea e não pode ser alterado depois de criado." />
      <Card title="Novo tipo">
        <form action={saveType.bind(null, null)} className="adm-grid c4">
          <Field label="Código (3 letras)"><input type="text" name="code" maxLength={3} pattern="[A-Za-z]{3}" required /></Field>
          <Field label="Nome"><input type="text" name="name" required /></Field>
          <Field label="Plural (menu)"><input type="text" name="plural_name" /></Field>
          <Field label="Seção"><select name="section" defaultValue="moveis"><option value="moveis">Móveis</option><option value="decoracao">Decoração</option><option value="natal">Natal</option><option value="outros">Outros</option></select></Field>
          <input type="hidden" name="sort_order" value="50" />
          <div className="adm-actions" style={{ gridColumn: "1/-1" }}><SubmitButton>Adicionar</SubmitButton></div>
        </form>
      </Card>
      {(types ?? []).map((t: Ty) => (
        <Card key={t.id}>
          <form action={saveType.bind(null, t.id)} className="adm-actions" style={{ marginTop: 0 }}>
            <span className="adm-code adm-badge">{t.code}</span>
            <input type="text" name="name" defaultValue={t.name} aria-label="Nome" style={{ maxWidth: "12rem" }} />
            <input type="text" name="plural_name" defaultValue={t.plural_name ?? ""} aria-label="Plural" style={{ maxWidth: "12rem" }} />
            <select name="section" defaultValue={t.section} aria-label="Seção"><option value="moveis">Móveis</option><option value="decoracao">Decoração</option><option value="natal">Natal</option><option value="outros">Outros</option></select>
            <input type="number" name="sort_order" defaultValue={t.sort_order} aria-label="Ordem" style={{ maxWidth: "5rem" }} />
            <label className="adm-check"><input type="checkbox" name="active" defaultChecked={t.active} /> ativo</label>
            <SubmitButton size="sm" variant="ghost">Salvar</SubmitButton>
            <span className="adm-note">/moveis/{t.slug}</span>
          </form>
          <div className="adm-checks" style={{ marginTop: ".75rem" }}>
            {(subs ?? []).filter((s: Sub) => s.type_id === t.id).map((s: Sub) => (
              <form key={s.id} action={saveSubtype.bind(null, t.id, s.id)} className="adm-check">
                <input type="text" name="name" defaultValue={s.name} aria-label="Subtipo" style={{ maxWidth: "10rem" }} />
                <input type="checkbox" name="active" defaultChecked={s.active} aria-label="Ativo" />
                <SubmitButton size="sm" variant="ghost">ok</SubmitButton>
              </form>
            ))}
            <form action={saveSubtype.bind(null, t.id, null)} className="adm-check">
              <input type="text" name="name" placeholder="Novo subtipo" aria-label="Novo subtipo" style={{ maxWidth: "10rem" }} />
              <SubmitButton size="sm">+</SubmitButton>
            </form>
          </div>
        </Card>
      ))}
    </>
  );
}
