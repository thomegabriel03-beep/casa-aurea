#!/usr/bin/env node
/**
 * Validação de ponta a ponta da Missão 1 contra o Supabase real (e, opcionalmente, o app rodando).
 * Sem dependências. Cria apenas registros marcados "[TESTE-M1]" e os remove no final.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… \
 *   ADMIN_EMAIL=… ADMIN_PASSWORD=… APP_URL=http://localhost:3000 \
 *   node scripts/validate-mission1.mjs
 *
 * O fluxo de produto usa a sessão do ADMIN (mesmo caminho do painel, passando pelo RLS).
 * A service role só cria/remove o usuário não-admin de teste e limpa os registros de teste.
 */
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY, EMAIL = process.env.ADMIN_EMAIL, PASS = process.env.ADMIN_PASSWORD;
const APP = (process.env.APP_URL || "").replace(/\/$/, "");
if (!URL_ || !ANON || !SERVICE || !EMAIL || !PASS) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL e ADMIN_PASSWORD.");
  process.exit(1);
}

const results = [];
const check = (area, name, ok, detail = "") => { results.push({ area, name, ok: !!ok, detail }); console.log(`${ok ? "✓" : "✗"} [${area}] ${name}${detail ? ` — ${detail}` : ""}`); };
const TAG = "[TESTE-M1]";
const stamp = Date.now().toString(36);

