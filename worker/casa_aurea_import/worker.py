"""Pipeline de importação de catálogos — Casa Áurea.

Uso local (piloto, sem banco):
    python -m casa_aurea_import.worker --pdf catalogo.pdf --supplier "Brazil Contemporâneo" \
        --catalog "Catálogo 2026" --year 2026 --out ./saida

Uso em produção (grava no Supabase; ver sink.py):
    python -m casa_aurea_import.worker --batch <import_batch_id> --supabase

Processa em blocos de páginas com checkpoint: se parar na página 378 de 800, retoma da 379.
Nenhuma peça é publicada: tudo nasce INTERNAL + ARCHIVE.
"""
from __future__ import annotations

import argparse
import re
import hashlib
import json
import os
import time

from . import extract
from .assemble import assemble, structure
from .classify import THRESHOLD, classify, norm
from .quality import assess, compose, hamming, phash, save_web

FLAGS = {
    # precisam de intervenção humana antes da curadoria
    "NO_IMAGE": "Sem imagem",
    "IMAGE_REVIEW_REQUIRED": "Imagem a conferir",
    "NO_NAME": "Sem nome",
    "NO_TYPE": "Sem tipo",
    "TAXONOMY_REVIEW_REQUIRED": "Classificação incerta",
    "NO_DIMENSIONS": "Sem medidas",
    "MISSING_ORIGINAL_CODE": "Sem código original",
    "SAME_CODE_DUPLICATE": "Mesmo produto / mesmo código",
    "POSSIBLE_DUPLICATE": "Possível duplicidade",
    "MULTIPLE_PRODUCTS_UNCERTAIN": "Vários produtos na página",
    "POSSIBLE_NON_PRODUCT": "Possível página informativa",
    "IMPORT_ERROR": "Importação com erro",
    "NAME_REVIEW_REQUIRED": "Nome a conferir (lido por OCR)",
    # observações: não impedem a curadoria
    "IMAGE_UPGRADE_RECOMMENDED": "Foto só para miniatura (substituir quando houver original)",
    "VARIANT_CODES_TO_CONFIRM": "Vários códigos (opções do mesmo modelo)",
    "RELATED_VARIATION": "Variação real de outro item",
    "CATALOG_WITHOUT_CODES": "Catálogo sem código do fornecedor",
    "DIMENSIONS_PARTIAL": "Medidas parciais (só larguras)",
    "DIMENSIONS_IN_DRAWING": "Medidas só no desenho técnico",
}
BLOCKING = {"NO_IMAGE", "IMAGE_REVIEW_REQUIRED", "NO_NAME", "NO_TYPE", "TAXONOMY_REVIEW_REQUIRED", "NO_DIMENSIONS", "MISSING_ORIGINAL_CODE",
            "SAME_CODE_DUPLICATE", "POSSIBLE_DUPLICATE", "MULTIPLE_PRODUCTS_UNCERTAIN", "POSSIBLE_NON_PRODUCT", "IMPORT_ERROR", "NAME_REVIEW_REQUIRED"}
ADVISORY = set(FLAGS) - BLOCKING
DUP_CATEGORIES = {"SAME_CODE": "Mesmo produto / mesmo código", "REAL_VARIATION": "Variação real",
                  "SAME_NAME_DIFFERENT_PRODUCT": "Mesmo nome / produto diferente", "POSSIBLE_DUPLICATE": "Possível duplicidade"}


def idem_key(supplier: str, catalog: str, page: int, codes: list[str], name: str) -> str:
    """Chave de idempotência: reprocessar o mesmo catálogo encontra a mesma peça em vez de duplicar."""
    base = "|".join([norm(supplier), norm(catalog), str(page), ",".join(sorted(codes)) or norm(name)])
    return hashlib.sha1(base.encode()).hexdigest()[:16]


