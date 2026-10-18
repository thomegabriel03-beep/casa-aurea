import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/admin-guard";
import { Card, Empty, Notice, PageHeader } from "@/components/admin/ui";
import {
  LEAD_STATUS, STATUS_KEYS, fmtDateTime, monthKey, monthLabel, monthRange, statusLabel, waLink, type LeadRow,
} from "@/lib/aurea/leads-admin";
import { setLeadStatus } from "./actions";

export const dynamic = "force-dynamic";

const PER = 50;
type SP = { tipo?: string; status?: string; mes?: string; p?: string; apagado?: string };

export default async function Leads({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const tipo = sp.tipo === "todas" ? "todas" : "leads";
  const status = STATUS_KEYS.includes(sp.status ?? "") ? sp.status! : "";
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : "";
  const page = Math.max(1, Number(sp.p) || 1);

  let q = supabase.from("aurea_conversations")
    .select("id, created_at, updated_at, lang, turn_count, first_message, name, phone, email, pieces, wa_clicked, is_lead, status, notes", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PER, page * PER - 1);
  if (tipo === "leads") q = q.eq("is_lead", true);
  if (status) q = q.eq("status", status);
  if (mes) { const [a, b] = monthRange(mes); q = q.gte("created_at", a).lt("created_at", b); }

  // resumo: últimos 6 meses
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => monthKey(new Date(now.getFullYear(), now.getMonth() - i, 15).toISOString()));
  const [from] = monthRange(months[months.length - 1]);
  const [list, stats] = await Promise.all([
    q,
    supabase.from("aurea_conversations").select("created_at, is_lead, status, pieces").gte("created_at", from).limit(10000),
  ]);

  if (list.error) {
    return (
      <>
        <PageHeader title="Leads da Áurea" />
        <Notice kind="bad">
          A tabela de conversas ainda não existe no banco. Rode a migração <code>0008_aurea_leads.sql</code> no Supabase
          (SQL Editor → New query → colar → Run) e recarregue esta página.
        </Notice>
      </>
    );
  }

  const rows = (list.data ?? []) as LeadRow[];
  const total = list.count ?? 0;
  const all = (stats.data ?? []) as Pick<LeadRow, "created_at" | "is_lead" | "status" | "pieces">[];
  const byMonth = months.map((m) => {
    const r = all.filter((x) => monthKey(x.created_at) === m);
    const leads = r.filter((x) => x.is_lead);
    return { m, conversas: r.length, leads: leads.length, contato: leads.filter((x) => x.status === "em_contato").length, vendas: leads.filter((x) => x.status === "convertido").length, novos: leads.filter((x) => x.status === "novo").length };
  });
  const cur = byMonth[0];
  const pieceCount = new Map<string, number>();
  all.filter((x) => monthKey(x.created_at) === months[0]).forEach((x) => (x.pieces ?? []).forEach((p) => pieceCount.set(p, (pieceCount.get(p) ?? 0) + 1)));
  const topPieces = [...pieceCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const qs = (o: Partial<SP>) => {
    const p = new URLSearchParams();
    const v = { tipo, status, mes, ...o };
    if (v.tipo === "todas") p.set("tipo", "todas");
    if (v.status) p.set("status", v.status);
    if (v.mes) p.set("mes", v.mes);
    if (o.p && o.p !== "1") p.set("p", o.p);
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const back = `/admin/leads${qs({ p: String(page) })}`;
  const csv = `/admin/leads-csv${qs({})}`;

  return (
    <>
      <PageHeader title="Leads da Áurea"
        description="Conversas do site com a Áurea. Vira lead quando a pessoa deixa WhatsApp ou e-mail na conversa, ou clica para falar com a equipe.">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="adm-btn ghost" href={csv} download>Exportar planilha</a>
      </PageHeader>
      {sp.apagado && <div className="adm-alert ok" style={{ marginBottom: "1rem" }}>Conversa apagada.</div>}

      <div className="adm-grid c4">
        {[["Conversas no mês", cur.conversas], ["Leads no mês", cur.leads], ["Aguardando contato", cur.novos], ["Viraram venda", cur.vendas]].map(([l, n]) => (
          <div key={l as string} className="adm-card"><p className="adm-note">{l}</p><p className="adm-stat">{n as number}</p></div>
        ))}
      </div>

      <div className="adm-grid c2" style={{ marginTop: "1rem" }}>
        <Card title="Relatório mensal">
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead><tr><th>Mês</th><th>Conversas</th><th>Leads</th><th>Em contato</th><th>Vendas</th><th>Conversão</th></tr></thead>
              <tbody>{byMonth.map((r) => (
                <tr key={r.m}>
                  <td><Link href={`/admin/leads${qs({ mes: r.m, p: "1" })}`}>{monthLabel(r.m)}</Link></td>
                  <td>{r.conversas}</td><td>{r.leads}</td><td>{r.contato}</td><td>{r.vendas}</td>
                  <td>{r.leads ? `${Math.round((r.vendas / r.leads) * 100)}%` : "—"}</td>
                </tr>))}</tbody>
            </table>
          </div>
          <p className="adm-note" style={{ marginTop: ".6rem" }}>Conversão = leads que viraram venda ÷ leads do mês.</p>
        </Card>
        <Card title="Peças mais indicadas pela Áurea neste mês">
          {topPieces.length === 0 ? <p className="adm-note">Ainda sem indicações neste mês.</p> : (
            <ol style={{ display: "grid", gap: ".35rem", paddingLeft: "1.1rem" }}>
              {topPieces.map(([p, n]) => <li key={p}>{p} <span className="adm-note">· {n} conversa{n > 1 ? "s" : ""}</span></li>)}
            </ol>
          )}
        </Card>
      </div>

      <form className="adm-actions" style={{ marginTop: "1.25rem" }} method="get">
        <select name="tipo" defaultValue={tipo} aria-label="Mostrar">
          <option value="leads">Só leads</option><option value="todas">Todas as conversas</option>
        </select>
        <select name="status" defaultValue={status} aria-label="Status">
          <option value="">Todos os status</option>
          {STATUS_KEYS.map((k) => <option key={k} value={k}>{statusLabel(k)}</option>)}
        </select>
        <select name="mes" defaultValue={mes} aria-label="Mês">
          <option value="">Todos os meses</option>
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <button type="submit" className="adm-btn ghost">Filtrar</button>
      </form>

      <div className="adm-table-wrap" style={{ marginTop: ".75rem" }}>
        {rows.length === 0 ? (
          <Empty>{tipo === "leads" ? "Nenhum lead ainda. Assim que alguém deixar contato na conversa com a Áurea, aparece aqui." : "Nenhuma conversa ainda."}</Empty>
        ) : (
          <table className="adm-table">
            <thead><tr><th>Quando</th><th>Pessoa</th><th>Procurava</th><th>Peças indicadas</th><th>Status</th><th><span className="sr">Abrir</span></th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const wa = waLink(r.phone, `Olá${r.name ? `, ${r.name.split(" ")[0]}` : ""}! Aqui é da Casa Áurea, vi que você conversou com a Áurea no nosso site.`);
                return (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(r.created_at)}</td>
                    <td>
                      <b>{r.name ?? (r.is_lead ? "Sem nome" : "Visitante")}</b>
                      <div className="adm-note">
                        {wa ? <a href={wa} target="_blank" rel="noopener noreferrer">{r.phone}</a> : r.phone}
                        {r.email && <>{r.phone ? " · " : ""}<a href={`mailto:${r.email}`}>{r.email}</a></>}
                        {!r.phone && !r.email && (r.wa_clicked ? "Clicou para falar no WhatsApp" : "Sem contato")}
                      </div>
                    </td>
                    <td style={{ maxWidth: "22rem" }}>{r.first_message ?? "—"}</td>
                    <td style={{ maxWidth: "16rem" }} className="adm-note">{r.pieces.length ? r.pieces.slice(0, 3).join(", ") + (r.pieces.length > 3 ? ` +${r.pieces.length - 3}` : "") : "—"}</td>
                    <td>
                      <form action={setLeadStatus}>
                        <input type="hidden" name="back" value={back} />
                        <div className="adm-seg" role="group" aria-label={`Status de ${r.name ?? "visitante"}`}>
                          {(["novo", "em_contato", "convertido", "perdido"] as const).map((k) => (
                            <button key={k} type="submit" name="st" value={`${r.id}|${k}`} aria-pressed={r.status === k}>{LEAD_STATUS[k][0]}</button>
                          ))}
                        </div>
                      </form>
                    </td>
                    <td><Link className="adm-btn ghost sm" href={`/admin/leads/${r.id}`}>Abrir conversa</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="adm-pager">
        <span>{total} {tipo === "leads" ? "lead(s)" : "conversa(s)"}</span>
        {page > 1 && <Link className="adm-btn ghost sm" href={`/admin/leads${qs({ p: String(page - 1) })}`}>Anterior</Link>}
        {page * PER < total && <Link className="adm-btn ghost sm" href={`/admin/leads${qs({ p: String(page + 1) })}`}>Próxima</Link>}
      </div>
    </>
  );
}
