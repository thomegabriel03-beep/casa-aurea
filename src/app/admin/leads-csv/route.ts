import { createClient } from "@/lib/supabase/server";
import { LANG_LABEL, fmtDateTime, monthRange, statusLabel, toCsv, type LeadRow } from "@/lib/aurea/leads-admin";

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
  let q = supabase.from("aurea_conversations")
    .select("id, created_at, updated_at, lang, turn_count, first_message, name, phone, email, pieces, wa_clicked, is_lead, status, notes")
    .order("created_at", { ascending: false }).limit(10000);
  if (tipo === "leads") q = q.eq("is_lead", true);
  if (status) q = q.eq("status", status);
  if (/^\d{4}-\d{2}$/.test(mes)) { const [a, b] = monthRange(mes); q = q.gte("created_at", a).lt("created_at", b); }
  const { data, error } = await q;
  if (error) return new Response("Rode a migração 0008_aurea_leads.sql no Supabase.", { status: 500 });

  const rows = (data ?? []) as LeadRow[];
  const csv = toCsv([
    ["Data", "Nome", "WhatsApp", "E-mail", "Procurava", "Peças indicadas", "Clicou no WhatsApp", "Status", "Anotações", "Idioma", "Mensagens"],
    ...rows.map((r) => [
      fmtDateTime(r.created_at), r.name, r.phone, r.email, r.first_message, r.pieces.join(", "),
      r.wa_clicked ? "sim" : "não", statusLabel(r.status), r.notes, LANG_LABEL[r.lang] ?? r.lang, r.turn_count,
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
