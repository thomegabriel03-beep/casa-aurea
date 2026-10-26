import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/admin-guard";
import { Card, Field, PageHeader } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import {
  LANG_LABEL, STATUS_KEYS, deviceLabel, fmtDateTime, profileLabel, sourceLabel, statusLabel, waLink, type LeadRow,
} from "@/lib/aurea/leads-admin";
import { deleteLead, saveLead } from "../actions";

export const dynamic = "force-dynamic";

type Turn = { role: "user" | "assistant"; content: string };

/* resposta da Áurea sem os marcadores técnicos ([[slug]], [[wa]], [[go:…]]) */
const clean = (t: string) => t.replace(/\[\[[^\]]*\]\]/g, "").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/[ \t]{2,}/g, " ").trim();

export default async function Lead({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ salvo?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("aurea_conversations").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const r = data as LeadRow & { turns: Turn[] };
  const wa = waLink(r.phone, `Olá${r.name ? `, ${r.name.split(" ")[0]}` : ""}! Aqui é da Casa Áurea, vi que você conversou com a Áurea no nosso site.`);

  return (
    <>
      <PageHeader title={r.name ?? (r.is_lead ? "Lead sem nome" : "Conversa de visitante")}
        description={`${fmtDateTime(r.created_at)} · ${LANG_LABEL[r.lang] ?? r.lang} · ${r.user_count ?? 0} mensagens do visitante (${r.turn_count} no total)${r.profile ? ` · ${profileLabel(r.profile)}` : ""}`}>
        <Link className="adm-btn ghost" href="/admin/leads">← Voltar aos leads</Link>
        {wa && <a className="adm-btn" href={wa} target="_blank" rel="noopener noreferrer">Chamar no WhatsApp</a>}
      </PageHeader>
      {sp.salvo && <div className="adm-alert ok" style={{ marginBottom: "1rem" }}>Salvo.</div>}

      <div className="adm-grid c2">
        <Card title="Contato e acompanhamento">
          <dl className="apr-specs" style={{ marginTop: 0 }}>
            <div><dt>WhatsApp</dt><dd>{r.phone ? (wa ? <a href={wa} target="_blank" rel="noopener noreferrer">{r.phone}</a> : r.phone) : "—"}</dd></div>
            <div><dt>E-mail</dt><dd>{r.email ? <a href={`mailto:${r.email}`}>{r.email}</a> : "—"}</dd></div>
            <div><dt>Cidade</dt><dd>{r.city ?? "—"}</dd></div>
            <div><dt>Perfil</dt><dd>{r.profile ? <span className={`adm-badge${r.profile === "arquiteto" ? " gold" : ""}`}>{profileLabel(r.profile)}</span> : "—"}</dd></div>
            <div><dt>Consentimento</dt><dd>{r.consent_at ? `Aceito em ${fmtDateTime(r.consent_at)} (cartão de contato da Áurea)` : "—"}</dd></div>
            <div><dt>Procurava</dt><dd>{r.first_message ?? "—"}</dd></div>
            <div><dt>Peças indicadas</dt><dd>{r.pieces.length ? r.pieces.join(", ") : "—"}</dd></div>
            <div><dt>WhatsApp da loja</dt><dd>{r.wa_clicked ? "Clicou para falar com a equipe" : "Não clicou"}</dd></div>
            <div><dt>Origem da visita</dt><dd>{sourceLabel(r.source)}{deviceLabel(r.source) && ` · ${deviceLabel(r.source)}`}</dd></div>
            {r.source?.utm_campaign && <div><dt>Campanha</dt><dd>{[r.source.utm_source, r.source.utm_medium, r.source.utm_campaign].filter(Boolean).join(" · ")}</dd></div>}
            {r.source?.referrer && <div><dt>Veio de</dt><dd style={{ wordBreak: "break-all" }}>{r.source.referrer}</dd></div>}
            {r.source?.landing && <div><dt>Página de entrada</dt><dd style={{ wordBreak: "break-all" }}>{r.source.landing}</dd></div>}
          </dl>
          <form action={saveLead.bind(null, r.id)} style={{ display: "grid", gap: ".8rem", marginTop: "1rem" }}>
            <Field label="Status">
              <select name="status" defaultValue={r.status}>
                {STATUS_KEYS.map((k) => <option key={k} value={k}>{statusLabel(k)}</option>)}
              </select>
            </Field>
            <Field label="Anotações da equipe" hint="Só a equipe vê. Ex.: orçamento enviado, visita marcada para sábado.">
              <textarea name="notes" rows={4} defaultValue={r.notes ?? ""} />
            </Field>
            <div className="adm-actions" style={{ marginTop: 0 }}>
              <SubmitButton>Salvar</SubmitButton>
            </div>
          </form>
          <form action={deleteLead.bind(null, r.id)} className="adm-actions">
            <SubmitButton variant="danger" size="sm" confirm="Apagar esta conversa de vez? Use quando a pessoa pedir (LGPD) ou para spam.">Apagar conversa</SubmitButton>
          </form>
        </Card>

        <Card title="Conversa">
          <div className="lead-log">
            {(r.turns ?? []).map((t, i) => (
              <div key={i} className={`lead-m ${t.role === "user" ? "u" : "a"}`}>
                <span>{t.role === "user" ? (r.name?.split(" ")[0] ?? "Visitante") : "Áurea"}</span>
                <p>{t.role === "user" ? t.content : clean(t.content)}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
