"""Importa de uma vez os pacotes de catálogo já processados (pasta com os .zip) para o Supabase.

    python -m casa_aurea_import.import_all --dir ../catalogos            # importa
    python -m casa_aurea_import.import_all --dir ../catalogos --dry-run  # só mostra o plano

Para cada pacote: acha o fornecedor pelo nome (já cadastrado pela migração 0002), cria o catálogo
se ainda não existir e grava as peças como interno + acervo. Pacote já importado (mesmo SHA-256 do PDF)
é pulado, então rodar de novo é seguro.
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import zipfile

from . import sink


def read_meta(zip_path: str) -> dict:
    with zipfile.ZipFile(zip_path) as z:
        d = json.loads(z.read("batch.json"))
    return {"supplier": d.get("supplier"), "catalog": d.get("catalog"), "year": d.get("year"),
            "checksum": d.get("source_checksum"), "items": len(d.get("products", []))}


def supplier_id(name: str) -> str:
    r = sink.rest("GET", "suppliers", {"name": f"eq.{name}", "select": "id"})
    if not r:
        raise SystemExit(f"Fornecedor não encontrado no banco: {name!r}. Rode as migrações antes.")
    return r[0]["id"]


def catalog_id(sup: str, name: str, year) -> str:
    q = {"supplier_id": f"eq.{sup}", "name": f"eq.{name}", "select": "id"}
    q["year"] = f"eq.{year}" if year else "is.null"
    r = sink.rest("GET", "catalogs", q)
    if r:
        return r[0]["id"]
    return sink.rest("POST", "catalogs", None, {"supplier_id": sup, "name": name, "year": int(year) if year else None})[0]["id"]


def already_imported(checksum: str | None) -> bool:
    if not checksum:
        return False
    r = sink.rest("GET", "import_batches", {"source_checksum": f"eq.{checksum}", "status": "in.(imported,needs_review)", "select": "id"})
    return bool(r)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True, help="pasta com os pacotes .zip")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    zips = sorted(glob.glob(os.path.join(a.dir, "*.zip")))
    if not zips:
        raise SystemExit(f"Nenhum .zip em {a.dir}")
    metas = [(z, read_meta(z)) for z in zips]
    print(f"{len(metas)} pacotes, {sum(m['items'] for _, m in metas)} itens no total")
    for z, m in metas:
        print(f"  {os.path.basename(z):45} {m['supplier']} · {m['catalog']} · {m['year'] or '—'} · {m['items']} itens")
    if a.dry_run:
        return
    if not sink.URL or not sink.KEY:
        raise SystemExit("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.")
    for z, m in metas:
        if already_imported(m["checksum"]):
            print(f"= {os.path.basename(z)}: já importado, pulando")
            continue
        sid = supplier_id(m["supplier"])
        cid = catalog_id(sid, m["catalog"], m["year"])
        print(f"→ {os.path.basename(z)}")
        sink.import_package(z, sid, cid, m["year"])
    print("Concluído. Revise em Painel → Importações → Fila de revisão.")


if __name__ == "__main__":
    main()
