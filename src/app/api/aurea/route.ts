import { unstable_cache } from "next/cache";
import { AUREA_KB } from "@/lib/aurea-kb";
import { aureaLines, getSiteFeed } from "@/lib/catalog/site-feed";
import { aureaSystemPrompt } from "@/lib/aurea/prompt";
import { firstName, gate, leadSecret, verifyLead } from "@/lib/aurea/gate";
import { MAX_STRIKES, STRIKE_WINDOW_MS, blockedReason, refusal, stripFora } from "@/lib/aurea/escopo";

/* Áurea — concierge de IA da Casa Áurea.
   O navegador envia só a conversa; o conhecimento do site e a chave ficam no servidor.
   Sem ANTHROPIC_API_KEY (ou com erro), responde 503 e o site usa o motor local de respostas.
   Captação de contato (regra do servidor, não só do navegador): sem token de lead, só 3 mensagens do
   visitante e nenhuma foto (403 {error:"contato"}: o site mostra o cartão de contato); com token,
   até 60 mensagens por conversa (429 {error:"teto"}). */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.AUREA_MODEL || "claude-haiku-4-5-20251001";
const MAX_TURNS = 16;
const MAX_CHARS = 2000;
const MAX_IMAGES = 2; // fotos do ambiente reenviadas na conversa (as mais recentes)
const MAX_IMAGE_CHARS = 1_600_000; // ~1,2 MB de imagem (o navegador já reduz para 1280 px)
const IMAGE_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 30;

// sem contato: freio extra por IP (quem abre conversas novas para não deixar contato)
const FREE_WINDOW_MS = 60 * 60 * 1000;
const FREE_PER_WINDOW = 15;

const hits = new Map<string, { n: number; t: number }>();
const freeHits = new Map<string, { n: number; t: number }>();
function bump(map: Map<string, { n: number; t: number }>, ip: string, windowMs: number, max: number): boolean {
  const now = Date.now();
  const h = map.get(ip);
  if (!h || now - h.t > windowMs) {
    if (map.size > 5000) map.clear();
    map.set(ip, { n: 1, t: now });
    return false;
  }
  h.n += 1;
  return h.n > max;
}
const limited = (ip: string) => bump(hits, ip, WINDOW_MS, MAX_PER_WINDOW);

// travas de assunto: recusas por visitante (IP) na última hora
const strikes = new Map<string, { n: number; t: number }>();
function struck(ip: string): boolean {
  const h = strikes.get(ip);
  return !!h && Date.now() - h.t <= STRIKE_WINDOW_MS && h.n >= MAX_STRIKES;
}
const strike = (ip: string) => { bump(strikes, ip, STRIKE_WINDOW_MS, MAX_STRIKES); };

/* peças publicadas no painel: a Áurea também as conhece (lista atualizada a cada 5 minutos) */
const dbPieces = unstable_cache(
  async () => {
    const f = await getSiteFeed();
    return { lines: aureaLines(f.items), linked: f.linked };
  },
  ["aurea-db-pieces"],
  { revalidate: 300 },
);
// prompt sem a lista fixa de peças da seleção de lançamento (usada quando ela já vem do banco)
const KB_NO_LAUNCH = AUREA_KB.split("\n").filter((l) => !/^- \[\[[a-z0-9-]+-ca-[a-z]{3}-\d{4}\]\]/.test(l)).join("\n");

type Img = { media_type: string; data: string };
type Turn = { role: "user" | "assistant"; content: string; image?: Img };

function parseImage(v: unknown): Img | undefined {
  if (typeof v !== "string" || v.length > MAX_IMAGE_CHARS) return undefined;
  const m = v.match(IMAGE_URL);
  return m ? { media_type: m[1], data: m[2] } : undefined;
}

function clean(input: unknown): Turn[] | null {
  if (!Array.isArray(input)) return null;
  const turns: Turn[] = [];
  for (const m of input.slice(-MAX_TURNS)) {
    if (!m || typeof m !== "object") return null;
    const role = (m as { role?: unknown }).role;
    const content = (m as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
    const image = role === "user" ? parseImage((m as { image?: unknown }).image) : undefined;
    const text = content.trim().slice(0, MAX_CHARS) || (image ? "Esta é uma foto do meu ambiente." : "");
    if (!text) continue;
    const last = turns[turns.length - 1];
    if (last && last.role === role) {
      last.content += "\n" + text;
      if (image) last.image = image;
    } else turns.push({ role, content: text, ...(image ? { image } : {}) });
  }
  while (turns.length && turns[0].role !== "user") turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== "user") return null;
  // só as fotos mais recentes seguem como imagem; as antigas viram uma anotação no texto
  let kept = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    if (!turns[i].image) continue;
    if (kept < MAX_IMAGES) kept++;
    else { delete turns[i].image; turns[i].content = "[foto do ambiente enviada antes]\n" + turns[i].content; }
  }
  return turns;
}

