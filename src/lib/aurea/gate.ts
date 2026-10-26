/* Captação de contato da Áurea: regras puras (sem banco, sem rede), usadas pelas rotas
   /api/aurea e /api/aurea/contato e pelos testes.
   - 3 perguntas livres; a 4ª mensagem do visitante, ou qualquer foto, pede o contato;
   - o contato salvo gera um token = HMAC-SHA256(id da conversa) com um segredo do servidor;
   - com token, teto de 60 mensagens do visitante por conversa. */
import { createHmac, timingSafeEqual } from "node:crypto";

export const FREE_MESSAGES = 3;
export const LEAD_MAX_MESSAGES = 60;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const PROFILES = ["cliente", "arquiteto", "empresa"] as const;
export type Profile = (typeof PROFILES)[number];

/** segredo do token: AUREA_LEAD_SECRET, com reserva em chaves que já só existem no servidor */
export function leadSecret(env: Record<string, string | undefined> = process.env): string | null {
  return env.AUREA_LEAD_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || env.ANTHROPIC_API_KEY || null;
}

export function signLead(id: string, secret: string): string {
  return createHmac("sha256", secret).update(`aurea-lead:${id.toLowerCase()}`).digest("base64url");
}

export function verifyLead(id: unknown, token: unknown, secret: string | null): boolean {
  if (!secret || typeof id !== "string" || typeof token !== "string" || !UUID.test(id) || token.length > 100) return false;
  const a = Buffer.from(signLead(id, secret));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type Gate = "ok" | "contato" | "teto";

/** decide se a mensagem segue para a IA: sem contato, só 3 mensagens e nenhuma foto */
export function gate(o: { userMessages: number; hasImage: boolean; lead: boolean }): Gate {
  if (o.lead) return o.userMessages > LEAD_MAX_MESSAGES ? "teto" : "ok";
  return o.hasImage || o.userMessages > FREE_MESSAGES ? "contato" : "ok";
}

/* ---------- validação do cartão de contato ---------- */

/** uma linha de texto: sem caracteres de controle nem < >, espaços simples, tamanho máximo */
const oneLine = (v: unknown, max: number) =>
  typeof v === "string"
    ? Array.from(v, (ch) => { const c = ch.charCodeAt(0); return c < 32 || c === 127 || ch === "<" || ch === ">" ? " " : ch; })
        .join("").replace(/\s+/g, " ").trim().slice(0, max)
    : "";

/** WhatsApp: Brasil vira "(48) 99999-9999"; estrangeiro com DDI vira "+351 912345678" */
export function normalizePhone(v: unknown): string | null {
  const raw = oneLine(v, 40);
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  const intl = raw.startsWith("+");
  if (intl && !d.startsWith("55")) return d.length >= 8 && d.length <= 15 ? `+${d}` : null;
  const br = intl || (d.startsWith("55") && d.length >= 12) ? d.slice(2) : d;
  if (br.length !== 10 && br.length !== 11) return null;
  if (!/^[1-9][0-9]/.test(br) || (br.length === 11 && br[2] !== "9")) return null;
  return br.length === 11 ? `(${br.slice(0, 2)}) ${br.slice(2, 7)}-${br.slice(7)}` : `(${br.slice(0, 2)}) ${br.slice(2, 6)}-${br.slice(6)}`;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type Contact = {
  name: string; phone: string; email: string | null; city: string | null; profile: Profile | null;
};

export function validateContact(b: Record<string, unknown>): { ok: true; contact: Contact } | { ok: false; field: string } {
  const name = oneLine(b.name, 80);
  if (name.replace(/[^\p{L}]/gu, "").length < 2) return { ok: false, field: "name" };
  const phone = normalizePhone(b.phone);
  if (!phone) return { ok: false, field: "phone" };
  const emailRaw = oneLine(b.email, 120).toLowerCase();
  if (emailRaw && !EMAIL.test(emailRaw)) return { ok: false, field: "email" };
  const city = oneLine(b.city, 80) || null;
  const profile = PROFILES.includes(b.profile as Profile) ? (b.profile as Profile) : null;
  return { ok: true, contact: { name, phone, email: emailRaw || null, city, profile } };
}

/** origem da visita (capturada no primeiro acesso): só chaves conhecidas, textos curtos */
const SOURCE_KEYS = ["utm_source", "utm_medium", "utm_campaign", "referrer", "landing", "device", "first_at"] as const;
export function cleanSource(v: unknown): Record<string, string> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Record<string, string> = {};
  for (const k of SOURCE_KEYS) {
    const s = oneLine((v as Record<string, unknown>)[k], k === "referrer" || k === "landing" ? 300 : 120);
    if (s) out[k] = s;
  }
  if (out.device && out.device !== "mobile" && out.device !== "desktop") delete out.device;
  return Object.keys(out).length ? out : null;
}

/** primeiro nome para a Áurea (só letras, hífen e apóstrofo) */
export function firstName(v: unknown): string | null {
  const n = oneLine(v, 40).split(" ")[0]?.replace(/[^\p{L}'’-]/gu, "") ?? "";
  return n.length >= 2 ? n : null;
}
