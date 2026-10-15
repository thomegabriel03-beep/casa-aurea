import "server-only";
import { publicClient } from "@/lib/supabase/public";

/* Peças do banco para o site público (a experiência aprovada em public/site/index.html).
   Lê SOMENTE as views public_* — que já deixam de fora peças internas e campos privados
   (fornecedor, catálogo, código original, notas, custos). O formato é o mesmo da seleção
   de lançamento embutida na página, para o visual e o comportamento ficarem idênticos. */

export type SiteItem = {
  k: string; // chave estável (id da peça)
  c: string; // código Casa Áurea
  sl: string; // endereço da peça no site
  n: string;
  t: string; // código do tipo
  tn: string; // nome do tipo
  tp: string; // plural do tipo
  sec: string; // seção (moveis, decoracao, natal)
  st: string | null; // subtipo
  env: "indoor" | "outdoor";
  slot: string;
  sig: boolean;
  acv: boolean;
  v: [string, number | null, number | null, number | null, number | null][];
  mt: string[];
  fn: string[];
  ds: string | null;
  s: { pt: string } | null;
  imgs: string[];
  tg: string;
  bg: null;
};

type Row = Record<string, unknown>;

export const norm = (s: unknown) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
export const slugify = (s: unknown) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* mesmo formato de medida do site e da ficha: L × P × A cm */
const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
function dimLabel(w: number | null, d: number | null, h: number | null, di: number | null) {
  const parts = [w != null && `L ${fmt(w)}`, d != null && `P ${fmt(d)}`, h != null && `A ${fmt(h)}`, di != null && `Ø ${fmt(di)}`].filter(Boolean);
  return parts.length ? `${parts.join(" × ")} cm` : "";
}

/* grupo da peça na vitrine (o mesmo rótulo usado na seleção de lançamento) */
function slotOf(type: string, sub: string | null, env: string): string {
  if (env === "outdoor") return "Área externa";
  if (type === "SOF") return "Sala · Sofás";
  if (type === "POL") return "Sala · Poltronas";
  if (type === "PUF") return "Sala · Puffs";
  if (["APA", "BUF", "RAC", "GAV", "CRI", "EST"].includes(type)) return "Sala · Aparadores, buffets e racks";
  if (type === "MES") return /centro|lateral|apoio|sofa/i.test(sub ?? "") ? "Sala · Mesas de centro e laterais" : "Jantar · Mesas";
  if (type === "CAD") return "Jantar · Cadeiras";
  if (type === "BAQ") return "Jantar · Banquetas";
  return "Peças";
}

/* palavras-chave que alimentam os filtros do acervo, a busca por descrição e a Áurea */
const MAT_FAMILY: [string, RegExp][] = [
  ["madeira", /madeira|nogueira|carvalho|cinamomo|eucalipto|imbuia|freij|teca|jequitiba|tauari|pinus|laminad|lamina|mdf|ebaniz/],
  ["metal", /metal|aluminio|\baco\b|ferro|inox|latao|cromad|bronze/],
  ["couro", /couro/],
  ["tecido", /tecido|linho|veludo|boucle|sarja|algodao|chenille|suede|tela/],
  ["boucle", /boucle/],
  ["veludo", /veludo/],
  ["corda", /corda|nautic/],
  ["palhinha", /palhinha|rattan|vime|junco|fibra/],
  ["marmore", /marmore|travertino/],
  ["pedra", /pedra|granito|quartzo/],
  ["concreto", /concreto|cimento/],
  ["vidro", /vidro|cristal/],
];
const COLORS: [string, RegExp][] = [
  ["off-white", /off.?white|branc|\bcru\b|marfim|gelo/],
  ["bege", /bege|areia|nude|creme|fendi|linho/],
  ["cinza", /cinza|grafite|chumbo/],
  ["verde", /verde|oliva|musgo/],
  ["azul", /azul|marinho/],
  ["caramelo", /caramelo|conhaque|whisky|mel\b/],
  ["marrom", /marrom|castanho|tabaco|imbuia|nogueira|chocolate|cafe/],
  ["preto", /preto|negro|ebaniz/],
];

function tagsOf(p: Row, typeName: string, sub: string | null, mats: string[], fins: string[]): string {
  const t = new Set<string>();
  const add = (x: string) => { const s = slugify(x); if (s) t.add(s); };
  add(typeName);
  if (sub) add(`${typeName} ${sub}`);
  if (p.environment === "outdoor") t.add("area-externa");
  const matText = norm(mats.join(" "));
  mats.forEach(add);
  MAT_FAMILY.forEach(([k, re]) => { if (re.test(matText)) t.add(k); });
  const colorText = norm([fins.join(" "), p.name, p.short_description].join(" "));
  fins.forEach(add);
  COLORS.forEach(([k, re]) => { if (re.test(colorText)) t.add(k); });
  return [...t].join(" ");
}

