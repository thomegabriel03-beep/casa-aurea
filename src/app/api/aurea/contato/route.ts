import { UUID, cleanSource, leadSecret, signLead, validateContact } from "@/lib/aurea/gate";
import { publicClient } from "@/lib/supabase/public";

/* Cartão de contato da Áurea: nome, WhatsApp, e-mail, cidade, perfil e consentimento.
   Grava pela função aurea_contact (o visitante não lê nada) e devolve o token que libera
   a conversa: HMAC-SHA256 do id da conversa com um segredo que só existe no servidor. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 8;
const hits = new Map<string, { n: number; t: number }>();
function limited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > WINDOW_MS) {
    if (hits.size > 5000) hits.clear();
    hits.set(ip, { n: 1, t: now });
    return false;
  }
  h.n += 1;
  return h.n > MAX_PER_WINDOW;
}

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
  if (limited(ip)) return Response.json({ error: "limite" }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 8000) return Response.json({ error: "invalido" }, { status: 400 });
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "invalido" }, { status: 400 });
  }
  const id = typeof body.id === "string" && UUID.test(body.id) ? body.id.toLowerCase() : null;
  if (!id || body.consent !== true) return Response.json({ error: "invalido" }, { status: 400 });
  const v = validateContact(body);
  if (!v.ok) return Response.json({ error: "campo", field: v.field }, { status: 422 });
  const secret = leadSecret();
  const db = publicClient();
  if (!secret || !db) return Response.json({ error: "indisponivel" }, { status: 503 });

  const c = v.contact;
  const lang = body.lang === "en" || body.lang === "es" ? body.lang : "pt";
  const { data, error } = await db.rpc("aurea_contact", {
    p_id: id, p_lang: lang, p_name: c.name, p_phone: c.phone, p_email: c.email,
    p_city: c.city, p_profile: c.profile, p_source: cleanSource(body.source),
  });
  if (error || data === false) {
    console.error("aurea: contato não gravado por aurea_contact", error?.message ?? "recusado pelo banco");
    // migração 0010 ainda não aplicada: guarda ao menos nome, WhatsApp e e-mail pela função antiga
    const first = `[contato] ${c.name} · ${c.phone}${c.city ? ` · ${c.city}` : ""}${c.profile ? ` · ${c.profile}` : ""}`;
    const old = await db.rpc("aurea_log", {
      p_id: id, p_lang: lang, p_turns: [{ role: "user", content: first }], p_wa: false,
      p_first: null, p_name: c.name, p_phone: c.phone, p_email: c.email, p_pieces: [],
    });
    if (old.error) {
      console.error("aurea: contato não gravado", old.error.message);
      return Response.json({ error: "indisponivel" }, { status: 503 });
    }
  }
  return Response.json({ token: signLead(id, secret) });
}
