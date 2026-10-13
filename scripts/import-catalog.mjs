#!/usr/bin/env node
/**
 * Importador do catálogo Casa Áurea — planilha (CSV com ; ou ,) → JSON do catálogo.
 * Sem dependências. Uso:
 *   node scripts/import-catalog.mjs import/catalogo.csv > catalog.json
 *
 * Colunas reconhecidas (cabeçalho em português ou inglês, em qualquer ordem):
 *   nome|name*, slug, sku|codigo, categoria|category, colecoes|collections (separadas por |),
 *   descricao_curta|short_description, descricao|description, preco|price, preco_promocional|sale_price,
 *   materiais|materials (|), medidas|dimensions, cores|colors (|), disponibilidade|availability,
 *   destaque|featured (sim/não), ordem|order, status (rascunho/ativo/inativo),
 *   imagens|images (nomes de arquivo, separados por |), palavras_chave|keywords (|),
 *   variacoes|variants (nome=preço separados por |, ex.: "1,5 m=1490|1,8 m=1980")
 * Linhas com erro aparecem no terminal e não entram no JSON.
 * Campos vazios são omitidos: a vitrine nunca mostra "não informado".
 */
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) { console.error("Informe o arquivo CSV."); process.exit(1); }
const raw = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
const first = raw.split(/\r?\n/)[0];
const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ";" : ",";

function parse(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); if (row.some((c) => c.trim())) rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  row.push(cell); if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const ALIASES = {
  name: ["nome", "name"], slug: ["slug"], sku: ["sku", "codigo", "código"], category: ["categoria", "category"],
  collections: ["colecoes", "coleções", "collections"], shortDescription: ["descricao_curta", "descrição_curta", "short_description"],
  description: ["descricao", "descrição", "description"], price: ["preco", "preço", "price"],
  salePrice: ["preco_promocional", "preço_promocional", "sale_price"], materials: ["materiais", "materials"],
  dimensions: ["medidas", "dimensions"], colors: ["cores", "colors"], availability: ["disponibilidade", "availability"],
  featured: ["destaque", "featured"], order: ["ordem", "order"], status: ["status"], images: ["imagens", "images"],
  keywords: ["palavras_chave", "keywords"], variants: ["variacoes", "variações", "variants"],
};
const slugify = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const list = (v) => (v ? v.split("|").map((x) => x.trim()).filter(Boolean) : []);
const num = (v) => {
  if (!v || !v.trim()) return null;
  const n = Number(v.replace(/[R$\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};
const STATUS = { rascunho: "draft", draft: "draft", ativo: "active", active: "active", inativo: "inactive", inactive: "inactive" };

const [header, ...lines] = parse(raw);
const idx = {};
header.forEach((h, i) => {
  const k = Object.keys(ALIASES).find((key) => ALIASES[key].includes(h.trim().toLowerCase()));
  if (k) idx[k] = i;
});
if (idx.name === undefined) { console.error("Coluna obrigatória ausente: nome"); process.exit(1); }

const products = [], categories = new Map(), collections = new Map(), errors = [], slugs = new Set();
lines.forEach((cols, n) => {
  const get = (k) => (idx[k] === undefined ? "" : (cols[idx[k]] ?? "").trim());
  const line = n + 2, name = get("name");
  if (!name) { errors.push(`linha ${line}: sem nome`); return; }
  const slug = get("slug") || slugify(name);
  if (slugs.has(slug)) { errors.push(`linha ${line}: slug repetido (${slug})`); return; }
  const price = num(get("price")), salePrice = num(get("salePrice"));
  if (Number.isNaN(price) || Number.isNaN(salePrice)) { errors.push(`linha ${line}: preço inválido`); return; }
  slugs.add(slug);
  const cat = get("category");
  if (cat) categories.set(slugify(cat), { id: slugify(cat), name: cat, slug: slugify(cat), order: categories.size + 1, active: true });
  const collectionIds = list(get("collections")).map((c) => {
    const id = slugify(c);
    if (!collections.has(id)) collections.set(id, { id, name: c, slug: id, featured: false, active: true, order: collections.size + 1 });
    return id;
  });
  const p = {
    id: slug, name, slug, sku: get("sku") || null,
    shortDescription: get("shortDescription") || null, description: get("description") || null,
    price, salePrice, categoryId: cat ? slugify(cat) : null, collectionIds,
    images: list(get("images")).map((url) => ({ url, alt: name })),
    materials: list(get("materials")), dimensions: get("dimensions") || null, colors: list(get("colors")),
    availability: get("availability") || null, keywords: list(get("keywords")),
    variants: list(get("variants")).map((v) => { const [vn, vp] = v.split("="); const pr = num(vp || ""); return pr == null || Number.isNaN(pr) ? { name: vn.trim() } : { name: vn.trim(), price: pr }; }),
    featured: /^(sim|s|yes|true|1)$/i.test(get("featured")), order: Number(get("order")) || n + 1,
    status: STATUS[get("status").toLowerCase()] || "draft",
  };
  for (const k of Object.keys(p)) {
    if (p[k] === null || (Array.isArray(p[k]) && !p[k].length && k !== "collectionIds" && k !== "images")) delete p[k];
  }
  if (p.variants && p.price == null) { const ps = p.variants.map((v) => v.price).filter((x) => x != null); if (ps.length) p.price = Math.min(...ps); }
  {
  }
  products.push(p);
});

errors.forEach((e) => console.error("⚠ " + e));
console.error(`✓ ${products.length} peça(s) · ${categories.size} categoria(s) · ${collections.size} coleção(ões) · ${errors.length} erro(s)`);
process.stdout.write(JSON.stringify({ categories: [...categories.values()], collections: [...collections.values()], products }, null, 2));
