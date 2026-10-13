"""Publica no site a seleção feita na curadoria.

A seleção é o texto do botão "Copiar seleção" do painel de curadoria, uma peça por linha:
    DESTAQUE | Estofados Pirâmide | Moss | 3f9c0d2a1b7e4c55
    SITE | CCL Móveis | Rack 2470 | 9a1b...

    python -m casa_aurea_import.publish --selection selecao.txt --dry-run   # confere antes
    python -m casa_aurea_import.publish --selection selecao.txt             # publica

SITE vira público + curated (vitrine); DESTAQUE vira público + signature (vitrine em destaque);
ACERVO vira público + archive (disponível em /acervo e na busca, fora da vitrine). Peças fora da lista não mudam
(nada é despublicado sem pedir). Peça sem tipo confirmado (sem código Casa Áurea) não é publicada
e aparece no relatório para revisar no painel.
"""
from __future__ import annotations

import argparse
import re

from . import sink

LINE = re.compile(r"^\s*(DESTAQUE|SITE|ACERVO)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*([0-9a-f]{8,40})\s*$", re.I)


def parse(path: str) -> list[dict]:
    out = []
    for raw in open(path, encoding="utf-8"):
        m = LINE.match(raw)
        if m:
            out.append({"tier": {"DESTAQUE": "signature", "SITE": "curated", "ACERVO": "archive"}[m.group(1).upper()],
                        "supplier": m.group(2), "name": m.group(3), "key": m.group(4).lower()})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--selection", required=True)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    sel = parse(a.selection)
    if not sel:
        raise SystemExit("Nenhuma linha válida na seleção (formato: DESTAQUE|SITE | fornecedor | peça | chave).")
    print(f"{len(sel)} peças na seleção ({sum(s['tier'] == 'signature' for s in sel)} em destaque)")
    if a.dry_run and not (sink.URL and sink.KEY):
        for s in sel[:10]:
            print(f"  {s['tier']:9} {s['supplier']} · {s['name']}")
        return
    if not sink.URL or not sink.KEY:
        raise SystemExit("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.")
    ok, missing, untyped = [], [], []
    for s in sel:
        it = sink.rest("GET", "import_items", {"idempotency_key": f"eq.{s['key']}", "select": "product_id"})
        pid = it[0]["product_id"] if it and it[0].get("product_id") else None
        if not pid:
            missing.append(s)
            continue
        p = sink.rest("GET", "products", {"id": f"eq.{pid}", "select": "id,public_code,name"})[0]
        if not p.get("public_code"):
            untyped.append(s)
            continue
        if not a.dry_run:
            sink.rest("PATCH", "products", {"id": f"eq.{pid}"}, {"visibility": "public", "curation_tier": s["tier"], "status": "active"},
                      prefer="return=minimal")
        ok.append((s, p["public_code"]))
    verb = "seriam publicadas" if a.dry_run else "publicadas"
    print(f"{len(ok)} {verb}")
    if missing:
        print(f"{len(missing)} não encontradas no banco (pacote ainda não importado?):")
        for s in missing:
            print(f"  - {s['supplier']} · {s['name']}")
    if untyped:
        print(f"{len(untyped)} sem tipo confirmado: defina o tipo no painel e rode de novo:")
        for s in untyped:
            print(f"  - {s['supplier']} · {s['name']}")


if __name__ == "__main__":
    main()
