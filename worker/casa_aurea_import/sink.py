"""Modo produção: processa lotes da fila do painel e grava no Supabase.

    SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… python -m casa_aurea_import.sink --loop

- Pega o lote mais antigo em 'queued' (ou um lote 'processing' sem sinal de vida há 10 min).
- Lê o PDF por blocos de páginas; após cada página grava import_pages e avança next_page (checkpoint).
- Respeita "Pausar" (pause_requested) entre páginas; "Retomar" devolve o lote à fila e continua de next_page.
- Cria as peças pelo caminho oficial: o código Casa Áurea vem do gatilho do banco. Tudo INTERNAL + ARCHIVE.
- Idempotente: import_items (catálogo + chave) impede duplicar ao reprocessar.
Sem dependências além das do pipeline (usa urllib).
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import socket
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from . import extract
import hashlib

from .classify import THRESHOLD, classify, norm
from .quality import assess, compose, hamming, phash
from .worker import BLOCKING, analyze, compute_flags

URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
WORKDIR = os.environ.get("IMPORT_WORKDIR", "/tmp/casa-aurea-import")
WORKER_ID = f"{socket.gethostname()}-{os.getpid()}"
FLAG_TO_DB = {"POSSIBLE_DUPLICATE": "possibleDuplicate", "SAME_CODE_DUPLICATE": "possibleDuplicate"}
PAGE_DPI = 100   # miniatura legível para "ver página original"


def now():
    return datetime.now(timezone.utc).isoformat()


def _req(method: str, url: str, body=None, headers=None, raw: bytes | None = None, timeout=120):
    h = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}
    h.update(headers or {})
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    if raw is None and body is not None:
        h.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                out = r.read()
                return json.loads(out) if out and r.headers.get("Content-Type", "").startswith("application/json") else out
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < 3:
                time.sleep(2 ** attempt)
                continue
            raise RuntimeError(f"{method} {url} → {e.code}: {e.read().decode(errors='ignore')[:400]}")
        except urllib.error.URLError:
            if attempt < 3:
                time.sleep(2 ** attempt)
                continue
            raise


def rest(method, table, params=None, body=None, prefer="return=representation"):
    q = ("?" + urllib.parse.urlencode(params, safe="(),.*:")) if params else ""
    return _req(method, f"{URL}/rest/v1/{table}{q}", body, {"Prefer": prefer})


def upload(bucket, path, file_path):
    ctype = mimetypes.guess_type(file_path)[0] or "application/octet-stream"
    with open(file_path, "rb") as fh:
        _req("POST", f"{URL}/storage/v1/object/{bucket}/{urllib.parse.quote(path)}", raw=fh.read(),
             headers={"Content-Type": ctype, "x-upsert": "true", "cache-control": "31536000"})
    return f"{URL}/storage/v1/object/public/{bucket}/{urllib.parse.quote(path)}"


def upload_private(bucket, path, file_path):
    ctype = mimetypes.guess_type(file_path)[0] or "application/octet-stream"
    with open(file_path, "rb") as fh:
        _req("POST", f"{URL}/storage/v1/object/{bucket}/{urllib.parse.quote(path)}", raw=fh.read(), headers={"Content-Type": ctype, "x-upsert": "true"})
    return path


def download(bucket, path, dest):
    data = _req("GET", f"{URL}/storage/v1/object/{bucket}/{urllib.parse.quote(path)}", timeout=600)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "wb") as fh:
        fh.write(data)


def update_batch(bid, **fields):
    rest("PATCH", "import_batches", {"id": f"eq.{bid}"}, {**fields, "heartbeat_at": now()}, prefer="return=minimal")


def claim_next():
    """Lote na fila, ou lote interrompido (sem sinal de vida há 10 minutos)."""
    rows = rest("GET", "import_batches", {"kind": "eq.pdf", "status": "in.(queued,processing)", "order": "created_at.asc",
                                          "select": "id,status,heartbeat_at"})
    for b in rows or []:
        stale = b["status"] == "processing" and (not b["heartbeat_at"] or
                (datetime.now(timezone.utc) - datetime.fromisoformat(b["heartbeat_at"].replace("Z", "+00:00"))).total_seconds() > 600)
        if b["status"] == "queued" or stale:
            return b["id"]
    return None


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def run_batch(batch_id: str | None, chunk: int = 20, local_file: str | None = None):
    """local_file: catálogo grande processado direto do disco (o PDF nunca sobe ao Storage)."""
    bid = batch_id or claim_next()
    if not bid:
        return False
    b = rest("GET", "import_batches", {"id": f"eq.{bid}", "select": "*,suppliers(name),catalogs(name,year)"})[0]
    supplier = (b.get("suppliers") or {}).get("name") or ""
    catalog = (b.get("catalogs") or {}).get("name") or b.get("source_file") or ""
    year = b.get("catalog_year")
    base = os.path.join(WORKDIR, bid)
    pdf = os.path.join(base, "catalogo.pdf")
    img_dir = os.path.join(base, "_embedded")
    update_batch(bid, status="processing", worker_id=WORKER_ID, started_at=b.get("started_at") or now(), pause_requested=False)
    try:
        if local_file:
            pdf = os.path.abspath(local_file)
        elif not os.path.exists(pdf):
            if not b.get("source_path"):
                raise RuntimeError("Lote em modo local: rode o worker com --file caminho/do/catalogo.pdf")
            download("importacoes", b["source_path"], pdf)
        checksum = sha256(pdf)
        same = rest("GET", "import_batches", {"source_checksum": f"eq.{checksum}", "catalog_id": f"eq.{b['catalog_id']}", "id": f"neq.{bid}", "select": "id"})
        total = extract.page_count(pdf)
        update_batch(bid, total_pages=total, source_checksum=checksum, source_size=os.path.getsize(pdf),
                     processing_mode="local" if local_file else "upload",
                     warnings=(b.get("warnings") or []) + ([f"Este arquivo já foi processado no lote {same[0]['id']}; peças existentes serão reaproveitadas."] if same else []))
        page = b.get("next_page") or 1

        # 1) páginas, com checkpoint a cada página
        while page <= total:
            end = min(page + chunk - 1, total)
            for pg in extract.read_pages(pdf, img_dir, page, end):
                data = {"width": pg.width, "height": pg.height, "rows": [r.__dict__ for r in pg.rows],
                        "images": [{"objid": i.objid, "bbox": i.bbox, "width": i.width, "height": i.height,
                                    "files": {k: os.path.basename(v) for k, v in i.files.items()}} for i in pg.images]}
                rest("POST", "import_pages", {"on_conflict": "batch_id,page_number"},
                     {"batch_id": bid, "page_number": pg.number, "status": "done", "has_text": pg.has_text,
                      "images_found": len(pg.images), "data": data},
                     prefer="resolution=merge-duplicates,return=minimal")
                update_batch(bid, next_page=pg.number + 1, processed_pages=pg.number)
                if rest("GET", "import_batches", {"id": f"eq.{bid}", "select": "pause_requested"})[0]["pause_requested"]:
                    update_batch(bid, status="paused")
                    print(f"lote {bid} pausado na página {pg.number}")
                    return True
            page = end + 1

        # 2) remonta as páginas do banco (funciona mesmo se o worker trocou de máquina)
        if not os.path.isdir(img_dir) or not any(f.startswith("img-") for f in os.listdir(img_dir)):
            extract.extract_embedded_images(pdf, img_dir)
        pages, offset = [], 0
        while True:
            rows = rest("GET", "import_pages", {"batch_id": f"eq.{bid}", "select": "page_number,has_text,data", "order": "page_number.asc",
                                                "limit": "200", "offset": str(offset)})
            if not rows:
                break
            for r in rows:
                d = r["data"]
                pages.append(extract.PageData(r["page_number"], d["width"], d["height"], [extract.Row(**x) for x in d["rows"]],
                                              [extract.PageImage(i["objid"], tuple(i["bbox"]), i["width"], i["height"],
                                                                 {k: os.path.join(img_dir, v) for k, v in i["files"].items()}) for i in d["images"]],
                                              r["has_text"]))
            offset += len(rows)
        products, page_stats, metrics = analyze(pages, supplier, catalog, year, base)
        metrics["paginas"] = total
        # miniaturas legíveis só das páginas necessárias à revisão (páginas das peças)
        needed = sorted({pg for p in products for pg in p["pages"]})
        for n in needed:
            thumb = os.path.join(base, "pages", f"p{n:04d}")
            os.makedirs(os.path.dirname(thumb), exist_ok=True)
            subprocess.run(["pdftoppm", "-f", str(n), "-l", str(n), "-r", str(PAGE_DPI), "-jpeg", "-jpegopt", "quality=72", "-singlefile", pdf, thumb], check=True)
            path = f"{bid}/pages/p{n:04d}.jpg"
            upload_private("importacoes", path, thumb + ".jpg")
            rest("PATCH", "import_pages", {"batch_id": f"eq.{bid}", "page_number": f"eq.{n}"}, {"render_path": path}, prefer="return=minimal")
        persist(bid, b, products, metrics, base)
        status = "needs_review" if metrics["grupos"]["intervencao"] else "imported"
        update_batch(bid, status=status, metrics=metrics, products_detected=metrics["produtos"],
                     imported=metrics["criados"], failed=metrics["falhas_ao_gravar"], finished_at=now())
        # o PDF de origem não precisa ficar no Storage: fica o checksum, as páginas e as mídias extraídas
        if b.get("source_path") and not local_file:
            _req("DELETE", f"{URL}/storage/v1/object/importacoes/{urllib.parse.quote(b['source_path'])}")
            update_batch(bid, source_path=None, source_deleted_at=now())
        print(f"lote {bid}: {metrics['criados']} peças criadas, {metrics['reaproveitados']} já existentes")
    except Exception as e:  # o lote fica com erro e retoma do checkpoint ao ser reenviado
        update_batch(bid, status="failed", error=str(e)[:2000])
        raise
    return True


def persist(bid, b, products, metrics, base):
    """Grava as peças. Nunca publica; nunca mescla duplicidades."""
    types = {t["code"]: t["id"] for t in rest("GET", "product_types", {"select": "id,code"})}
    subtypes = {(s["type_id"], norm(s["name"])): s["id"] for s in rest("GET", "product_subtypes", {"select": "id,type_id,name"})}
    mats = {norm(m["name"]): m["id"] for m in rest("GET", "materials", {"select": "id,name"})}
    fins = {norm(f["name"]): f["id"] for f in rest("GET", "finishes", {"select": "id,name"})}
    known = []  # pHash já existentes no acervo (sinal de duplicidade entre catálogos)
    offset = 0
    while True:
        rows = rest("GET", "product_media", {"select": "product_id,phash", "phash": "not.is.null", "limit": "1000", "offset": str(offset)})
        if not rows:
            break
        known += rows
        offset += len(rows)
    created = reused = failed = 0
    warnings = []
    for p in products:
        try:
            exists = rest("GET", "import_items", {"catalog_id": f"eq.{b['catalog_id']}", "idempotency_key": f"eq.{p['key']}", "select": "id,product_id"})
            if exists:
                reused += 1
                continue
            codes = [c["code"] for c in p["original_codes"]]
            flags = list(p["flags"])
            if codes and b.get("supplier_id"):
                prev = rest("GET", "product_source_references", {"supplier_id": f"eq.{b['supplier_id']}", "original_code": f"in.({','.join(codes)})", "select": "product_id"})
                if prev and "POSSIBLE_DUPLICATE" not in flags:
                    flags.append("POSSIBLE_DUPLICATE")
            prim = next((m for m in p["media"] if m["role"] == "primary"), None)
            if prim and any(hamming(prim["phash"], k["phash"]) <= 6 for k in known) and "POSSIBLE_DUPLICATE" not in flags:
                flags.append("POSSIBLE_DUPLICATE")
            cls = p["classification"]
            # classificação incerta não recebe tipo (nem código) até a revisão confirmar
            type_id = types.get(cls["type"]) if cls["type"] and cls["confidence"] >= THRESHOLD else None
            sub_id = subtypes.get((type_id, norm(cls["subtype"] or ""))) if type_id and cls["subtype"] else None
            prod = rest("POST", "products", None, {
                "name": p["name"], "slug": f"tmp-{p['key']}", "product_type_id": type_id, "product_subtype_id": sub_id,
                "environment": p.get("environment") or "indoor", "supplier_id": b.get("supplier_id"), "designer": p.get("designer"),
                "status": "draft", "visibility": "internal", "curation_tier": "archive", "status_commercial": "unknown",
                "classification_confidence": cls["confidence"],
            })[0]
            pid, code = prod["id"], prod.get("public_code")
            slug = "-".join(x for x in [norm(p["name"]).replace(" ", "-"), (code or pid[:8]).lower()] if x)
            if rest("GET", "products", {"slug": f"eq.{slug}", "select": "id"}):
                slug = f"{slug}-{pid[:6]}"
            rest("PATCH", "products", {"id": f"eq.{pid}"}, {"slug": slug}, prefer="return=minimal")
            if p["variants"]:
                rest("POST", "product_variants", None, [{"product_id": pid, "seq": i + 1, "name": v["name"], "width_cm": v["width_cm"],
                     "depth_cm": v["depth_cm"], "height_cm": v["height_cm"], "diameter_cm": v["diameter_cm"], "sort_order": i + 1}
                     for i, v in enumerate(p["variants"])], prefer="return=minimal")
            ml = [mats[norm(m)] for m in p["materials"] if norm(m) in mats]
            if ml:
                rest("POST", "product_materials", None, [{"product_id": pid, "material_id": m} for m in dict.fromkeys(ml)], prefer="return=minimal")
            fl = [fins[norm(f)] for f in p["finishes"] if norm(f) in fins]
            if fl:
                rest("POST", "product_finishes", None, [{"product_id": pid, "finish_id": f} for f in dict.fromkeys(fl)], prefer="return=minimal")
            refs = [{"code": c["code"], "label": c["label"], "page": c.get("page")} for c in p["original_codes"]] or [{"code": None, "label": None, "page": p["title_page"]}]
            rest("POST", "product_source_references", None, [{"product_id": pid, "supplier_id": b.get("supplier_id"), "catalog_id": b.get("catalog_id"),
                 "year": int(b["catalog_year"]) if str(b.get("catalog_year") or "").isdigit() else None, "page": str(r["page"] or p["title_page"]),
                 "original_code": r["code"], "original_name": p["name"], "notes": r["label"], "import_batch_id": bid} for r in refs], prefer="return=minimal")
            for i, m in enumerate(p["media"]):
                url = upload("produtos", f"{pid}/original/{os.path.basename(m['path'])}", os.path.join(base, m["path"]))
                rest("POST", "product_media", None, {
                    "product_id": pid, "type": "primary" if m["role"] == "primary" else "gallery", "url": url, "alt": p["name"],
                    "width": m["width"], "height": m["height"], "is_primary": m["role"] == "primary", "sort_order": i,
                    "source_type": m["source_type"], "quality": m["quality"], "quality_reasons": m["quality_reasons"], "file_size": m["file_size"],
                    "effective_ppi": m["effective_ppi"], "sharpness": m["sharpness"], "phash": m["phash"], "source_page": m["page"], "import_batch_id": bid,
                    "hero_ready": m["hero_ready"], "background": m["background"], "has_text": m["has_text"], "watermark": m["watermark"],
                }, prefer="return=minimal")
            for f, dbf in FLAG_TO_DB.items():
                if f in flags and dbf:
                    rest("POST", "product_quality_flags", {"on_conflict": "product_id,flag"}, {"product_id": pid, "flag": dbf, "note": "importação"},
                         prefer="resolution=ignore-duplicates,return=minimal")
            rest("POST", "import_items", None, {
                "batch_id": bid, "product_id": pid, "supplier_id": b.get("supplier_id"), "catalog_id": b.get("catalog_id"),
                "idempotency_key": p["key"], "title_page": p["title_page"], "pages": p["pages"], "flags": flags, "scores": p["scores"],
                "extracted": {k: p[k] for k in ("name", "header", "section", "designer", "original_codes", "variants", "materials", "finishes", "classification", "relations")},
            }, prefer="return=minimal")
            created += 1
        except Exception as e:
            failed += 1
            warnings.append(f"página {p['title_page']} ({p['name']}): {str(e)[:300]}")
    metrics.update({"criados": created, "reaproveitados": reused, "falhas_ao_gravar": failed})
    if warnings:
        update_batch(bid, warnings=warnings[:500])


def reclassify_batch(bid):
    """Reprocessa só a classificação dos itens com tipo ausente ou incerto (ex.: após cadastrar tipos novos)."""
    types = {t["code"]: t["id"] for t in rest("GET", "product_types", {"select": "id,code"})}
    subtypes = {(s["type_id"], norm(s["name"])): s["id"] for s in rest("GET", "product_subtypes", {"select": "id,type_id,name"})}
    items = rest("GET", "import_items", {"batch_id": f"eq.{bid}", "review_status": "eq.pending", "flags": "ov.{NO_TYPE,TAXONOMY_REVIEW_REQUIRED}",
                                         "select": "id,product_id,flags,extracted,products(product_type_id)"})
    changed = 0
    for it in items or []:
        ex = it["extracted"]
        cls = classify(ex.get("header"), ex.get("name"), ex.get("section"))
        if not cls["type"] or cls["confidence"] < THRESHOLD or cls["type"] not in types:
            continue
        if (it.get("products") or {}).get("product_type_id"):
            continue   # tipo já definido por alguém: não sobrescreve
        tid = types[cls["type"]]
        rest("PATCH", "products", {"id": f"eq.{it['product_id']}"}, {"product_type_id": tid, "classification_confidence": cls["confidence"],
             "product_subtype_id": subtypes.get((tid, norm(cls["subtype"] or "")))}, prefer="return=minimal")   # o gatilho gera o código
        ex["classification"] = cls
        flags = [f for f in it["flags"] if f not in ("NO_TYPE", "TAXONOMY_REVIEW_REQUIRED")]
        rest("PATCH", "import_items", {"id": f"eq.{it['id']}"}, {"extracted": ex, "flags": flags}, prefer="return=minimal")
        changed += 1
    print(f"{changed} item(ns) reclassificado(s) no lote {bid}")


def replace_images(folder, supplier_id, dry_run=False):
    """Troca as fotos pelas originais do fornecedor, casando o código original no nome do arquivo.
    Não altera peça, código Casa Áurea, slug, coleções, origem, variantes nem dados: só a mídia."""
    import re as _re
    refs = rest("GET", "product_source_references", {"supplier_id": f"eq.{supplier_id}", "original_code": "not.is.null", "select": "product_id,original_code"})
    by_code = {}
    for r in refs or []:
        by_code.setdefault(r["original_code"].upper(), set()).add(r["product_id"])
    done, unmatched = 0, []
    for fn in sorted(os.listdir(folder)):
        if not fn.lower().endswith((".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff")):
            continue
        tokens = set(_re.findall(r"[A-Za-z]{0,4}[-.]?\d{3,8}[A-Za-z]?", os.path.splitext(fn)[0].upper()))
        pids = set().union(*[by_code.get(t, set()) for t in tokens]) if tokens else set()
        if not pids:
            unmatched.append(fn)
            continue
        path = os.path.join(folder, fn)
        img = compose({"image": path})
        q = assess(img, {"image": path}, None, "supplier_original")
        for pid in pids:
            if dry_run:
                print(f"{fn} → {pid}")
                continue
            old = rest("GET", "product_media", {"product_id": f"eq.{pid}", "is_primary": "eq.true", "status": "eq.active", "select": "id"})
            if old:
                rest("PATCH", "product_media", {"id": f"eq.{old[0]['id']}"}, {"status": "replaced", "is_primary": False, "replaced_at": now()}, prefer="return=minimal")
            url = upload("produtos", f"{pid}/supplier/{fn}", path)
            new = rest("POST", "product_media", None, {"product_id": pid, "type": "primary", "url": url, "is_primary": True, "status": "active",
                       "width": q["width"], "height": q["height"], "source_type": "supplier_original", "quality": q["quality"], "quality_reasons": q["quality_reasons"],
                       "hero_ready": q["hero_ready"], "background": q["background"], "has_text": q["has_text"], "watermark": q["watermark"], "phash": phash(img),
                       "file_size": os.path.getsize(path), "sort_order": 0})[0]
            if old:
                rest("PATCH", "product_media", {"id": f"eq.{old[0]['id']}"}, {"replaced_by": new["id"]}, prefer="return=minimal")
            done += 1
    print(f"{done} foto(s) substituída(s); sem correspondência: {len(unmatched)}")
    for fn in unmatched[:50]:
        print("  ·", fn)


def import_package(zip_path, supplier_id, catalog_id, year=None):
    """Grava no Supabase um catálogo já processado (pacote .zip), sem reler o PDF.
    Mesma gravação do lote normal: interno + acervo, idempotente, código pelo banco."""
    import zipfile
    work = os.path.join(WORKDIR, "pkg-" + os.path.basename(zip_path).rsplit(".", 1)[0])
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(work)
    data = json.load(open(os.path.join(work, "batch.json")))
    b = rest("POST", "import_batches", None, {"kind": "pdf", "status": "processing", "processing_mode": "local", "supplier_id": supplier_id,
              "catalog_id": catalog_id, "catalog_year": year or data.get("year"), "source_file": data.get("source_file"),
              "source_checksum": data.get("source_checksum"), "source_size": data.get("source_size"),
              "total_pages": data["metrics"].get("paginas"), "processed_pages": data["metrics"].get("paginas")})[0]
    bid = b["id"]
    for n in sorted({pg for p in data["products"] for pg in p["pages"]}):
        f = os.path.join(work, "pages", f"p{n:04d}.jpg")
        path = upload_private("importacoes", f"{bid}/pages/p{n:04d}.jpg", f) if os.path.exists(f) else None
        rest("POST", "import_pages", {"on_conflict": "batch_id,page_number"}, {"batch_id": bid, "page_number": n, "status": "done", "render_path": path},
             prefer="resolution=merge-duplicates,return=minimal")
    metrics = dict(data["metrics"])
    persist(bid, {**b, "supplier_id": supplier_id, "catalog_id": catalog_id, "catalog_year": year or data.get("year")}, data["products"], metrics, work)
    update_batch(bid, status="needs_review" if metrics.get("grupos", {}).get("intervencao") else "imported", metrics=metrics,
                 products_detected=metrics.get("produtos"), imported=metrics["criados"], failed=metrics["falhas_ao_gravar"], finished_at=now())
    print(f"pacote {os.path.basename(zip_path)}: {metrics['criados']} peças criadas, {metrics['reaproveitados']} já existentes")


def main():
    ap = argparse.ArgumentParser(description="Worker de importação Casa Áurea (Supabase)")
    ap.add_argument("--batch"); ap.add_argument("--loop", action="store_true"); ap.add_argument("--chunk", type=int, default=20)
    ap.add_argument("--file", help="PDF local (catálogos grandes: o arquivo não sobe ao Storage)")
    ap.add_argument("--reclassify", action="store_true", help="reprocessa só a classificação do lote --batch")
    ap.add_argument("--replace-images", help="pasta com as fotos originais do fornecedor (nome do arquivo contém o código original)")
    ap.add_argument("--supplier-id"); ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--import-package", help="pacote .zip de um catálogo já processado"); ap.add_argument("--catalog-id"); ap.add_argument("--year")
    a = ap.parse_args()
    if not URL or not KEY:
        raise SystemExit("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.")
    if a.import_package:
        import_package(a.import_package, a.supplier_id, a.catalog_id, a.year)
        return
    if a.replace_images:
        replace_images(a.replace_images, a.supplier_id, a.dry_run)
        return
    if a.batch and a.reclassify:
        reclassify_batch(a.batch)
        return
    if a.batch:
        run_batch(a.batch, a.chunk, a.file)
        return
    while True:
        worked = run_batch(None, a.chunk)
        if not a.loop:
            break
        if not worked:
            time.sleep(30)


if __name__ == "__main__":
    main()
