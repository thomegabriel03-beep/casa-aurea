/** Leitura de planilha (CSV com ; ou ,) para importação em lote no admin.
 *  Mesma lógica do script scripts/import-catalog.mjs. Sem dependências. */

export interface ImportRow {
  line: number;
  name: string;
  typeCode?: string;      // SOF, POL... (gera o código Casa Áurea)
  subtype?: string;
  supplier?: string;
  catalog?: string;
  catalogYear?: number;
  page?: string;
  originalCode?: string;
  originalName?: string;
  shortDescription?: string;
  description?: string;
  environment?: "indoor" | "outdoor" | "both";
  materials: string[];
  finishes: string[];
  tags: string[];
  collections: string[];
  variants: { name: string; price?: number; widthCm?: number; heightCm?: number; depthCm?: number }[];
  price?: number;
  images: string[];
}

export interface ParseResult { rows: ImportRow[]; errors: string[]; columns: string[] }

const ALIASES: Record<string, string[]> = {
  name: ["nome", "name"], typeCode: ["tipo", "type", "tipo_codigo"], subtype: ["subtipo", "subtype"],
  supplier: ["fornecedor", "supplier", "marca"], catalog: ["catalogo", "catálogo", "catalog"], catalogYear: ["ano", "year"],
  page: ["pagina", "página", "page"], originalCode: ["codigo_original", "código_original", "original_code", "ref"],
  originalName: ["nome_original", "original_name"], shortDescription: ["descricao_curta", "descrição_curta", "short_description"],
  description: ["descricao", "descrição", "description"], environment: ["ambiente", "environment"],
  materials: ["materiais", "materials"], finishes: ["acabamentos", "finishes"], tags: ["tags", "palavras_chave"],
  collections: ["colecoes", "coleções", "collections"], variants: ["variacoes", "variações", "variants"],
  price: ["preco", "preço", "price"], images: ["imagens", "images"],
};

function splitCsv(text: string): string[][] {
  const first = text.split(/\r?\n/)[0] ?? "";
  const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ";" : ",";
  const rows: string[][] = []; let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); if (row.some((c) => c.trim())) rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  row.push(cell); if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const list = (v: string) => (v ? v.split("|").map((x) => x.trim()).filter(Boolean) : []);
export function parseMoney(v: string): number | undefined | null {
  if (!v || !v.trim()) return undefined;
  const n = Number(v.replace(/[R$\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
const ENV: Record<string, ImportRow["environment"]> = { indoor: "indoor", interno: "indoor", outdoor: "outdoor", externo: "outdoor", both: "both", ambos: "both" };

export function parseCatalogCsv(raw: string): ParseResult {
  const text = raw.replace(/^\uFEFF/, "");
  const [header = [], ...lines] = splitCsv(text);
  const idx: Record<string, number> = {};
  header.forEach((h, i) => {
    const k = Object.keys(ALIASES).find((key) => ALIASES[key].includes(h.trim().toLowerCase()));
    if (k) idx[k] = i;
  });
  const errors: string[] = [];
  if (idx.name === undefined) return { rows: [], errors: ["Coluna obrigatória ausente: nome"], columns: header };
  const rows: ImportRow[] = [];
  lines.forEach((cols, n) => {
    const line = n + 2;
    const get = (k: string) => (idx[k] === undefined ? "" : (cols[idx[k]] ?? "").trim());
    const name = get("name");
    if (!name) { errors.push(`linha ${line}: sem nome`); return; }
    const price = parseMoney(get("price"));
    if (price === null) { errors.push(`linha ${line}: preço inválido`); return; }
    const typeCode = get("typeCode").toUpperCase() || undefined;
    if (typeCode && !/^[A-Z]{3}$/.test(typeCode)) { errors.push(`linha ${line}: tipo deve ter 3 letras (ex.: SOF)`); return; }
    let bad = false;
    const variants = list(get("variants")).map((v) => {
      const [vn, vp] = v.split("=");
      const pr = parseMoney(vp ?? "");
      if (pr === null) bad = true;
      return pr === undefined || pr === null ? { name: vn.trim() } : { name: vn.trim(), price: pr };
    });
    if (bad) { errors.push(`linha ${line}: preço de variação inválido`); return; }
    const year = Number(get("catalogYear"));
    rows.push({
      line, name, typeCode, subtype: get("subtype") || undefined, supplier: get("supplier") || undefined,
      catalog: get("catalog") || undefined, catalogYear: Number.isInteger(year) && year > 1900 ? year : undefined,
      page: get("page") || undefined, originalCode: get("originalCode") || undefined, originalName: get("originalName") || undefined,
      shortDescription: get("shortDescription") || undefined, description: get("description") || undefined,
      environment: ENV[get("environment").toLowerCase()] ?? undefined,
      materials: list(get("materials")), finishes: list(get("finishes")), tags: list(get("tags")), collections: list(get("collections")),
      variants, price: price ?? undefined, images: list(get("images")),
    });
  });
  return { rows, errors, columns: header };
}
