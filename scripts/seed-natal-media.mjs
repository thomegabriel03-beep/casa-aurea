#!/usr/bin/env node
/**
 * Envia as fotos da Coleção Natal 2026 (do catálogo oficial) para o Supabase Storage
 * e as associa às peças criadas pela migração 0004. Sem dependências (usa fetch).
 *
 * Uso:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/seed-natal-media.mjs caminho/para/pasta-com-as-fotos
 *
 * A pasta deve conter (pacote casa-aurea-media, pasta originais):
 *   casa-aurea-natal-capa.jpg, casa-aurea-natal-arvore-esmeralda.jpg, casa-aurea-natal-arvore-diamante.jpg,
 *   casa-aurea-natal-guirlandas.jpg, casa-aurea-natal-arranjos.jpg
 * Pode ser executado de novo: arquivos e registros existentes são reaproveitados.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dir = process.argv[2];
if (!URL_ || !KEY || !dir) { console.error("Defina NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e a pasta das fotos."); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function rest(path, init = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...H, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

async function upload(bucket, path, file) {
  const r = await fetch(`${URL_}/storage/v1/object/${bucket}/${path}`, {
    method: "POST", headers: { ...H, "Content-Type": "image/jpeg", "x-upsert": "true", "cache-control": "31536000" }, body: readFileSync(file),
  });
  if (!r.ok) throw new Error(`upload ${path}: ${r.status} ${await r.text()}`);
  return `${URL_}/storage/v1/object/public/${bucket}/${path}`;
}

const pieces = [
  ["arvore-aurea-esmeralda", "casa-aurea-natal-arvore-esmeralda.jpg", "Árvore Áurea Esmeralda com esferas douradas e verdes, ao lado de outra árvore decorada"],
  ["arvore-aurea-diamante", "casa-aurea-natal-arvore-diamante.jpg", "Árvores Áurea Diamante em versões dourada e vermelha em um hall iluminado"],
  ["guirlandas-natal", "casa-aurea-natal-guirlandas.jpg", "Duas guirlandas com esferas douradas, pinhas e laço"],
  ["arranjos-natal", "casa-aurea-natal-arranjos.jpg", "Arranjo de centro de mesa com velas, folhagens e esferas sobre mesa posta"],
];

for (const [prefix, file, alt] of pieces) {
  const path = join(dir, file);
  if (!existsSync(path)) { console.warn(`⚠ arquivo não encontrado: ${file}`); continue; }
  const [prod] = await rest(`products?slug=like.${prefix}*&select=id,public_code,slug`);
  if (!prod) { console.warn(`⚠ peça não encontrada (rode a migração 0004): ${prefix}`); continue; }
  const url = await upload("produtos", `${(prod.public_code ?? prefix).toLowerCase()}/${file}`, path);
  const existing = await rest(`product_media?product_id=eq.${prod.id}&url=eq.${encodeURIComponent(url)}&select=id`);
  if (!existing.length) {
    const primary = await rest(`product_media?product_id=eq.${prod.id}&is_primary=eq.true&select=id`);
    const first = primary.length === 0;
    await rest("product_media", { method: "POST", body: JSON.stringify({ product_id: prod.id, url, alt, type: first ? "primary" : "gallery", is_primary: first, sort_order: first ? 0 : 10 }) });
  }
  console.log(`✓ ${prod.public_code ?? prefix}`);
}

const cover = join(dir, "casa-aurea-natal-capa.jpg");
if (existsSync(cover)) {
  const url = await upload("colecoes", "natal/casa-aurea-natal-capa.jpg", cover);
  await rest("collections?slug=eq.natal", { method: "PATCH", body: JSON.stringify({ cover_image: url, og_image: url, cover_position: "50% 30%" }) });
  console.log("✓ capa da coleção Natal");
}
