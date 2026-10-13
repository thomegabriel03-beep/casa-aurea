import { requireAdmin } from "@/lib/supabase/admin-guard";
import { Card, Field, PageHeader } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { saveSettings } from "./actions";

export default async function Settings() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("site_settings").select("key, value");
  const get = (k: string) => (data ?? []).find((r: { key: string }) => r.key === k)?.value ?? "";
  return (
    <>
      <PageHeader title="Configurações" description="Valores centrais usados pelo site." />
      <Card title="Contato e endereço">
        <form action={saveSettings} className="adm-grid c2">
          <Field label="WhatsApp comercial (com DDI e DDD)" hint="Usado em todos os botões “Consultar peça”."><input type="text" name="whatsapp_number" defaultValue={get("whatsapp_number")} inputMode="numeric" /></Field>
          <Field label="Endereço do site" hint="Usado nos links enviados pelo WhatsApp."><input type="url" name="site_url" defaultValue={get("site_url")} placeholder="https://www.casaaurea.com.br" /></Field>
          <div className="adm-actions" style={{ gridColumn: "1/-1" }}><SubmitButton>Salvar</SubmitButton></div>
        </form>
      </Card>
      <Card title="Acesso ao painel">
        <p className="adm-note">Administradores são usuários do Supabase Auth listados na tabela catalog_admins. Para incluir alguém: crie o usuário em Authentication → Users e rode no SQL Editor:</p>
        <pre className="adm-code" style={{ whiteSpace: "pre-wrap", background: "#f6f3ee", padding: ".75rem", marginTop: ".5rem", borderRadius: 4 }}>{"insert into catalog_admins (user_id)\nselect id from auth.users where email = 'nome@casaaurea.com.br';"}</pre>
        <p className="adm-note" style={{ marginTop: ".5rem" }}>Mantenha o cadastro público desativado (Authentication → Providers → Email → “Allow new users to sign up”).</p>
      </Card>
    </>
  );
}