def run(pdf: str, supplier: str, catalog: str, year: int | None, out: str, chunk: int = 25) -> dict:
    t0 = time.time()
    os.makedirs(out, exist_ok=True)
    if not has_text_layer(pdf) and not cutout_catalog(pdf):
        # páginas inteiras em imagem (sem fotos recortadas): OCR + recorte da página
        return run_raster(pdf, supplier, catalog, year, out, t0)
    ckpt_path = os.path.join(out, "checkpoint.json")
    ckpt = json.load(open(ckpt_path)) if os.path.exists(ckpt_path) else {"next_page": 1, "pages": []}
    total = extract.page_count(pdf)
    img_dir = os.path.join(out, "_embedded")

    # 1) leitura página a página, em blocos, com checkpoint
    pages_cache = os.path.join(out, "pages.jsonl")
    while ckpt["next_page"] <= total:
        start, end = ckpt["next_page"], min(ckpt["next_page"] + chunk - 1, total)
        with open(pages_cache, "a") as fh:
            for pg in extract.read_pages(pdf, img_dir, start, end):
                fh.write(json.dumps({
                    "number": pg.number, "width": pg.width, "height": pg.height, "has_text": pg.has_text,
                    "rows": [r.__dict__ for r in pg.rows],
                    "images": [{"objid": i.objid, "bbox": i.bbox, "width": i.width, "height": i.height, "files": i.files} for i in pg.images],
                }) + "\n")
        ckpt["next_page"] = end + 1
        json.dump(ckpt, open(ckpt_path, "w"))
        print(f"  páginas {start}–{end} de {total}")

    pages = []
    for line in open(pages_cache):
        d = json.loads(line)
        pages.append(extract.PageData(d["number"], d["width"], d["height"], [extract.Row(**r) for r in d["rows"]],
                                      [extract.PageImage(i["objid"], tuple(i["bbox"]), i["width"], i["height"], i["files"]) for i in d["images"]],
                                      d["has_text"]))
    pages.sort(key=lambda p: p.number)

    products, page_stats, metrics = analyze(pages, supplier, catalog, year, out, pdf)
    metrics["paginas"] = total
    metrics["tempo_segundos"] = round(time.time() - t0, 1)
    json.dump({"supplier": supplier, "catalog": catalog, "year": year, "source_file": os.path.basename(pdf),
               "metrics": metrics, "page_stats": page_stats, "products": products},
              open(os.path.join(out, "batch.json"), "w"), ensure_ascii=False, indent=1, default=str)
    return metrics


def cutout_catalog(pdf: str) -> bool:
    """Fotos de peça incorporadas com transparência (texto em curvas): segue o caminho normal (layout J)."""
    import subprocess
    out = subprocess.run(["pdfimages", "-list", pdf], capture_output=True, text=True).stdout.splitlines()[2:]
    kinds = [l.split()[2] for l in out if len(l.split()) > 2]
    return kinds.count("smask") >= max(20, 0.3 * kinds.count("image"))


def has_text_layer(pdf: str, sample: int = 8) -> bool:
    import pdfplumber
    with pdfplumber.open(pdf) as doc:
        return any(len(pg.chars) > 20 for pg in doc.pages[:sample])


def run_raster(pdf, supplier, catalog, year, out, t0):
    """Catálogo sem texto nativo: OCR + recorte da página (nível 2), mesmas regras e mesma saída."""
    from .raster import analyze_raster
    products, page_stats = analyze_raster(pdf, supplier, catalog, out)
    relate(products)
    has_codes = any(p["original_codes"] for p in products)
    for p in products:
        compute_flags(p, has_codes)
    metrics = batch_metrics(products, page_stats)
    metrics.update({"paginas": len(page_stats["no_text_pages"]), "tempo_segundos": round(time.time() - t0, 1), "modo": "rasterizado (OCR + recorte)", "dpi_nativo": page_stats["dpi"]})
    metrics["tipos"] = {}
    for p in products:
        t = p["classification"]["type"] or "—"
        metrics["tipos"][t] = metrics["tipos"].get(t, 0) + 1
    for p in products:
        for m in p["media"]:
            m.pop("crop_box", None)
    json.dump({"supplier": supplier, "catalog": catalog, "year": year, "source_file": os.path.basename(pdf), "metrics": metrics,
               "page_stats": page_stats, "products": products}, open(os.path.join(out, "batch.json"), "w"), ensure_ascii=False, indent=1, default=str)
    return metrics