/* lê uma view pública inteira, em páginas (o banco entrega no máximo 1000 linhas por vez) */
async function all(view: string, cols: string, order: string[]): Promise<Row[]> {
  const db = publicClient();
  if (!db) return [];
  const out: Row[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    let q = db.from(view).select(cols).range(from, from + 999);
    order.forEach((o) => { q = q.order(o); });
    const { data, error } = await q;
    if (error) throw error;
    out.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function getSiteItems(): Promise<SiteItem[]> {
  if (!publicClient()) return [];
  const [prods, media, variants, mats, fins] = await Promise.all([
    all("public_products", "id, public_code, name, short_description, description, type_code, type_name, type_plural, type_section, subtype_name, environment, curation_tier, designer, sort_order, updated_at", ["id"]),
    all("public_product_media", "product_id, type, url, sort_order, is_primary", ["product_id", "url"]),
    all("public_product_variants", "product_id, name, width_cm, depth_cm, height_cm, diameter_cm, sort_order", ["product_id", "sort_order", "name", "width_cm"]),
    all("public_product_materials", "product_id, name, is_primary", ["product_id", "name"]),
    all("public_product_finishes", "product_id, name", ["product_id", "name"]),
  ]);

  const group = (rows: Row[]) => {
    const m = new Map<string, Row[]>();
    rows.forEach((r) => { const k = r.product_id as string; (m.get(k) ?? m.set(k, []).get(k)!).push(r); });
    return m;
  };
  const gm = group(media), gv = group(variants), gmt = group(mats), gf = group(fins);

  return prods
    .filter((p) => p.public_code && p.type_code && p.name)
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(b.updated_at).localeCompare(String(a.updated_at)))
    .map((p): SiteItem | null => {
      const id = p.id as string;
      const imgs = (gm.get(id) ?? [])
        .filter((m) => m.type !== "video" && m.url)
        .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
        .map((m) => m.url as string);
      if (!imgs.length) return null; // sem foto a peça não aparece no site
      const typeCode = p.type_code as string, typeName = (p.type_name as string) || typeCode;
      const sub = (p.subtype_name as string) || null;
      const code = p.public_code as string, name = p.name as string;
      const mt = (gmt.get(id) ?? []).sort((a, b) => Number(b.is_primary) - Number(a.is_primary)).map((r) => r.name as string);
      const fn = (gf.get(id) ?? []).map((r) => r.name as string);
      const v = (gv.get(id) ?? [])
        .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
        .map((r): SiteItem["v"][number] => {
          const w = num(r.width_cm), d = num(r.depth_cm), h = num(r.height_cm), di = num(r.diameter_cm);
          const dl = dimLabel(w, d, h, di), vn = (r.name as string) || "";
          const label = dl && norm(vn).includes(norm(dl)) ? vn : [vn && vn !== dl ? vn : null, dl].filter(Boolean).join(" · ");
          return [label, w, d, h, di];
        })
        .filter((x) => x[0]);
      const text = ((p.short_description as string) || (p.description as string) || "").trim();
      const env = p.environment === "outdoor" ? "outdoor" : "indoor";
      return {
        k: id, c: code, sl: slugify(`${name} ${code}`), n: name,
        t: typeCode, tn: typeName, tp: (p.type_plural as string) || typeName, sec: (p.type_section as string) || "moveis",
        st: sub, env, slot: slotOf(typeCode, sub, env),
        sig: p.curation_tier === "signature", acv: p.curation_tier === "archive",
        v, mt, fn, ds: (p.designer as string) || null,
        s: text ? { pt: text } : null,
        imgs, tg: tagsOf(p, typeName, sub, mt, fn), bg: null,
      };
    })
    .filter((x): x is SiteItem => x !== null);
}

/* linhas da Áurea para as peças do banco (mesmo formato da lista de peças do prompt) */
export function aureaLines(items: SiteItem[]): string {
  return items.map((p) => [
    `- [[${p.sl}]] ${p.n}`,
    p.tn + (p.st ? ` · ${p.st}` : ""),
    p.env === "outdoor" ? "área externa" : "interno",
    p.acv ? "acervo" : "vitrine",
    p.tg.split(" ").join(", "),
    p.v[0]?.[0] ?? "",
    (p.s?.pt ?? "").replace(/\s+/g, " ").slice(0, 300),
  ].filter(Boolean).join(" | ")).join("\n");
}
