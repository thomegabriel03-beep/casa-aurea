import { unstable_cache } from "next/cache";
import { extractContact, suggestedSlugs, type Turn } from "@/lib/aurea/lead";
import { getSiteFeed } from "@/lib/catalog/site-feed";
import { publicClient } from "@/lib/supabase/public";
import { UUID, cleanSource, leadSecret, verifyLead } from "@/lib/aurea/gate";

/* Registro das conversas da Áurea para a tela "Leads da Áurea" do painel.
   O site envia a conversa da aba (id gerado no navegador) a cada resposta e quando a pessoa
   clica para falar no WhatsApp. Gravação pela função aurea_log (o visitante não lê nada).
   Também leva a origem da visita (UTM, referência, página de entrada, dispositivo), quantas mensagens
   a pessoa escreveu e, para quem já deixou contato numa visita anterior, a ligação com aquele contato
   (só com token válido). */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 80;
const hits = new Map<string, { n: number; t: number }>();
function limited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > WINDOW_MS) { hits.set(ip, { n: 1, t: now }); return false; }
  h.n += 1;
  return h.n > MAX_PER_WINDOW;
}

/* nome e código de cada peça do site, para a equipe ler "Sofá Amber · CA-SOF-0003" em vez do endereço */
const pieceNames = unstable_cache(
  async () => Object.fromEntries((await getSiteFeed()).items.map((p) => [p.sl, `${p.n} · ${p.c}`])),
  ["aurea-piece-names"],
  { revalidate: 300 },
);

const ok = () => new Response(null, { status: 204 });

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
  if (limited(ip)) return ok();
  let body: { id?: unknown; lang?: unknown; turns?: unknown; wa?: unknown; source?: unknown; n?: unknown; lead?: { id?: unknown; t?: unknown } };
  try {
    const raw = await req.text();
    if (raw.length > 250_000) return ok();
    body = JSON.parse(raw);
  } catch {
    return ok();
  }
  const id = typeof body.id === "string" && UUID.test(body.id) ? body.id : null;
  if (!id || !Array.isArray(body.turns)) return ok();
  const turns: Turn[] = body.turns
    .slice(-60)
    .filter((t): t is Turn => !!t && typeof t === "object" && ((t as Turn).role === "user" || (t as Turn).role === "assistant") && typeof (t as Turn).content === "string")
    .map((t) => ({ role: t.role, content: t.content.slice(0, 4000) }));
  if (!turns.some((t) => t.role === "user")) return ok();

  const db = publicClient();
  if (!db) return ok();
  const c = extractContact(turns);
  let names: Record<string, string> = {};
  try { names = await pieceNames(); } catch { /* sem nomes: fica o endereço da peça */ }
  const pieces = suggestedSlugs(turns).map((s) => names[s] ?? s).slice(0, 20);
  const lang = body.lang === "en" || body.lang === "es" ? body.lang : "pt";

  const base = {
    p_id: id, p_lang: lang, p_turns: turns, p_wa: body.wa === true,
    p_first: c.first, p_name: c.name, p_phone: c.phone, p_email: c.email, p_pieces: pieces,
  };
  const lead = verifyLead(body.lead?.id, body.lead?.t, leadSecret()) ? String(body.lead?.id).toLowerCase() : null;
  const userCount = Math.max(turns.filter((t) => t.role === "user").length, Math.min(10_000, Math.floor(Number(body.n) || 0)));
  let { error } = await db.rpc("aurea_log", { ...base, p_source: cleanSource(body.source), p_lead: lead, p_user_count: userCount });
  // migração 0010 ainda não aplicada: grava pela assinatura antiga
  if (error && /aurea_log|function|PGRST202/i.test(`${error.code} ${error.message}`)) ({ error } = await db.rpc("aurea_log", base));
  if (error) console.error("aurea: registro da conversa falhou", error.message);
  return ok();
}