def analyze(pages, supplier: str, catalog: str, year, out: str, pdf: str | None = None):
    """Detecção, estruturação, mídia, duplicidade, pendências e métricas a partir das páginas lidas."""
    t0 = time.time()
    total = len(pages)
    # 2) detecção e estruturação das peças
    from .layout_d import count_labels, assemble_d
    env = None
    from .layout_f import count_labels as count_f, assemble_f
    from .layout_h import count_anchors, assemble_h
    from .layout_k import count_pages as count_k, assemble_k
    if count_k(pages) >= max(8, 0.5 * len(pages)):
        # páginas inteiras em imagem com a ficha desenhada (OCR na imagem incorporada) (layout K)
        candidates, page_stats = assemble_k(pages, out)
    elif count_anchors(pages) >= max(5, 0.3 * len(pages)):
        # folder: rótulo do tipo + nome grande + '– CÓDIGO' (layout H)
        candidates, page_stats = assemble_h(pages)
    elif count_labels(pages) >= max(10, 0.25 * len(pages)):
        # coleção por linha com desenhos rotulados ('Alberto 01'): uma peça por desenho (layout D)
        candidates, page_stats = assemble_d(pages)
    elif __import__("casa_aurea_import.layout_g", fromlist=["x"]).count_entries(pages) >= max(6, 0.3 * len(pages)):
        # fichas 'CÓDIGO' + 'NOME — medidas' (layout G)
        from .layout_g import assemble_g
        candidates, page_stats = assemble_g(pages)
    elif count_f(pages) >= max(10, 0.2 * len(pages)):
        # rótulo 'Tipo + número' com quadro de medidas (layout F)
        candidates, page_stats = assemble_f(pages)
    elif __import__("casa_aurea_import.layout_i", fromlist=["x"]).count_titles(pages) >= max(8, 0.25 * len(pages)):
        # título 'Mesa Bergen' + linhas de especificação, várias peças por página (layout I)
        from .layout_i import assemble_i
        candidates, page_stats = assemble_i(pages)
    else:
        candidates, page_stats = assemble(pages)
    if pdf and page_stats.get("layout") not in ("D", "F", "G", "H", "I", "K") and len(candidates) < 0.1 * len(pages):
        from .layout_j import candidate_pages, assemble_j
        if candidate_pages(pages) >= max(5, 0.25 * len(pages)):
            # grade de fotos recortadas com legenda em curvas (OCR) (layout J)
            j_c, j_s = assemble_j(pdf, pages, out)
            if len(j_c) > len(candidates):
                candidates, page_stats = j_c, j_s
    if page_stats.get("layout") not in ("D", "F", "G", "H", "I", "J", "K") and len(candidates) < 0.1 * len(pages):
        # títulos em caixa mista e ficha na própria página: leitura ancorada nos códigos (layout B)
        from .layout_b import assemble_b
        candidates, page_stats = assemble_b(pages)
        env = page_stats.get("catalog_environment")
        useful = sum(1 for c in candidates if c.data["classification"]["type"] or c.data["variants"])
        if pdf and useful < 0.3 * max(1, len(candidates)):
            # catálogo editorial: peça descrita por bloco de texto, medidas só no desenho (layout C)
            from .layout_c import assemble_c
            c_cands, c_stats = assemble_c(pdf, pages, out)
            if len(c_cands) >= useful:
                candidates, page_stats, env = c_cands, c_stats, None
    if page_stats.get("layout") not in ("D", "F", "G", "H", "I", "J", "K") and len(candidates) < 0.1 * len(pages):
        # uma peça por página com título pequeno e fotos em colagem (layout E)
        from .layout_e import assemble_e
        e_cands, e_stats = assemble_e(pages, out)
        if len(e_cands) > len(candidates):
            candidates, page_stats, env = e_cands, e_stats, None
    products = []
    media_dir = os.path.join(out, "media")
    # o corpo de fonte típico dos códigos é aprendido no próprio catálogo (códigos com rótulo 'COD.')
    sizes = [cd["size"] for c in candidates for cd in structure(c)["codes"] if cd["via"] == "rotulo"]
    code_size = max(set(sizes), key=sizes.count) if len(sizes) >= 5 else None
    from .layout_b import structure_b
    cache_path = os.path.join(out, "_media_cache.json")
    mcache = json.load(open(cache_path)) if os.path.exists(cache_path) else {}
    for ci, c in enumerate(candidates):
        if ci % 20 == 0:
            json.dump(mcache, open(cache_path, "w"))
        lay = getattr(c, "layout", "A")
        if lay == "C":
            from .layout_c import structure_c
            data = structure_c(c)
        elif lay == "D":
            from .layout_d import structure_d
            data = structure_d(c)
        elif lay == "K":
            from .layout_k import structure_k
            data = structure_k(c)
        elif lay == "J":
            from .layout_j import structure_j
            data = structure_j(c)
        elif lay == "I":
            from .layout_i import structure_i
            data = structure_i(c)
        elif lay == "H":
            from .layout_h import structure_h
            data = structure_h(c)
        elif lay == "G":
            from .layout_g import structure_g
            data = structure_g(c)
        elif lay == "F":
            from .layout_f import structure_f
            data = structure_f(c)
        elif lay == "E":
            from .layout_e import structure_e
            data = structure_e(c)
        else:
            data = structure_b(c, env) if lay == "B" else structure(c, code_size)
        codes = [cd["code"] for cd in data["codes"]]
        key = idem_key(supplier, catalog, c.title_page, codes, c.name)
        media, seen_hash = [], []
        for im in c.images:
            try:
                img = compose(im["files"])
                if img is None:
                    continue
                ck = im["files"].get("image", "") + "|" + str(im["files"].get("smask", ""))
                if ck in mcache:
                    q, h = mcache[ck]
                else:
                    q = assess(img, im["files"], im["bbox"], im.get("source_type", "embedded_original"))
                    h = phash(img)
                    mcache[ck] = [q, h]
                if any(hamming(h, s) <= 3 for s in seen_hash):   # mesma foto repetida na peça
                    continue
                seen_hash.append(h)
                stem = os.path.splitext(os.path.basename(im["files"]["image"]))[0] if im.get("source_type") == "page_crop" else f"p{im['page']:03d}-o{im['objid']}"
                path = save_web(img, os.path.join(media_dir, key, stem))   # recortes da mesma colagem não se sobrescrevem
                area = (im["bbox"][2] - im["bbox"][0]) * (im["bbox"][3] - im["bbox"][1]) if im.get("bbox") else im["w"] * im["h"]
                media.append({**q, "phash": h, "page": im["page"], "path": os.path.relpath(path, out), "area": area, "hint": im.get("hint")})
            except Exception as e:  # imagem corrompida não derruba a peça
                media.append({"error": str(e), "page": im["page"]})
        good_media = [m for m in media if "error" not in m]
        # principal: a maior imagem da página-título (a foto inteira da peça); depois a galeria
        # principal: maior imagem utilizável da página-título; se não houver, a melhor das demais páginas
        usable = [m for m in good_media if m["quality"] != "REJECTED"]
        # foto do produto (recorte/fundo liso) tem preferência sobre foto de ambiente para ser a principal
        title_imgs = sorted([m for m in usable if m["page"] == c.title_page], key=lambda m: (m.get("hint") == "extra", m.get("background") == "foto com ambiente", -m["area"]))
        primary = title_imgs[0] if title_imgs else (sorted(usable, key=lambda m: (-m["long_side"], -m["area"]))[0] if usable
                                                    else (sorted(good_media, key=lambda m: -m["area"])[0] if good_media else None))
        for m in good_media:
            m["role"] = "primary" if m is primary else "gallery"
        products.append({
            "key": key, "name": c.name, "supplier": supplier, "catalog": catalog, "year": year,
            "title_page": c.title_page, "pages": c.pages, "header": c.header, "section": c.section,
            "designer": data["designer"], "original_codes": data["codes"], "variants": data["variants"],
            "materials": data["materials"], "finishes": data["finishes"], "classification": data["classification"],
            "description": data.get("description"), "collection_original": data.get("collection_original"),
            "environment": data.get("environment") or "indoor", "environment_reason": data.get("environment_reason"),
            "ocr": bool(data.get("ocr_name")), "name_confidence": data.get("name_confidence", 100) if lay in ("C", "J", "K") else None,
            "fabric_ref": data.get("fabric_ref"), "drawing_numbers": data.get("drawing_numbers"), "layout": lay,
            "media": sorted(good_media, key=lambda m: (m["role"] != "primary", m["page"], -m["area"])),
            "media_errors": [m for m in media if "error" in m], "multi_on_page": c.multi_on_page,
            "visibility": "internal", "curation_tier": "archive",
        })

    json.dump(mcache, open(cache_path, "w"))
    # 3) relações entre itens (sinal; nunca mescla), em quatro categorias
    relate(products)

    # 4) pendências (bloqueantes × observações) e notas internas
    has_codes = any(p["original_codes"] for p in products)
    has_dims = any(p["variants"] for p in products)
    for p in products:
        compute_flags(p, has_codes, has_dims)

    # 5) métricas do lote (grupos mutuamente exclusivos)
    metrics = batch_metrics(products, page_stats)
    metrics["tempo_segundos"] = round(time.time() - t0, 1)
    metrics["tipos"] = {}
    for p in products:
        t = p["classification"]["type"] or "—"
        metrics["tipos"][t] = metrics["tipos"].get(t, 0) + 1
    return products, page_stats, metrics


