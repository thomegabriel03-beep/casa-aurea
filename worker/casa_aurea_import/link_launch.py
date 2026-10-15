"""Liga as peças da seleção de lançamento (as 71 do site aprovado) às peças do banco.

    python -m casa_aurea_import.link_launch --site ../public/site --dry-run   # só mostra o plano
    python -m casa_aurea_import.link_launch --site ../public/site             # grava

Para cada peça da seleção (script launchFixture de public/site/index.html):
1. encontra a peça no banco: primeiro pela foto aprovada já enviada (…/site/<chave>-0.ext),
   depois pela chave de importação (import_items.idempotency_key = chave da seleção);
   se a peça não estiver no banco (catálogo não importado), cria a peça a partir da seleção;
2. deixa a peça pública na mesma curadoria do site aprovado (Vitrine / Destaque / Acervo),
   com a ordem, o ambiente e o texto aprovados (texto só onde o banco ainda não tem);
3. envia as fotos aprovadas do site para o Storage (produtos/<id>/site/<chave>-<n>.ext) e põe a
   primeira como foto principal; as fotos do catálogo continuam na galeria do painel.

O site passa a ler essas peças do banco: o código mostrado é o mesmo do painel e a equipe controla
Vitrine / Acervo / Oculta pelo painel. Reexecutar não duplica nada.
Nada é publicado além das peças que já estão no site aprovado.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import urllib.parse

from PIL import Image

from . import sink
from .classify import norm

TIER = lambda it: "signature" if it.get("sig") else ("archive" if it.get("acv") else "curated")  # noqa: E731


def load_fixture(site_dir: str) -> list[dict]:
    html = open(os.path.join(site_dir, "index.html"), encoding="utf-8").read()
    i = html.find('id="launchFixture"')
    a = html.find(">", i) + 1
    b = html.find("</script>", a)
    return [it for it in json.loads(html[a:b]) if not it.get("hide")]


def local_file(site_dir: str, src: str) -> str:
    # /site/img/abc.webp -> <site_dir>/img/abc.webp
    return os.path.join(site_dir, src.split("/site/", 1)[1])


def find_by_photo(k: str):
    r = sink.rest("GET", "product_media", {"url": f"like.*/site/{k}-*", "status": "eq.active", "select": "product_id", "limit": "1"})
    return r[0]["product_id"] if r else None


def find_by_key(k: str):
    r = sink.rest("GET", "import_items", {"idempotency_key": f"eq.{k}", "product_id": "not.is.null", "select": "product_id",
                                          "order": "created_at.asc", "limit": "1"})
    return r[0]["product_id"] if r else None


def create(it: dict, types: dict, subtypes: dict, mats: dict, fins: dict) -> str:
    type_id = types.get(it["t"])
    sub_id = subtypes.get((type_id, norm(it.get("st") or ""))) if it.get("st") else None
    p = sink.rest("POST", "products", None, {
        "name": it["n"], "slug": f"tmp-{it['k']}", "product_type_id": type_id, "product_subtype_id": sub_id,
        "environment": it.get("env") or "indoor", "designer": it.get("ds"), "status": "active",
        "visibility": "internal", "curation_tier": "archive", "status_commercial": "unknown",
        "internal_notes": f"Criada a partir da seleção de lançamento aprovada no site (chave {it['k']}).",
    })[0]
    pid, code = p["id"], p.get("public_code")
    slug = "-".join(x for x in [norm(it["n"]).replace(" ", "-"), (code or pid[:8]).lower()] if x)
    if sink.rest("GET", "products", {"slug": f"eq.{slug}", "select": "id"}):
        slug = f"{slug}-{pid[:6]}"
    sink.rest("PATCH", "products", {"id": f"eq.{pid}"}, {"slug": slug}, prefer="return=minimal")
    vs = it.get("v") or []
    if vs:
        sink.rest("POST", "product_variants", None, [{"product_id": pid, "seq": j + 1, "name": v[0], "width_cm": v[1], "depth_cm": v[2],
                  "height_cm": v[3], "diameter_cm": v[4], "sort_order": j + 1} for j, v in enumerate(vs)], prefer="return=minimal")
    ml = list(dict.fromkeys(mats[norm(m)] for m in it.get("mt") or [] if norm(m) in mats))
    if ml:
        sink.rest("POST", "product_materials", None, [{"product_id": pid, "material_id": m} for m in ml], prefer="return=minimal")
    fl = list(dict.fromkeys(fins[norm(f)] for f in it.get("fn") or [] if norm(f) in fins))
    if fl:
        sink.rest("POST", "product_finishes", None, [{"product_id": pid, "finish_id": f} for f in fl], prefer="return=minimal")
    return pid


def send_photos(pid: str, it: dict, site_dir: str):
    files = [local_file(site_dir, s) for s in it.get("imgs") or []]
    files = [f for f in files if os.path.exists(f)]
    if not files:
        return 0
    # a foto principal atual (do catálogo) continua ativa, na galeria
    sink.rest("PATCH", "product_media", {"product_id": f"eq.{pid}", "is_primary": "eq.true", "status": "eq.active"},
              {"is_primary": False, "type": "gallery"}, prefer="return=minimal")
    for j, f in enumerate(files):
        ext = os.path.splitext(f)[1].lower()
        url = sink.upload("produtos", f"{pid}/site/{it['k']}-{j}{ext}", f)
        with Image.open(f) as im:
            w, h = im.size
        sink.rest("POST", "product_media", None, {
            "product_id": pid, "type": "primary" if j == 0 else "gallery", "url": url, "alt": it["n"], "width": w, "height": h,
            "is_primary": j == 0, "sort_order": -1000 + j, "status": "active", "source_type": "enhanced", "quality": "CATALOG_READY",
            "file_size": os.path.getsize(f),
        }, prefer="return=minimal")
    return len(files)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", default="../public/site")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    items = load_fixture(a.site)
    print(f"{len(items)} peças na seleção de lançamento do site")
    if not sink.URL or not sink.KEY:
        raise SystemExit("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.")

    types = {t["code"]: t["id"] for t in sink.rest("GET", "product_types", {"select": "id,code"})}
    type_code = {v: k for k, v in types.items()}
    subtypes = {(s["type_id"], norm(s["name"])): s["id"] for s in sink.rest("GET", "product_subtypes", {"select": "id,type_id,name"})}
    mats = {norm(m["name"]): m["id"] for m in sink.rest("GET", "materials", {"select": "id,name"})}
    fins = {norm(f["name"]): f["id"] for f in sink.rest("GET", "finishes", {"select": "id,name"})}

    report = {"ligadas": [], "criadas": [], "avisos": []}
    for i, it in enumerate(items):
        k, tier = it["k"], TIER(it)
        pid = find_by_photo(k)
        has_photos = bool(pid)
        how = "ligadas"
        if not pid:
            pid = find_by_key(k)
        if not pid:
            how = "criadas"
            if a.dry_run:
                report[how].append(f"{it['n']} ({it['t']}) — {tier}")
                continue
            if it["t"] not in types:
                report["avisos"].append(f"{it['n']}: tipo {it['t']} não existe no banco; não criada")
                continue
            pid = create(it, types, subtypes, mats, fins)

        p = sink.rest("GET", "products", {"id": f"eq.{pid}", "select": "id,name,public_code,product_type_id,product_subtype_id,short_description,designer"})[0]
        patch = {"visibility": "public", "curation_tier": tier, "status": "active", "environment": it.get("env") or "indoor",
                 "sort_order": 200 + (it.get("bg") or 0) * 100 + i}
        if not p["product_type_id"] and it["t"] in types:
            patch["product_type_id"] = types[it["t"]]
        cur_type = patch.get("product_type_id") or p["product_type_id"]
        if cur_type and type_code.get(cur_type) != it["t"]:
            report["avisos"].append(f"{p['name']} ({p.get('public_code')}): tipo no banco {type_code.get(cur_type)}, no site {it['t']} — conferir no painel")
        if not p["product_subtype_id"] and it.get("st") and cur_type:
            sid = subtypes.get((cur_type, norm(it["st"])))
            if sid:
                patch["product_subtype_id"] = sid
        text = (it.get("s") or {}).get("pt") or it.get("desc")
        if text and not (p.get("short_description") or "").strip():
            patch["short_description"] = text
        if it.get("ds") and not p.get("designer"):
            patch["designer"] = it["ds"]
        if not a.dry_run:
            sink.rest("PATCH", "products", {"id": f"eq.{pid}"}, patch, prefer="return=minimal")
            if not has_photos:
                send_photos(pid, it, a.site)
            code = sink.rest("GET", "products", {"id": f"eq.{pid}", "select": "public_code"})[0]["public_code"]
        else:
            code = p.get("public_code") or "(código ao confirmar o tipo)"
        report[how].append(f"{it['n']} → {code} — {tier}")

    verb = "seriam" if a.dry_run else "foram"
    lines = [f"## Seleção de lançamento × banco{' (teste, nada gravado)' if a.dry_run else ''}",
             f"- {len(report['ligadas'])} peças {verb} ligadas a peças que já estavam no banco",
             f"- {len(report['criadas'])} peças {verb} criadas (não estavam no banco)",
             f"- {len(report['avisos'])} avisos", ""]
    for title, key in (("Ligadas", "ligadas"), ("Criadas", "criadas"), ("Avisos", "avisos")):
        if report[key]:
            lines.append(f"### {title}")
            lines += [f"- {x}" for x in report[key]]
            lines.append("")
    out = "\n".join(lines)
    print(out)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as fh:
            fh.write(out + "\n")


if __name__ == "__main__":
    main()