/* formato da Claude API: a foto vai antes do texto da mesma mensagem */
const toApi = (t: Turn) =>
  t.image
    ? { role: t.role, content: [{ type: "image", source: { type: "base64", media_type: t.image.media_type, data: t.image.data } }, { type: "text", text: t.content }] }
    : { role: t.role, content: t.content };

const PROFILE_TXT: Record<string, string> = {
  cliente: "cliente final",
  arquiteto: "arquiteto(a) ou designer de interiores (profissional que especifica peças para projetos)",
  empresa: "empresa ou construtora",
};

type Body = { lang?: unknown; messages?: unknown; n?: unknown; lead?: { id?: unknown; t?: unknown }; who?: { name?: unknown; profile?: unknown } };

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
  if (limited(ip)) return Response.json({ error: "limite" }, { status: 429 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "invalido" }, { status: 400 });
  }
  const raw = Array.isArray(body?.messages) ? (body.messages as { role?: unknown; image?: unknown }[]) : [];
  // contagem antes de qualquer corte: o navegador envia só as últimas mensagens e informa o total
  const sentUser = raw.filter((m) => m && m.role === "user").length;
  const userMessages = Math.max(sentUser, Math.min(10_000, Math.floor(Number(body?.n) || 0)));
  const hasImage = raw.some((m) => m && m.role === "user" && typeof m.image === "string" && m.image.length > 0);
  const lead = verifyLead(body?.lead?.id, body?.lead?.t, leadSecret());
  const g = gate({ userMessages, hasImage, lead });
  if (g === "contato") return Response.json({ error: "contato" }, { status: 403 });
  if (g === "teto") return Response.json({ error: "teto" }, { status: 429 });
  if (!lead && bump(freeHits, ip, FREE_WINDOW_MS, FREE_PER_WINDOW)) return Response.json({ error: "contato" }, { status: 403 });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: "indisponivel" }, { status: 503 });

  const turns = clean(body?.messages);
  if (!turns) return Response.json({ error: "invalido" }, { status: 400 });

  // travas de assunto: quem insiste em usar a Áurea para outra coisa deixa de usar a IA por uma hora
  if (struck(ip)) return Response.json({ error: "escopo" }, { status: 429 });
  const last = [...turns].reverse().find((t) => t.role === "user");
  if (last && blockedReason(last.content)) {
    strike(ip);
    return Response.json({ text: refusal(body?.lang) });
  }

  let db = { lines: "", linked: false };
  try {
    db = await dbPieces();
  } catch {
    // sem o banco, a Áurea segue com a lista fixa do site aprovado
  }
  const system: { type: "text"; text: string; cache_control?: { type: "ephemeral" } }[] = [
    { type: "text", text: aureaSystemPrompt(db.linked ? KB_NO_LAUNCH : AUREA_KB), cache_control: { type: "ephemeral" } },
  ];
  if (db.lines)
    system.push({
      type: "text",
      cache_control: { type: "ephemeral" }, // lista grande de peças: lida do cache entre mensagens
      text: (db.linked ? "# PEÇAS PUBLICADAS NO SITE (continuação da lista acima; mesmas regras)\n" : "# MAIS PEÇAS DO SITE (publicadas pela equipe; mesmas regras da lista acima)\n") + db.lines,
    });
  // quem já deixou contato: primeiro nome e perfil (sem cache: muda por visitante)
  if (lead) {
    const nm = firstName(body?.who?.name);
    const pf = PROFILE_TXT[String(body?.who?.profile ?? "")];
    const bits = [nm && `Primeiro nome: ${nm}.`, pf && `Perfil: ${pf}.`].filter(Boolean);
    system.push({
      type: "text",
      text: `# VISITANTE\nO visitante já deixou nome e WhatsApp para a equipe (não peça o contato de novo). ${bits.join(" ")}`.trim(),
    });
  }

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        system,
        messages: turns.map(toApi),
      }),
    });
    if (!r.ok) return Response.json({ error: "ia" }, { status: 503 });
    const data = (await r.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content || [])
      .filter((c) => c.type === "text")
      .map((c) => c.text || "")
      .join("")
      .trim();
    if (!text) return Response.json({ error: "vazio" }, { status: 503 });
    const out = stripFora(text);
    if (out.fora) strike(ip);
    if (!out.text) return Response.json({ text: refusal(body?.lang) });
    return Response.json({ text: out.text });
  } catch {
    return Response.json({ error: "ia" }, { status: 503 });
  }
}