def relate(products):
    """Classifica pares em: mesmo código, variação real, mesmo nome/produto diferente, possível duplicidade."""
    for p in products:
        p["relations"] = []
        p["duplicates"] = []
    def link(a, b, cat, why):
        a["relations"].append({"key": b["key"], "name": b["name"], "page": b["title_page"], "category": cat, "reason": why})
        b["relations"].append({"key": a["key"], "name": a["name"], "page": a["title_page"], "category": cat, "reason": why})
    prim = {p["key"]: next((m for m in p["media"] if m["role"] == "primary"), None) for p in products}
    for i, a in enumerate(products):
        for b in products[i + 1:]:
            ca = {c["code"] for c in a["original_codes"]}
            cb = {c["code"] for c in b["original_codes"]}
            # nome lido por OCR com baixa confiança não serve para relacionar peças
            trusted = lambda x: x["name"] and not (x.get("ocr") and x.get("name_confidence", 0) < 85)
            same_name = trusted(a) and trusted(b) and norm(a["name"]) == norm(b["name"])
            same_type = a["classification"]["type"] == b["classification"]["type"] and a["classification"]["subtype"] == b["classification"]["subtype"]
            ma, mb = prim[a["key"]], prim[b["key"]]
            close_img = bool(ma and mb and hamming(ma["phash"], mb["phash"]) <= 6)
            dims_a = {(v["width_cm"], v["depth_cm"], v["height_cm"], v["diameter_cm"]) for v in a["variants"]}
            dims_b = {(v["width_cm"], v["depth_cm"], v["height_cm"], v["diameter_cm"]) for v in b["variants"]}
            if ca & cb:
                link(a, b, "SAME_CODE", "código original " + ", ".join(sorted(ca & cb)))
            elif same_name and same_type and not ca and not cb:
                # catálogo sem código: mesmo nome e tipo = a mesma peça mostrada em outra composição
                link(a, b, "SAME_CODE", "mesmo nome e tipo (catálogo sem código)")
            elif same_name and same_type and ca and cb:
                link(a, b, "REAL_VARIATION", "mesmo modelo, códigos e/ou medidas diferentes")
            elif same_name and not same_type:
                link(a, b, "SAME_NAME_DIFFERENT_PRODUCT", f"{a['classification']['type'] or '—'} × {b['classification']['type'] or '—'}")
            elif close_img or (same_name and same_type and dims_a & dims_b):
                link(a, b, "POSSIBLE_DUPLICATE", "foto muito semelhante" if close_img else "mesmo nome, tipo e medidas, sem código para diferenciar")
    for p in products:
        p["duplicates"] = [r for r in p["relations"] if r["category"] in ("SAME_CODE", "POSSIBLE_DUPLICATE")]