async function api(path, { token = ANON, key = ANON, method = "GET", body, prefer = "return=representation", headers = {} } = {}) {
  const r = await fetch(`${URL_}${path}`, {
    method, body: body === undefined ? undefined : typeof body === "string" || body instanceof Uint8Array ? body : JSON.stringify(body),
    headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: prefer, ...headers },
  });
  const text = await r.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: r.status, ok: r.ok, data };
}
const rest = (path, o) => api(`/rest/v1/${path}`, o);
const rpc = (fn, args, o) => api(`/rest/v1/rpc/${fn}`, { method: "POST", body: args, ...o });
async function signIn(email, password) {
  const r = await api("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
  return r.ok ? r.data.access_token : null;
}

const cleanup = { products: [], collections: [], catalogs: [], users: [], files: [] };
const svc = { token: SERVICE, key: SERVICE };
// os testes consomem números da sequência de códigos; guardamos para devolver no final
const countersBefore = (await rest("product_code_counters?select=type_id,last_seq", svc)).data ?? [];

try {
  /* 1. MIGRAÇÕES ------------------------------------------------------------------- */
  const tables = ["categories", "collections", "products", "product_images", "product_collections", "catalog_admins",          // 0001
    "suppliers", "catalogs", "product_types", "product_subtypes", "materials", "finishes", "tags", "product_variants",          // 0002
    "product_materials", "product_finishes", "product_tags", "product_media", "product_source_references", "editorial_features",
    "import_batches", "product_quality_flags", "product_code_counters",
    "site_settings"];                                                                                                            // 0003
  for (const t of tables) { const r = await rest(`${t}?select=*&limit=1`, svc); check("migrações", `tabela ${t}`, r.ok, r.ok ? "" : JSON.stringify(r.data)); }
  for (const v of ["public_products", "public_product_variants", "public_product_media", "public_product_materials", "public_product_finishes", "public_collection_products", "public_collections", "product_quality_auto", "product_possible_duplicates", "live_collections"]) {
    const r = await rest(`${v}?select=*&limit=1`, svc); check("migrações", `view ${v}`, r.ok, r.ok ? "" : JSON.stringify(r.data));
  }
  const types = await rest("product_types?select=id,code,section", svc);
  check("migrações", "0002: 19 tipos seed", (types.data ?? []).filter((t) => t.section === "moveis").length >= 19);
  check("migrações", "0003: coluna section em product_types", (types.data ?? []).every((t) => "section" in t));
  const sup = await rest("suppliers?select=id,name", svc);
  check("migrações", "0002: 14 fornecedores", (sup.data ?? []).length >= 14, `${(sup.data ?? []).length} encontrados`);
  const buckets = await api("/storage/v1/bucket", svc);
  const bnames = (buckets.data ?? []).map((b) => b.id);
  check("migrações", "0003: buckets do Storage", ["produtos", "colecoes", "showroom", "institucional", "campanhas", "importacoes"].every((b) => bnames.includes(b)), bnames.join(", "));

  /* 2. CONEXÃO --------------------------------------------------------------------- */
  const anonPing = await rest("public_collections?select=slug&limit=1");
  check("supabase", "conexão com chave anon", anonPing.ok);

  /* 3. AUTENTICAÇÃO ---------------------------------------------------------------- */
  const admin = await signIn(EMAIL, PASS);
  check("auth", "login do admin", !!admin);
  if (!admin) throw new Error("sem sessão de admin; demais testes dependem dela");
  const A = { token: admin, key: ANON };
  check("auth", "admin está em catalog_admins", (await rpc("is_catalog_admin", {}, A)).data === true);

  const outsiderEmail = `teste-m1-${stamp}@exemplo.invalid`, outsiderPass = `T!${stamp}x9Q`;
  const created = await api("/auth/v1/admin/users", { ...svc, method: "POST", body: { email: outsiderEmail, password: outsiderPass, email_confirm: true } });
  if (created.ok) cleanup.users.push(created.data.id);
  const outsider = created.ok ? await signIn(outsiderEmail, outsiderPass) : null;
  check("auth", "usuário fora de catalog_admins faz login no Auth", !!outsider);
  if (outsider) {
    const O = { token: outsider, key: ANON };
    check("auth", "não-admin: is_catalog_admin = false", (await rpc("is_catalog_admin", {}, O)).data === false);
    const w = await rest("suppliers", { ...O, method: "POST", body: { name: `${TAG} invasor`, slug: `invasor-${stamp}` } });
    check("auth", "não-admin não escreve no catálogo", !w.ok);
    const s = await rpc("admin_search_products", { q: "" }, O);
    check("auth", "não-admin não usa a busca do admin", !s.ok);
  }

  if (APP) {
    const r = await fetch(`${APP}/admin`, { redirect: "manual" });
    check("auth", "/admin sem login redireciona para /admin/login", [302, 303, 307, 308].includes(r.status) && (r.headers.get("location") ?? "").includes("/admin/login"), `${r.status} → ${r.headers.get("location")}`);
  }

  /* 4. CICLO DO PRODUTO (sessão do admin, via RLS) --------------------------------- */
  const sof = (types.data ?? []).find((t) => t.code === "SOF");
  const supplier = (sup.data ?? [])[0];
  const cat = await rest("catalogs", { ...A, method: "POST", body: { supplier_id: supplier.id, name: `${TAG} Catálogo ${stamp}`, year: 2026 } });
  check("produto", "criar catálogo ligado ao fornecedor", cat.ok, cat.ok ? "" : JSON.stringify(cat.data));
  const catalog = cat.data?.[0]; if (catalog) cleanup.catalogs.push(catalog.id);

  const name = `${TAG} Sofá Validação ${stamp}`;
  const ins = await rest("products?select=id,public_code,slug", { ...A, method: "POST", body: { name, slug: `tmp-${stamp}`, product_type_id: sof.id, supplier_id: supplier.id, status: "draft", visibility: "internal", curation_tier: "archive", internal_notes: `NOTA-INTERNA-${stamp}`, price: 12345, show_price: false } });
  check("produto", "criar produto", ins.ok, ins.ok ? "" : JSON.stringify(ins.data));
  const prod = ins.data?.[0];
  if (!prod) throw new Error("produto não criado");
  cleanup.products.push(prod.id);
  check("produto", "código Casa Áurea gerado", /^CA-SOF-\d{4,}$/.test(prod.public_code ?? ""), prod.public_code);

  const slug = `sofa-validacao-${stamp}-${prod.public_code.toLowerCase()}`;
  const ed = await rest(`products?id=eq.${prod.id}`, { ...A, method: "PATCH", body: { slug, short_description: "Descrição curta de teste.", editorial_description: "Descrição editorial de teste." } });
  check("produto", "editar produto", ed.ok);
  const imm = await rest(`products?id=eq.${prod.id}`, { ...A, method: "PATCH", body: { public_code: "CA-SOF-9999" } });
  check("produto", "código Casa Áurea é imutável", !imm.ok, imm.ok ? "alteração foi aceita!" : "alteração recusada");

  const v = await rest("product_variants?select=variant_code", { ...A, method: "POST", body: { product_id: prod.id, name: "220 cm", width_cm: 220, depth_cm: 100, height_cm: 80, supplier_variant_code: `ORIG-VAR-${stamp}` } });
  check("produto", "variante com código -V01", v.ok && v.data?.[0]?.variant_code === `${prod.public_code}-V01`, v.data?.[0]?.variant_code ?? JSON.stringify(v.data));

  const mats = await rest("materials?select=id,name&limit=1", A);
  const fins = await rest("finishes?select=id,name&limit=1", A);
  const pm = await rest("product_materials", { ...A, method: "POST", body: { product_id: prod.id, material_id: mats.data[0].id, is_primary: true } });
  const pf = await rest("product_finishes", { ...A, method: "POST", body: { product_id: prod.id, finish_id: fins.data[0].id } });
  check("produto", "material e acabamento", pm.ok && pf.ok);

  const src = await rest("product_source_references", { ...A, method: "POST", body: { product_id: prod.id, supplier_id: supplier.id, catalog_id: catalog?.id, page: "42", original_code: `ORIG-${stamp}`, original_name: `NOME-ORIGINAL-${stamp}` } });
  check("produto", "fornecedor, catálogo, página e código original", src.ok);

  // PNG 1×1 para testar o Storage com a sessão do admin
  const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
  const path = `teste-m1/${stamp}.png`;
  const up = await api(`/storage/v1/object/produtos/${path}`, { ...A, method: "POST", body: png, headers: { "Content-Type": "image/png", "x-upsert": "true" } });
  check("produto", "upload de imagem no Storage (admin)", up.ok, up.ok ? "" : JSON.stringify(up.data));
  if (up.ok) cleanup.files.push(path);
  const anonUp = await api(`/storage/v1/object/produtos/teste-m1/anon-${stamp}.png`, { method: "POST", body: png, headers: { "Content-Type": "image/png" } });
  check("segurança", "visitante não envia arquivos", !anonUp.ok);
  const mediaUrl = `${URL_}/storage/v1/object/public/produtos/${path}`;
  const md = await rest("product_media", { ...A, method: "POST", body: { product_id: prod.id, url: mediaUrl, type: "primary", is_primary: true, width: 2400, height: 3000, alt: "teste" } });
  check("produto", "imagem principal registrada", md.ok);
  check("produto", "imagem pública acessível", (await fetch(mediaUrl)).ok);

  const col = await rest("collections?select=id,slug", { ...A, method: "POST", body: { name: `${TAG} Coleção ${stamp}`, slug: `teste-m1-${stamp}`, active: false, featured: false } });
  check("coleção", "criar coleção", col.ok);
  const collection = col.data?.[0]; if (collection) cleanup.collections.push(collection.id);
  const link = await rest("product_collections", { ...A, method: "POST", body: { product_id: prod.id, collection_id: collection.id, sort_order: 2 } });
  check("coleção", "adicionar produto", link.ok);

  const inPublicBefore = await rest(`public_products?slug=eq.${slug}&select=id`);
  check("segurança", "peça interna fora do site", (inPublicBefore.data ?? []).length === 0);

  const pub = await rest(`products?id=eq.${prod.id}`, { ...A, method: "PATCH", body: { visibility: "public", curation_tier: "curated", status: "active" } });
  check("produto", "publicar + Curated", pub.ok);

  /* 5. PRIVACIDADE ----------------------------------------------------------------- */
  const pp = await rest(`public_products?slug=eq.${slug}&select=*`);
  const row = pp.data?.[0];
  check("público", "peça publicada aparece em public_products", !!row);
  const forbiddenKeys = ["supplier_id", "internal_notes", "collection_name_original", "status_commercial", "visibility", "search_text", "sku", "show_price", "extra_info"];
  check("segurança", "public_products sem colunas internas", row && forbiddenKeys.every((k) => !(k in row)), row ? Object.keys(row).filter((k) => forbiddenKeys.includes(k)).join(", ") : "");
  check("segurança", "preço oculto quando show_price = false", row && row.price === null);
  const pv = await rest(`public_product_variants?product_id=eq.${prod.id}&select=*`);
  check("segurança", "variantes públicas sem código do fornecedor", (pv.data ?? []).length === 1 && !("supplier_variant_code" in pv.data[0]));
  for (const t of ["products", "suppliers", "catalogs", "product_source_references", "product_variants", "product_media", "import_batches", "product_collections", "product_quality_flags"]) {
    const r = await rest(`${t}?select=*&limit=5`);
    check("segurança", `visitante não lê ${t}`, !r.ok || (r.data ?? []).length === 0);
  }
  const dupView = await rest("product_possible_duplicates?select=*&limit=1");
  check("segurança", "visitante não lê duplicidades/pendências", !dupView.ok || (dupView.data ?? []).length === 0);

  /* 6. COLEÇÕES -------------------------------------------------------------------- */
  const prod2 = await rest("products?select=id,public_code", { ...A, method: "POST", body: { name: `${TAG} Mesa Validação ${stamp}`, slug: `tmp2-${stamp}`, product_type_id: (types.data ?? []).find((t) => t.code === "MES").id, visibility: "public", curation_tier: "curated", status: "active" } });
  if (prod2.ok) cleanup.products.push(prod2.data[0].id);
  await rest("product_collections", { ...A, method: "POST", body: { product_id: prod2.data[0].id, collection_id: collection.id, sort_order: 1 } });
  const reorder = await rest(`product_collections?collection_id=eq.${collection.id}&product_id=eq.${prod.id}`, { ...A, method: "PATCH", body: { sort_order: 0 } });
  check("coleção", "reordenar", reorder.ok);
  check("coleção", "inativa não aparece no público", ((await rest(`public_collections?slug=eq.${collection.slug}&select=slug`)).data ?? []).length === 0);
  const today = new Date().toISOString().slice(0, 10);
  const act = await rest(`collections?id=eq.${collection.id}`, { ...A, method: "PATCH", body: { active: true, featured: true, start_date: today, end_date: "2099-12-31" } });
  check("coleção", "ativar + destaque + período", act.ok);
  const live = await rest(`public_collections?slug=eq.${collection.slug}&select=is_live,featured`);
  check("coleção", "aparece como no ar", live.data?.[0]?.is_live === true);
  const order = await rest(`public_collection_products?collection_id=eq.${collection.id}&select=product_id&order=sort_order`);
  check("coleção", "ordem pública respeitada", order.data?.[0]?.product_id === prod.id);
  await rest(`collections?id=eq.${collection.id}`, { ...A, method: "PATCH", body: { end_date: "2020-01-01" } });
  check("coleção", "fora do período sai do ar (sem apagar)", (await rest(`public_collections?slug=eq.${collection.slug}&select=is_live`)).data?.[0]?.is_live === false);
  await rest(`collections?id=eq.${collection.id}`, { ...A, method: "PATCH", body: { end_date: "2099-12-31" } });

  /* 7. NATAL ----------------------------------------------------------------------- */
  const natal = await rest("public_collections?slug=eq.natal&select=id,name,is_live,featured");
  check("natal", "Natal existe como coleção (mesma tabela)", natal.data?.[0]?.name === "Natal Casa Áurea");
  if (natal.data?.[0]) {
    const np = await rest(`public_collection_products?collection_id=eq.${natal.data[0].id}&select=product_id`);
    check("natal", "4 peças na coleção", (np.data ?? []).length === 4, `${(np.data ?? []).length}`);
    const codes = await rest(`public_products?select=public_code,price&id=in.(${(np.data ?? []).map((x) => x.product_id).join(",")})`);
    check("natal", "peças com código Casa Áurea", (codes.data ?? []).every((c) => /^CA-(ARV|GUI|ARR)-\d{4}$/.test(c.public_code)), (codes.data ?? []).map((c) => c.public_code).join(" "));
    check("natal", "preço de locação visível (show_price)", (codes.data ?? []).every((c) => c.price != null));
  }

  /* 9. BUSCA ----------------------------------------------------------------------- */
  const search = async (q) => ((await rpc("admin_search_products", { q }, A)).data ?? []).some((r) => r.id === prod.id);
  check("busca", "por nome", await search(`validação ${stamp}`));
  check("busca", "por código Casa Áurea", await search(prod.public_code));
  check("busca", "por código de variante", await search(`${prod.public_code}-V01`));
  check("busca", "por código original", await search(`ORIG-${stamp}`));
  check("busca", "por fornecedor", await search(`${supplier.name} ${stamp}`));
  check("busca", "por catálogo", await search(`Catálogo ${stamp}`));
  check("busca", "por material", await search(`${mats.data[0].name} ${stamp}`));

  /* 10. PENDÊNCIAS E DUPLICIDADE --------------------------------------------------- */
  const qa = await rest(`product_quality_auto?product_id=eq.${prod2.data[0].id}&select=flag`, A);
  const flags = (qa.data ?? []).map((f) => f.flag);
  check("qualidade", "pendências automáticas calculadas", ["missingOriginalCode", "missingDimensions", "missingHighQualityImage", "missingMaterial"].every((f) => flags.includes(f)), flags.join(", "));
  const dupe = await rest("products?select=id", { ...A, method: "POST", body: { name, slug: `tmp3-${stamp}`, product_type_id: sof.id, supplier_id: supplier.id } });
  if (dupe.ok) cleanup.products.push(dupe.data[0].id);
  const dups = await rest(`product_possible_duplicates?or=(product_id.eq.${prod.id},duplicate_of.eq.${prod.id})&select=*`, A);
  check("qualidade", "possível duplicidade sinalizada", (dups.data ?? []).length > 0);
  const both = await rest(`products?id=in.(${prod.id},${dupe.data[0].id})&select=id`, A);
  check("qualidade", "nada foi mesclado (as duas peças existem)", (both.data ?? []).length === 2);

  /* 11. ROTAS DO APP --------------------------------------------------------------- */
  if (APP) {
    const tipo = (await rest("product_types?code=eq.SOF&select=slug")).data?.[0]?.slug ?? "sofas";
    for (const route of ["/", "/moveis", `/moveis/${tipo}`, "/outdoor", "/colecoes", "/colecoes/natal", `/colecoes/${collection.slug}`, `/produto/${slug}`]) {
      const r = await fetch(`${APP}${route}`);
      const html = await r.text();
      check("rotas", `${route} responde 200`, r.status === 200, String(r.status));
      if (route.startsWith("/produto/")) {
        check("rotas", "página da peça mostra nome e código", html.includes(prod.public_code));
        check("segurança", "HTML público sem fornecedor/código original/notas/preço oculto",
          ![supplier.name, `ORIG-${stamp}`, `NOTA-INTERNA-${stamp}`, `NOME-ORIGINAL-${stamp}`, `ORIG-VAR-${stamp}`, "12.345", "12345"].some((s) => html.includes(s)));
        check("rotas", "botão Consultar peça com código", html.includes("wa.me") && html.includes(encodeURIComponent(prod.public_code)));
      }
    }
    const internal = await fetch(`${APP}/produto/${(await rest(`products?id=eq.${dupe.data[0].id}&select=slug`, A)).data[0].slug}`);
    check("segurança", "peça interna devolve 404 no site", internal.status === 404, String(internal.status));
  }
} catch (e) {
  check("execução", "erro inesperado", false, e.message);
} finally {
  /* limpeza: só registros de teste */
  for (const id of cleanup.products) await rest(`products?id=eq.${id}`, { ...svc, method: "DELETE", prefer: "return=minimal" });
  for (const id of cleanup.collections) await rest(`collections?id=eq.${id}`, { ...svc, method: "DELETE", prefer: "return=minimal" });
  for (const id of cleanup.catalogs) await rest(`catalogs?id=eq.${id}`, { ...svc, method: "DELETE", prefer: "return=minimal" });
  for (const p of cleanup.files) await api(`/storage/v1/object/produtos/${p}`, { ...svc, method: "DELETE" });
  for (const id of cleanup.users) await api(`/auth/v1/admin/users/${id}`, { ...svc, method: "DELETE" });
  // devolve a sequência dos códigos ao estado anterior (só se ninguém mais criou peças no meio)
  const after = (await rest("product_code_counters?select=type_id,last_seq", svc)).data ?? [];
  for (const c of after) {
    const before = countersBefore.find((b) => b.type_id === c.type_id);
    const used = await rest(`products?product_type_id=eq.${c.type_id}&select=public_code&order=public_code.desc&limit=1`, svc);
    const maxSeq = Number((used.data?.[0]?.public_code ?? "").split("-")[2] ?? 0) || 0;
    const target = Math.max(before?.last_seq ?? 0, maxSeq);
    if (c.last_seq > target) {
      if (target === 0 && !before) await rest(`product_code_counters?type_id=eq.${c.type_id}`, { ...svc, method: "DELETE", prefer: "return=minimal" });
      else await rest(`product_code_counters?type_id=eq.${c.type_id}`, { ...svc, method: "PATCH", body: { last_seq: target }, prefer: "return=minimal" });
    }
  }
  const fail = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fail.length}/${results.length} verificações aprovadas.`);
  if (fail.length) { console.log("Falhas:"); fail.forEach((f) => console.log(`  ✗ [${f.area}] ${f.name}${f.detail ? ` — ${f.detail}` : ""}`)); }
  process.exit(fail.length ? 1 : 0);
}
