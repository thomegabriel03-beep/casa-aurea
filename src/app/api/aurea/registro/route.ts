import { unstable_cache } from "next/cache";
import { extractContact, suggestedSlugs, type Turn } from "@/lib/aurea/lead";
import { getSiteFeed } from "@/lib/catalog/site-feed";
import { publicClient } from "@/lib/supabase/public";

/* Registro das conversas da Áurea para a tela "Leads da Áurea" do painel.
   O site envia a conversa da aba (id gerado no navegador) a cada resposta e quando a pessoa
   clica para falar no WhatsApp. Gravação pela função aurea_log (o visitante não lê nada). */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
  let body: { id?: unknown; lang?: unknown; turns?: unknown; wa?: unknown };
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

  const { error } = await db.rpc("aurea_log", {
    p_id: id, p_lang: lang, p_turns: turns, p_wa: body.wa === true,
    p_first: c.first, p_name: c.name, p_phone: c.phone, p_email: c.email, p_pieces: pieces,
  });
  if (error) console.error("aurea: registro da conversa falhou", error.message);
  return ok();
}
