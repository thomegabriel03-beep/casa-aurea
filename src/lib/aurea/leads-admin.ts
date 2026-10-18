/* Rótulos e utilidades da tela "Leads da Áurea" (painel). */

export const LEAD_STATUS: Record<string, [string, string]> = {
  novo: ["Novo", "gold"],
  em_contato: ["Em contato", "warn"],
  convertido: ["Virou venda", "ok"],
  perdido: ["Perdido", "bad"],
  descartado: ["Descartado", ""],
};
export const STATUS_KEYS = Object.keys(LEAD_STATUS);
export const statusLabel = (s: string) => LEAD_STATUS[s]?.[0] ?? s;

export const LANG_LABEL: Record<string, string> = { pt: "Português", en: "Inglês", es: "Espanhol" };

export type LeadRow = {
  id: string; created_at: string; updated_at: string; lang: string; turn_count: number;
  first_message: string | null; name: string | null; phone: string | null; email: string | null;
  pieces: string[]; wa_clicked: boolean; is_lead: boolean; status: string; notes: string | null;
};

/** link do WhatsApp para o número que a pessoa deixou (Brasil: acrescenta 55) */
export function waLink(phone: string | null, text?: string): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  const n = d.length <= 11 ? `55${d}` : d;
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** mês no fuso de São Paulo, ex.: "2026-10" */
export function monthKey(iso: string): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(new Date(iso));
  return `${p.find((x) => x.type === "year")!.value}-${p.find((x) => x.type === "month")!.value}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const s = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** início e fim (exclusivo) de um mês em São Paulo, em ISO */
export function monthRange(key: string): [string, string] {
  const [y, m] = key.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 3)); // 00:00 em São Paulo (UTC-3)
  const end = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1, 3));
  return [start.toISOString(), end.toISOString()];
}

/** CSV que abre certo no Excel (BOM + ponto e vírgula) */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
}
