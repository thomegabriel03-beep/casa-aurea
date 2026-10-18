/* Leitura do que importa para a equipe numa conversa com a Áurea: nome, WhatsApp/telefone,
   e-mail e as peças indicadas. Só olha as mensagens do visitante (contato) e os marcadores
   [[slug]] das respostas (peças). Sem IA: regras simples e previsíveis. */

export type Turn = { role: "user" | "assistant"; content: string };

const PHONE = /(?:\+?55[\s.-]?)?\(?\b([1-9]{2})\)?[\s.-]?(9?\d{4})[\s.-]?(\d{4})\b/;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const NAME = /\b(?:meu nome (?:é|e)|me chamo|aqui (?:é|e) (?:o|a)|my name is|i'?m called|me llamo|mi nombre es)\s+([A-Za-zÀ-ÿ]+(?:\s+(?!e\b|and\b|y\b)[A-Za-zÀ-ÿ]{2,})?)/i;

const title = (s: string) => s.toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());

export function extractContact(turns: Turn[]) {
  const said = turns.filter((t) => t.role === "user").map((t) => t.content);
  let phone: string | null = null, email: string | null = null, name: string | null = null;
  for (const s of said) {
    if (!email) { const m = s.match(EMAIL); if (m) email = m[0].toLowerCase(); }
    if (!phone) {
      const m = s.replace(EMAIL, " ").match(PHONE);
      if (m) phone = `(${m[1]}) ${m[2]}-${m[3]}`;
    }
    if (!name) { const m = s.match(NAME); if (m) name = title(m[1].trim()); }
  }
  return { phone, email, name, first: said[0]?.slice(0, 500) ?? null };
}

/** slugs das peças indicadas pela Áurea (marcadores [[slug]], sem [[wa]] e [[go:…]]) */
export function suggestedSlugs(turns: Turn[]): string[] {
  const out = new Set<string>();
  for (const t of turns) {
    if (t.role !== "assistant") continue;
    for (const m of t.content.matchAll(/\[\[([a-z0-9-]+)\]\]/g)) if (m[1] !== "wa") out.add(m[1]);
  }
  return [...out];
}