def compute_flags(p, catalog_has_codes: bool | None = None, catalog_has_dims: bool | None = None):
    f = []
    prim_m = next((m for m in p["media"] if m["role"] == "primary"), None)
    if not prim_m or prim_m["quality"] == "REJECTED":
        f.append("NO_IMAGE")
    elif prim_m["quality"] == "EDITORIAL_REVIEW":
        f.append("IMAGE_REVIEW_REQUIRED")
    elif prim_m["quality"] == "DETAIL_ACCEPTABLE":
        f.append("IMAGE_UPGRADE_RECOMMENDED")
    if not p["name"]:
        f.append("NO_NAME")
    cls = p["classification"]
    if not cls["type"]:
        f.append("NO_TYPE")
    elif cls["confidence"] < THRESHOLD:
        f.append("TAXONOMY_REVIEW_REQUIRED")
    if not p["variants"]:
        f.append("NO_DIMENSIONS")
    if not p["original_codes"]:
        f.append("MISSING_ORIGINAL_CODE")
    if len(p["original_codes"]) > 1:
        f.append("VARIANT_CODES_TO_CONFIRM")
    cats = {r["category"] for r in p.get("relations", [])}
    if "SAME_CODE" in cats:
        f.append("SAME_CODE_DUPLICATE")
    if "POSSIBLE_DUPLICATE" in cats:
        f.append("POSSIBLE_DUPLICATE")
    if "REAL_VARIATION" in cats:
        f.append("RELATED_VARIATION")
    if p.get("multi_on_page"):
        f.append("MULTIPLE_PRODUCTS_UNCERTAIN")
    if p.get("media_errors"):
        f.append("IMPORT_ERROR")
    if p.get("ocr"):
        tokens = (p.get("name") or "").split()
        if p.get("name_confidence", 0) < 85 or not tokens or any(len(t) < 3 for t in tokens):
            f.append("NAME_REVIEW_REQUIRED")
        if p["variants"] and all(v["depth_cm"] is None and v["height_cm"] is None for v in p["variants"]):
            f.append("DIMENSIONS_PARTIAL")
        if not p["media"] and not p["variants"]:
            f.append("POSSIBLE_NON_PRODUCT")
    elif p.get("layout") == "H":
        if not p["media"] and not p["original_codes"]:
            f.append("POSSIBLE_NON_PRODUCT")
    elif p.get("layout") in ("D", "E", "I"):
        if not p["media"]:
            f.append("POSSIBLE_NON_PRODUCT")
    elif p.get("name_confidence") is not None:
        if not p["media"] and not p["name"]:
            f.append("POSSIBLE_NON_PRODUCT")     # layout C: a peça é o bloco descritivo; sem foto e sem nome = suspeita
    elif not p["variants"] and not p["original_codes"]:
        # catálogo sem código e sem medida (só nome + foto): página informativa é a de seção ou acabamentos, ou sem foto
        sparse = catalog_has_codes is False and catalog_has_dims is False
        if not sparse or not p["media"] or re.match(r"^(mesas|cadeiras|poltronas|sof[aá]s|aparadores|acabamentos|cole[cç][aã]o|linha)\b", norm(p["name"])):
            f.append("POSSIBLE_NON_PRODUCT")
    if p.get("name_confidence") is not None and not p.get("ocr") and (not p["name"] or p["name_confidence"] < 85):
        f.append("NAME_REVIEW_REQUIRED")
    if "NO_DIMENSIONS" in f and p.get("drawing_numbers"):
        f[f.index("NO_DIMENSIONS")] = "DIMENSIONS_IN_DRAWING"   # medidas existem, mas só no desenho técnico
    if catalog_has_codes is False and "MISSING_ORIGINAL_CODE" in f:
        f[f.index("MISSING_ORIGINAL_CODE")] = "CATALOG_WITHOUT_CODES"   # o fornecedor não usa código: não é pendência da peça
    p["flags"] = f
    p["blocking"] = [x for x in f if x in BLOCKING]
    p["advisory"] = [x for x in f if x in ADVISORY]
    img_q = {"CATALOG_READY": 1.0, "DETAIL_ACCEPTABLE": 0.7, "EDITORIAL_REVIEW": 0.4, "REJECTED": 0.0}[prim_m["quality"]] if prim_m else 0.0
    fields = [bool(p["name"]), bool(cls["type"]), bool(p["variants"]), bool(p["original_codes"]), bool(prim_m), bool(p["materials"] or p["finishes"])]
    p["scores"] = {"image_quality": img_q, "data_completeness": round(sum(fields) / len(fields), 2), "taxonomy_confidence": cls["confidence"]}
    if "POSSIBLE_NON_PRODUCT" in f:
        p["bucket"] = "informativa"
    elif p["blocking"]:
        p["bucket"] = "intervencao"
    elif p["advisory"]:
        p["bucket"] = "pronta_com_observacao"
    else:
        p["bucket"] = "pronta"
    p["complete"] = p["bucket"] in ("pronta", "pronta_com_observacao")


