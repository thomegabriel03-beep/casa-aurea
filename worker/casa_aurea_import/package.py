"""Pacote de importação: o resultado de um catálogo já processado, pronto para gravar no Supabase
sem reprocessar o PDF.

    python -m casa_aurea_import.package --out ./saida --pdf catalogo.pdf --zip faruk-2025.zip

Conteúdo: batch.json (peças, variantes, códigos, pendências, métricas), media/ (imagens em WebP sem perda,
com transparência: pixels idênticos aos extraídos) e pages/ (miniaturas legíveis das páginas usadas).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import zipfile

from PIL import Image


def build(out: str, pdf: str, zip_path: str):
    data = json.load(open(os.path.join(out, "batch.json")))
    h = hashlib.sha256()
    with open(pdf, "rb") as fh:
        for b in iter(lambda: fh.read(1 << 20), b""):
            h.update(b)
    data["source_checksum"], data["source_size"] = h.hexdigest(), os.path.getsize(pdf)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_STORED) as z:
        for p in data["products"]:
            for m in p["media"]:
                src = os.path.join(out, m["path"])
                dst = os.path.splitext(m["path"])[0] + ".webp"
                tmp = "/tmp/_pk.webp"
                Image.open(src).save(tmp, "WEBP", lossless=True, method=2)
                z.write(tmp, dst)
                m["path"] = dst
        pages = sorted({pg for p in data["products"] for pg in p["pages"]})
        for n in pages:
            tmp = "/tmp/_pg"
            subprocess.run(["pdftoppm", "-f", str(n), "-l", str(n), "-r", "80", "-jpeg", "-jpegopt", "quality=70", "-singlefile", pdf, tmp], check=True)
            z.write(tmp + ".jpg", f"pages/p{n:04d}.jpg")
        z.writestr("batch.json", json.dumps(data, ensure_ascii=False, default=str))
    return len(data["products"]), len(pages)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True); ap.add_argument("--pdf", required=True); ap.add_argument("--zip", required=True)
    a = ap.parse_args()
    print(build(a.out, a.pdf, a.zip))
