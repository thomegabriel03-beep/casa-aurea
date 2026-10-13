"""Piloto real da Missão 2 no Supabase: executa e verifica tudo, e imprime o relatório ✅/❌.

    SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… SUPABASE_ANON_KEY=… \
    python -m casa_aurea_import.pilot_real --pdf 2026_CAT_BRAZIL_CONTEMPORANEO.pdf

Ordem: estrutura do banco → lote real (modo local, o PDF não sobe) → processamento com PAUSA forçada
e RETOMADA → verificações → reprocessamento (idempotência) → reclassificação → troca de foto → privacidade
→ métricas reais → amostra de 20 peças (HTML local). Nada é publicado.
"""
from __future__ import annotations

import argparse
import html
import json
import os
import shutil
import tempfile
import threading
import time
import urllib.request

from . import sink
from .sink import rest

RESULTS: list[tuple[str, bool, str]] = []
ANON = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")


def check(name, ok, detail=""):
    RESULTS.append((name, bool(ok), detail))
    print(f"{'✅' if ok else '❌'} {name}{' — ' + detail if detail else ''}")


def anon_get(table, params):
    q = "&".join(f"{k}={v}" for k, v in params.items())
    req = urllib.request.Request(f"{sink.URL}/rest/v1/{table}?{q}", headers={"apikey": ANON, "Authorization": f"Bearer {ANON}"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b"[]")
    except urllib.error.HTTPError:
        return []   # negado = não visível


def http_status(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, method="GET"), timeout=60) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def batch_products(bid):
    items = rest("GET", "import_items", {"batch_id": f"eq.{bid}", "select": "product_id", "limit": "5000"}) or []
    return [i["product_id"] for i in items if i["product_id"]]


def in_list(ids):
    return f"in.({','.join(ids)})"


