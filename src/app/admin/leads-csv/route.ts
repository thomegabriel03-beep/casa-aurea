import { createClient } from "@/lib/supabase/server";
import {
  LANG_LABEL, LEAD_COLUMNS, PROFILE_KEYS, deviceLabel, fmtDateTime, monthRange, profileLabel, sourceLabel, statusLabel, toCsv,
  type LeadRow,
} from "@/lib/aurea/leads-admin";

/* Planilha dos leads da Áurea (abre no Excel). Mesmos filtros da tela; só administradores. */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("Faça login no painel.", { status: 401 });
  const { data: isAdmin } = await supabase.rpc("is_catalog_admin");
  if (!isAdmin) return new Response("Sem permissão.", { status: 403 });

  const u = new URL(req.url);
  const tipo = u.searchParams.get("tipo") === "todas" ? "todas" : "leads";
  const status = u.searchParams.get("status") ?? "";
  const mes = u.searchParams.get("mes") ?? "";
  const perfil = u.searchParams.get("perfil") ?? "";
  const contato = u.searchParams.get("contato") ?? "";
  let q = supabase.from("aurea_conversations")
    .select(LEAD_COLUMNS)
    .order("created_at", { ascending: false }).limit(10000);
  if (tipo === "leads") q = q.eq("is_lead", true);
  if (status) q = q.eq("status", status);
  if (/^\d{4}-\d{2}$/.test(mes)) { const [a, b] = monthRange(mes); q = q.gte("created_at", a).lt("created_at", b); }
  if (PROFILE_KEYS.includes(perfil)) q = q.eq("profile", perfil);
  if (contato === "com") q = q.or("phone.not.is.null,email.not.is.null");
  if (contato === "sem") q = q.is("phone", null).is("email", null);
  const { data, error } = await q;
  if (error) return new Response("Rode as migrações 0008_aurea_leads.sql e 0010_aurea_lead_captura.sql no Supabase.", { status: 500 });

  const rows = (data ?? []) as LeadRow[];
  const csv = toCsv([
    ["Data", "Nome", "WhatsApp", "E-mail", "Cidade", "Perfil", "Procurava", "Peças indicadas", "Clicou no WhatsApp", "Status",
      "Anotações", "Idioma", "Mensagens do visitante", "Mensagens no total", "Consentimento", "Origem", "utm_source", "utm_medium",
      "utm_campaign", "Veio de", "Página de entrada", "Dispositivo"],
    ...rows.map((r) => [
      fmtDateTime(r.created_at), r.name, r.phone, r.email, r.city, profileLabel(r.profile), r.first_message, r.pieces.join(", "),
      r.wa_clicked ? "sim" : "não", statusLabel(r.status), r.notes, LANG_LABEL[r.lang] ?? r.lang, r.user_count, r.turn_count,
      r.consent_at ? fmtDateTime(r.consent_at) : "", sourceLabel(r.source), r.source?.utm_source, r.source?.utm_medium,
      r.source?.utm_campaign, r.source?.referrer, r.source?.landing, deviceLabel(r.source),
    ]),
  ]);
  const name = `leads-aurea${/^\d{4}-\d{2}$/.test(mes) ? `-${mes}` : ""}.csv`;
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "private, no-store",
    },
  });
}