def reclassify(products):
    """Reprocessa só a classificação (ex.: após cadastrar tipos novos). Não reimporta nada."""
    changed = []
    for p in products:
        if not ({"NO_TYPE", "TAXONOMY_REVIEW_REQUIRED"} & set(p["flags"])):
            continue
        before = dict(p["classification"])
        p["classification"] = classify(p.get("header"), p.get("name"), p.get("section"))
        if p["classification"] != before:
            changed.append((p["title_page"], p["name"], f"{before['type']} {before['confidence']}", f"{p['classification']['type']} {p['classification']['confidence']}"))
    relate(products)
    for p in products:
        compute_flags(p)
    return changed


def batch_metrics(products, page_stats):
    all_media = [m for p in products for m in p["media"]]
    prim = [m for p in products for m in p["media"] if m["role"] == "primary"]
    real = [p for p in products if p["bucket"] != "informativa"]
    def bucket_ls(ms):
        out = {"<500": 0, "500–799": 0, "800–1199": 0, "1200–1999": 0, "2000+": 0}
        for m in ms:
            L = m["long_side"]
            out["<500" if L < 500 else "500–799" if L < 800 else "800–1199" if L < 1200 else "1200–1999" if L < 2000 else "2000+"] += 1
        return out
    def chars(ms):
        return {"transparente": sum(1 for m in ms if m["background"] == "transparente"), "fundo sólido": sum(1 for m in ms if m["background"] == "fundo sólido"),
                "foto com ambiente": sum(1 for m in ms if m["background"] == "foto com ambiente"), "com texto incorporado": sum(1 for m in ms if m["has_text"]),
                "marca d'água": sum(1 for m in ms if m["watermark"]), "imagem limpa": sum(1 for m in ms if not m["has_text"] and not m["watermark"])}
    same_code_groups = []
    for p in real:
        keys = {p["key"]} | {r["key"] for r in p["relations"] if r["category"] == "SAME_CODE"}
        if len(keys) > 1 and keys not in same_code_groups:
            same_code_groups.append(keys)
    unique = len(real) - sum(len(g) - 1 for g in same_code_groups)
    pairs = {}
    for p in products:
        for r in p["relations"]:
            k = tuple(sorted([p["key"], r["key"]])) + (r["category"],)
            pairs[k] = r["category"]
    return {
        "paginas_de_produto": len({pg for p in products for pg in p["pages"]}),
        "paginas_de_abertura": len(page_stats["opener_pages"]), "paginas_ignoradas": len(page_stats["skipped_pages"]),
        "itens_na_fila": len(products), "produtos": len(real), "paginas_informativas": len(products) - len(real),
        "produtos_unicos_estimados": unique,
        "grupos": {"pronta": sum(1 for p in real if p["bucket"] == "pronta"),
                   "pronta_com_observacao": sum(1 for p in real if p["bucket"] == "pronta_com_observacao"),
                   "intervencao": sum(1 for p in real if p["bucket"] == "intervencao")},
        "bloqueantes": {FLAGS[k]: sum(1 for p in real if k in p["flags"]) for k in BLOCKING if any(k in p["flags"] for p in real)},
        "observacoes": {FLAGS[k]: sum(1 for p in real if k in p["flags"]) for k in ADVISORY if any(k in p["flags"] for p in real)},
        "pendencias_por_produto": {str(n): sum(1 for p in real if len(p["blocking"]) == n) for n in range(0, 6)},
        "relacoes": {DUP_CATEGORIES[c]: sum(1 for v in pairs.values() if v == c) for c in DUP_CATEGORIES},
        "imagens": len(all_media), "embedded_original": sum(1 for m in all_media if m["source_type"] == "embedded_original"),
        "page_crop": sum(1 for m in all_media if m["source_type"] == "page_crop"),
        "imagens_por_nota": {g: sum(1 for m in all_media if m["quality"] == g) for g in ("CATALOG_READY", "DETAIL_ACCEPTABLE", "EDITORIAL_REVIEW", "REJECTED")},
        "principais_por_nota": {g: sum(1 for m in prim if m["quality"] == g) for g in ("CATALOG_READY", "DETAIL_ACCEPTABLE", "EDITORIAL_REVIEW", "REJECTED")},
        "aptas_para_destaque": sum(1 for m in prim if m["hero_ready"]),
        "tamanho_todas": bucket_ls(all_media), "tamanho_principais": bucket_ls(prim),
        "caracteristicas_todas": chars(all_media), "caracteristicas_principais": chars(prim),
        "variantes": sum(len(p["variants"]) for p in real), "codigos_originais": sum(len(p["original_codes"]) for p in real),
        "erros": sum(1 for p in products if "IMPORT_ERROR" in p["flags"]),
    }


def main():
    ap = argparse.ArgumentParser(description="Importação de catálogo PDF — Casa Áurea")
    ap.add_argument("--pdf"); ap.add_argument("--supplier"); ap.add_argument("--catalog"); ap.add_argument("--year", type=int)
    ap.add_argument("--out", default="./saida-importacao"); ap.add_argument("--chunk", type=int, default=25)
    ap.add_argument("--batch", help="id do lote no Supabase (modo produção)"); ap.add_argument("--supabase", action="store_true")
    ap.add_argument("--reclassify", help="batch.json local: reprocessa só a classificação dos itens com tipo ausente/incerto")
    a = ap.parse_args()
    if a.reclassify:
        data = json.load(open(a.reclassify))
        changed = reclassify(data["products"])
        data["metrics"].update(batch_metrics(data["products"], data["page_stats"]))
        json.dump(data, open(a.reclassify, "w"), ensure_ascii=False, indent=1, default=str)
        print(json.dumps(changed, ensure_ascii=False, indent=1))
        return
    if a.supabase:
        from .sink import run_batch
        run_batch(a.batch, chunk=a.chunk)
        return
    m = run(a.pdf, a.supplier, a.catalog, a.year, a.out, a.chunk)
    print(json.dumps(m, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