def run_with_pause(bid, pdf, pause_at):
    """Pede pausa quando o lote passa da página `pause_at` (como o botão do painel) e depois retoma."""
    def watcher():
        while True:
            b = rest("GET", "import_batches", {"id": f"eq.{bid}", "select": "processed_pages,status"})[0]
            if (b["processed_pages"] or 0) >= pause_at:
                rest("PATCH", "import_batches", {"id": f"eq.{bid}"}, {"pause_requested": True}, prefer="return=minimal")
                return
            if b["status"] not in ("queued", "processing"):
                return
            time.sleep(1)
    t = threading.Thread(target=watcher, daemon=True)
    t.start()
    sink.run_batch(bid, chunk=10, local_file=pdf)
    t.join(timeout=5)
    b = rest("GET", "import_batches", {"id": f"eq.{bid}", "select": "status,processed_pages,next_page"})[0]
    pages_saved = len(rest("GET", "import_pages", {"batch_id": f"eq.{bid}", "select": "page_number", "limit": "5000"}) or [])
    paused_ok = b["status"] == "paused" and b["next_page"] == b["processed_pages"] + 1 and pages_saved == b["processed_pages"]
    check("PAUSA", paused_ok, f"parou na página {b['processed_pages']}, checkpoint em {b['next_page']}, {pages_saved} páginas gravadas")
    rest("PATCH", "import_batches", {"id": f"eq.{bid}"}, {"status": "queued", "pause_requested": False}, prefer="return=minimal")
    sink.run_batch(bid, chunk=20, local_file=pdf)
    return b["processed_pages"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", required=True)
    ap.add_argument("--supplier", default="Brazil Contemporâneo")
    ap.add_argument("--catalog", default="Catálogo 2026")
    ap.add_argument("--year", default="2026")
    ap.add_argument("--pause-at", type=int, default=40)
    ap.add_argument("--report", default="amostra-piloto-real.html")
    a = ap.parse_args()
    if not (sink.URL and sink.KEY and ANON):
        raise SystemExit("Defina SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SUPABASE_ANON_KEY.")

    # 1–2. estrutura
    try:
        for t, cols in {"import_batches": "id,next_page,processed_pages,source_checksum,processing_mode,pause_requested,metrics",
                        "import_pages": "batch_id,page_number,render_path", "import_items": "id,flags,scores,idempotency_key",
                        "product_media": "id,phash,quality,hero_ready,background,status,replaced_by,source_type",
                        "product_variants": "id,variant_code", "products": "id,public_code,visibility,curation_tier,classification_confidence",
                        "product_quality_flags": "product_id,flag", "suppliers": "id", "catalogs": "id", "product_types": "code",
                        "product_subtypes": "id", "materials": "id", "finishes": "id", "tags": "id", "collections": "id",
                        "product_source_references": "id,original_code,page,import_batch_id"}.items():
            rest("GET", t, {"select": cols, "limit": "1"})
        types = {t["code"] for t in rest("GET", "product_types", {"select": "code"})}
        check("BANCO", {"GAV", "EST", "CRI", "CAB", "SOF", "MES"} <= types, "migrações 0001–0006 presentes; tipos novos cadastrados")
    except Exception as e:
        check("BANCO", False, f"estrutura incompleta (aplique as migrações): {e}")
        return finish(a)

    sup = rest("GET", "suppliers", {"name": f"eq.{a.supplier}", "select": "id"})
    if not sup:
        check("LOTE", False, f"fornecedor '{a.supplier}' não encontrado")
        return finish(a)
    sid = sup[0]["id"]
    cat = rest("GET", "catalogs", {"supplier_id": f"eq.{sid}", "name": f"eq.{a.catalog}", "select": "id"}) or \
        rest("POST", "catalogs", None, {"supplier_id": sid, "name": a.catalog, "year": int(a.year)})
    cid = cat[0]["id"]
    before = len(rest("GET", "products", {"select": "id", "limit": "100000"}) or [])

    # 5–7. lote real, com pausa e retomada no meio
    bid = rest("POST", "import_batches", None, {"kind": "pdf", "status": "queued", "processing_mode": "local", "supplier_id": sid, "catalog_id": cid,
                                                  "catalog_year": a.year, "source_file": os.path.basename(a.pdf), "source_size": os.path.getsize(a.pdf)})[0]["id"]
    t0 = time.time()
    run_with_pause(bid, a.pdf, a.pause_at)
    b = rest("GET", "import_batches", {"id": f"eq.{bid}", "select": "*"})[0]
    pages = rest("GET", "import_pages", {"batch_id": f"eq.{bid}", "select": "page_number,render_path", "limit": "5000"}) or []
    nums = [p["page_number"] for p in pages]
    check("LOTE", b["source_checksum"] and b["total_pages"] and b["source_size"], f"SHA-256 {str(b['source_checksum'])[:12]}…, {b['total_pages']} páginas, {b['source_size']} bytes, status {b['status']}")
    check("RETOMADA", len(nums) == len(set(nums)) == b["total_pages"], f"{len(nums)} páginas únicas de {b['total_pages']} (nenhuma repetida)")
    m = b.get("metrics") or {}
    check("PROCESSAMENTO COMPLETO", b["status"] in ("imported", "needs_review") and not b.get("error"), f"{round(time.time() - t0)} s, {m.get('criados')} peças gravadas, {m.get('falhas_ao_gravar')} falhas")

    pids = batch_products(bid)
    prods = []
    for i in range(0, len(pids), 150):
        prods += rest("GET", "products", {"id": in_list(pids[i:i + 150]), "select": "id,name,slug,public_code,visibility,curation_tier,product_type_id,status"}) or []
    codes = [p["public_code"] for p in prods if p["public_code"]]
    check("PRODUTOS", len(prods) == m.get("criados") and len(codes) == len(set(codes)), f"{len(prods)} peças, {len(codes)} com código Casa Áurea, nenhum código repetido")
    check("PUBLICAÇÃO AUTOMÁTICA BLOQUEADA", all(p["visibility"] == "internal" and p["curation_tier"] == "archive" for p in prods), "todas internas + acervo")
    if prods and codes:
        p0 = next(p for p in prods if p["public_code"])
        try:
            rest("PATCH", "products", {"id": f"eq.{p0['id']}"}, {"public_code": "CA-XXX-9999"}, prefer="return=minimal")
            check("CÓDIGO IMUTÁVEL", False, "o banco aceitou alterar o código!")
        except RuntimeError:
            check("CÓDIGO IMUTÁVEL", True, "alteração recusada pelo banco")
    vars_ = []
    for i in range(0, len(pids), 150):
        vars_ += rest("GET", "product_variants", {"product_id": in_list(pids[i:i + 150]), "select": "product_id,variant_code", "limit": "10000"}) or []
    code_by = {p["id"]: p["public_code"] for p in prods}
    bad_v = [v for v in vars_ if code_by.get(v["product_id"]) and not str(v["variant_code"] or "").startswith(code_by[v["product_id"]] + "-V")]
    check("VARIANTES", vars_ and not bad_v, f"{len(vars_)} variantes, padrão CA-XXX-0000-V01 em todas")

    media = []
    for i in range(0, len(pids), 150):
        media += rest("GET", "product_media", {"product_id": in_list(pids[i:i + 150]), "select": "product_id,url,is_primary,quality,phash,background,has_text,watermark,width,height", "limit": "10000"}) or []
    prim = [x for x in media if x["is_primary"]]
    pngs = [x for x in media if x["url"].endswith(".png")]
    sample_urls = [prim[0]["url"]] + ([pngs[0]["url"]] if pngs else []) + [x["url"] for x in media if not x["is_primary"]][:1]
    check("IMAGENS", len(media) == m.get("imagens") and all(http_status(u) == 200 for u in sample_urls) and all(x["phash"] for x in media),
          f"{len(media)} imagens no Storage, {len(prim)} principais, {len(pngs)} com transparência (PNG); URLs testadas: 200")
    signed = sink._req("POST", f"{sink.URL}/storage/v1/object/sign/importacoes/{pages[0]['render_path']}", {"expiresIn": 600}) if pages and pages[0].get("render_path") else None
    signed_ok = bool(signed and http_status(f"{sink.URL}/storage/v1{signed['signedURL']}") == 200)
    public_blocked = pages and pages[0].get("render_path") and http_status(f"{sink.URL}/storage/v1/object/public/importacoes/{pages[0]['render_path']}") != 200
    check("PÁGINA ORIGINAL", signed_ok and public_blocked, f"{sum(1 for p in pages if p.get('render_path'))} miniaturas de página; acesso só por URL assinada")
    check("STORAGE", len(media) and signed_ok and public_blocked, "produtos: leitura pública das fotos; importacoes: privado")

    items = rest("GET", "import_items", {"batch_id": f"eq.{bid}", "select": "flags,extracted", "limit": "5000"}) or []
    flagset = lambda f: sum(1 for it in items if f in it["flags"])
    new_types = sum(1 for it in items if (it["extracted"].get("classification") or {}).get("type") in ("GAV", "EST", "CRI", "CAB"))
    uncertain = flagset("TAXONOMY_REVIEW_REQUIRED") + flagset("NO_TYPE")
    check("CLASSIFICAÇÃO", new_types > 0 and uncertain <= max(1, len(items) * 0.05),
          f"incertas {flagset('TAXONOMY_REVIEW_REQUIRED')}, sem tipo {flagset('NO_TYPE')}; itens usando GAV/EST/CRI/CAB: {new_types}")
    check("DUPLICIDADE", flagset("SAME_CODE_DUPLICATE") + flagset("POSSIBLE_DUPLICATE") > 0 and len(prods) == len(set(p["id"] for p in prods)),
          f"mesmo código {flagset('SAME_CODE_DUPLICATE')}, possível {flagset('POSSIBLE_DUPLICATE')}, nada mesclado")
    check("PENDÊNCIAS", sum(1 for it in items if it["flags"]) > 0, f"{sum(1 for it in items if set(it['flags']) & sink.BLOCKING)} itens com pendência bloqueante")

    # 12. reclassificar só os afetados
    sink.reclassify_batch(bid)
    check("RECLASSIFICAÇÃO SEM REIMPORTAR", len(batch_products(bid)) == len(pids), "nenhuma peça criada ou apagada")

    # 15. idempotência: mesmo arquivo de novo
    bid2 = rest("POST", "import_batches", None, {"kind": "pdf", "status": "queued", "processing_mode": "local", "supplier_id": sid, "catalog_id": cid,
                                                   "catalog_year": a.year, "source_file": os.path.basename(a.pdf)})[0]["id"]
    sink.run_batch(bid2, chunk=50, local_file=a.pdf)
    b2 = rest("GET", "import_batches", {"id": f"eq.{bid2}", "select": "metrics,warnings"})[0]
    after = len(rest("GET", "products", {"select": "id", "limit": "100000"}) or [])
    check("IDEMPOTÊNCIA", (b2["metrics"] or {}).get("criados") == 0 and after - before == len(pids),
          f"2ª execução: {(b2['metrics'] or {}).get('criados')} novas, {(b2['metrics'] or {}).get('reaproveitados')} reconhecidas; aviso: {(b2.get('warnings') or ['—'])[0][:80]}")

    # 17. troca de foto pelo fluxo em lote
    ref = rest("GET", "product_source_references", {"import_batch_id": f"eq.{bid}", "original_code": "not.is.null", "select": "product_id,original_code", "limit": "1"})[0]
    pid = ref["product_id"]
    snap = lambda: (rest("GET", "products", {"id": f"eq.{pid}", "select": "name,slug,public_code,product_type_id,visibility,curation_tier"})[0],
                    len(rest("GET", "product_variants", {"product_id": f"eq.{pid}", "select": "id"}) or []),
                    len(rest("GET", "product_collections", {"product_id": f"eq.{pid}", "select": "collection_id"}) or []),
                    len(rest("GET", "product_source_references", {"product_id": f"eq.{pid}", "select": "id"}) or []))
    s1 = snap()
    tmp = tempfile.mkdtemp()
    src = next(x for x in media if x["product_id"] == pid and x["is_primary"])
    with urllib.request.urlopen(src["url"]) as r, open(os.path.join(tmp, f"BC_{ref['original_code']}_original{os.path.splitext(src['url'])[1]}"), "wb") as fh:
        fh.write(r.read())
    sink.replace_images(tmp, sid)
    shutil.rmtree(tmp, ignore_errors=True)
    hist = rest("GET", "product_media", {"product_id": f"eq.{pid}", "select": "status,source_type,is_primary,replaced_by"})
    check("SUBSTITUIÇÃO DE FOTO", snap() == s1 and any(h["status"] == "replaced" and h["replaced_by"] for h in hist)
          and any(h["is_primary"] and h["source_type"] == "supplier_original" for h in hist), f"peça {s1[0]['public_code']} intacta; foto antiga guardada como substituída")

    # 18. privacidade (chave pública)
    leaks = [t for t in ("products", "import_items", "import_pages", "import_batches", "product_media", "product_source_references", "product_quality_flags", "suppliers", "catalogs")
             if anon_get(t, {"select": "*", "limit": "1"})]
    pub = anon_get("public_products", {"select": "id", "id": in_list(pids[:150])}) if pids else []
    check("PRIVACIDADE", not leaks and not pub, "nenhuma tabela interna nem peça do piloto visível com a chave pública" if not leaks and not pub else f"vazamento: {leaks or 'peças públicas'}")

    # 13–14. métricas reais
    print("\nMÉTRICAS REAIS DO LOTE")
    g = m.get("grupos", {})
    for k, v in [("Páginas processadas", b["total_pages"]), ("Produtos únicos criados", m.get("produtos_unicos_estimados")), ("Registros criados", len(pids)),
                 ("Prontos", g.get("pronta")), ("Prontos com observação", g.get("pronta_com_observacao")), ("Com intervenção necessária", g.get("intervencao")),
                 ("Páginas informativas", m.get("paginas_informativas")), ("Imagens extraídas", len(media)), *[(k2, v2) for k2, v2 in (m.get("imagens_por_nota") or {}).items()],
                 ("Duplicidades sinalizadas", flagset("SAME_CODE_DUPLICATE") + flagset("POSSIBLE_DUPLICATE")), ("Classificações incertas", flagset("TAXONOMY_REVIEW_REQUIRED")),
                 ("Sem medidas", flagset("NO_DIMENSIONS")), ("Sem imagem", flagset("NO_IMAGE")), ("Erros", m.get("falhas_ao_gravar"))]:
        print(f"  {k}: {v}")
    print("  Lado maior (todas):", m.get("tamanho_todas"))
    print("  Características (todas):", m.get("caracteristicas_todas"))

    write_sample(bid, a.report)
    finish(a)


def write_sample(bid, path):
    """20 peças variadas para revisão visual (preferindo tipos diferentes, transparência, variantes e duplicidade)."""
    items = rest("GET", "import_items", {"batch_id": f"eq.{bid}", "select": "product_id,title_page,flags,extracted", "limit": "5000"}) or []
    by_type = {}
    for it in items:
        t = (it["extracted"].get("classification") or {}).get("type") or "—"
        by_type.setdefault(t, []).append(it)
    pick = []
    for t, lst in sorted(by_type.items(), key=lambda x: -len(x[1])):
        pick += lst[:3]
    pick += [it for it in items if "SAME_CODE_DUPLICATE" in it["flags"]][:2] + [it for it in items if len(it["extracted"].get("variants") or []) > 4][:2]
    seen, sample = set(), []
    for it in pick:
        if it["product_id"] and it["product_id"] not in seen:
            seen.add(it["product_id"])
            sample.append(it)
    sample = sample[:20]
    rows = []
    for it in sample:
        p = rest("GET", "products", {"id": f"eq.{it['product_id']}", "select": "name,public_code"})[0]
        med = rest("GET", "product_media", {"product_id": f"eq.{it['product_id']}", "is_primary": "eq.true", "status": "eq.active", "select": "url,quality,width,height,background"})
        ex = it["extracted"]
        rows.append(f"""<tr><td>{f'<img src="{med[0]["url"]}" width="180">' if med else '—'}</td><td><b>{html.escape(p['name'])}</b><br>{p['public_code'] or 'sem código'}</td>
<td>{html.escape(', '.join(c['code'] for c in ex.get('original_codes') or []) or '—')}</td><td>{(ex.get('classification') or {}).get('type') or '—'} {(ex.get('classification') or {}).get('subtype') or ''}</td>
<td>{len(ex.get('variants') or [])}<br><small>{html.escape('; '.join(v['name'] for v in (ex.get('variants') or [])[:4]))}</small></td><td>{it['title_page']}</td>
<td>{(med[0]['quality'] + ' ' + str(med[0]['width']) + '×' + str(med[0]['height']) + ' · ' + str(med[0]['background'])) if med else '—'}</td><td>{html.escape(', '.join(it['flags']) or 'nenhuma')}</td></tr>""")
    with open(path, "w") as fh:
        fh.write("<meta charset=utf-8><title>Amostra do piloto real</title><style>body{font-family:sans-serif}td{border-bottom:1px solid #ddd;padding:6px;vertical-align:top;font-size:13px}</style>"
                 "<h1>Amostra do piloto real — 20 peças</h1><table><tr><th>Imagem</th><th>Nome / código Casa Áurea</th><th>Código original</th><th>Tipo</th><th>Medidas</th><th>Página</th><th>Qualidade</th><th>Pendências</th></tr>"
                 + "".join(rows) + "</table>")
    print(f"\nAmostra salva em {path}")


def finish(a):
    print("\nRELATÓRIO")
    for name, ok, _ in RESULTS:
        print(f"{name} — {'✅' if ok else '❌'}")
    failed = [r for r in RESULTS if not r[1]]
    print("\nPIPELINE V1 — " + ("APROVADO PARA ESCALA" if not failed else f"{len(failed)} verificação(ões) falharam"))


if __name__ == "__main__":
    main()
