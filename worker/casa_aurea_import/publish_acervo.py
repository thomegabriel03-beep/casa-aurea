"""Publica no Acervo do site as peças importadas que estão prontas para o público.

    python -m casa_aurea_import.publish_acervo --dry-run   # só mostra quantas passam e por quê as outras ficam
    python -m casa_aurea_import.publish_acervo             # publica (Acervo: página Acervo, busca e Áurea)

Uma peça só vai para o site se tiver TUDO isto:
- nome de verdade (não vazio, não letras soltas como "T O O Le") e sem nome de fornecedor;
- tipo confirmado e código Casa Áurea;
- foto principal ativa com nota CATALOG_READY, sem texto e sem marca d'água;
- nenhuma suspeita de duplicidade em aberto;
- não ter sido deixada de fora de propósito na seleção aprovada do site.
As demais continuam internas e saem numa planilha (pecas-para-revisar.csv) com o motivo,
para a equipe ajustar no painel e publicar depois. Só mexe em peças internas: nada que a
equipe já publicou, ocultou ou arquivou muda. Reexecutar é seguro.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re

from . import sink
from .classify import norm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def page_all(table: str, params: dict) -> list[dict]:
    out, off = [], 0
    while True:
        rows = sink.rest("GET", table, {**params, "limit": "1000", "offset": str(off)})
        out += rows or []
        if not rows or len(rows) < 1000:
            return out
        off += 1000


def hidden_launch_keys() -> set[str]:
    """Peças que a curadoria do site aprovado deixou de fora de propósito (hide)."""
    html = open(os.path.join(ROOT, "reference", "preview", "casa-aurea-preview.html"), encoding="utf-8").read()
    i = html.find('id="launchFixture"')
    a = html.find(">", i) + 1
    b = html.find("</script>", a)
    return {it["k"] for it in json.loads(html[a:b]) if it.get("hide")}


LETTERS_SPACED = re.compile(r"^(?:\S{1,2}\s+){2,}\S{1,3}$")   # "T O O Le", "A B C"


VOW = "aeiouy"
OK_START = {"bl", "br", "cl", "cr", "dr", "fl", "fr", "gl", "gr", "pl", "pr", "tr", "vr", "ch", "lh", "nh", "sh", "th", "ph",
            "wh", "st", "sp", "sc", "sk", "sl", "sm", "sn", "sw", "kr", "kl", "ps", "ts", "tz", "zh", "qu", "gu", "dj", "kn", "wr"}
OK_TRIPLE = {"str", "spr", "scr", "spl", "nch", "rch", "tch", "ngl", "ndr", "ntr", "mpr", "mbr", "nst", "rst", "chr", "sch",
             "ght", "lth", "nth", "rth", "ckl", "lch", "nsh", "rsh", "mpl", "nfl", "ncl", "ngr", "rtr", "lst", "nsk", "rbl",
             "ltr", "lgr", "rgr", "rpr", "rcl", "nsp", "nsc", "xtr", "xpl", "mbl", "ndl", "rbr", "lpr", "ldr", "rdr", "rcr", "nfr", "ngu", "rqu", "nqu"}
BAD_DOUBLE = re.compile(r"(kk|ww|jj|qq|yy|hh|vv|xx|aa|ii|uu)")


GENERIC = {"aparador", "buffet", "rack", "mesa", "cadeira", "poltrona", "sofa", "banqueta", "banco", "puff", "puf", "cama",
           "comoda", "estante", "gaveteiro", "balanco", "espreguicadeira", "ombrelone", "tapete", "mesa lateral",
           "mesa de centro", "mesa de jantar", "cristaleira", "cabideiro", "carrinho", "bar", "side", "mesa de apoio"}


def odd_word(w: str) -> bool:
    """Palavra com cara de leitura errada do PDF (letras de fonte decorativa trocadas)."""
    w = norm(w)
    w = re.sub(r"[^a-z]", "", w)
    if len(w) < 3:
        return False
    if w[0] == w[1]:                                   # "Ssaivage", "Llaala"
        return True
    if w[0] not in VOW and w[1] not in VOW and w[:2] not in OK_START:   # "Lrakkafr"
        return True
    if BAD_DOUBLE.search(w):                           # "kk", "aa"
        return True
    for m in re.finditer(r"[^aeiouy]{3,}", w):         # "Lafldus" (fld)
        if m.group(0)[:3] not in OK_TRIPLE:
            return True
    if len(w) >= 4 and w[-1] not in VOW and w[-2] not in VOW and w[-2:] not in {
            "ns", "rs", "st", "nt", "nd", "rd", "rt", "ck", "ll", "ss", "ch", "sh", "th", "nn", "tt", "rn", "rk", "rl", "lt",
            "ld", "lm", "rm", "ls", "ts", "ds", "ks", "ms", "ps", "gs", "ng", "nk", "sk", "ft", "pt", "ct", "xt", "ff", "zz", "nz", "rz"}:
        return True                                    # termina em "fr"
    return False


def bad_name(name: str) -> str | None:
    n = (name or "").strip()
    if len(n) < 3:
        return "sem nome"
    if LETTERS_SPACED.match(n):
        return "nome quebrado na importação"
    if not re.search(r"[aeiouáéíóúâêôãõ]", n, re.I):
        return "nome quebrado na importação"
    if any(odd_word(w) for w in n.split()):
        return "nome com cara de erro de leitura (conferir)"
    if re.search(r"\d{3,}", n):
        return "nome com número de catálogo do fornecedor"
    if norm(n) in GENERIC:
        return "nome genérico (só o tipo da peça)"
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--csv", default="pecas-para-revisar.csv")
    a = ap.parse_args()
    if not sink.URL or not sink.KEY:
        raise SystemExit("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.")

    prods = page_all("products", {"visibility": "eq.internal", "order": "public_code.asc.nullslast,id",
                                  "select": "id,name,public_code,product_type_id,description,short_description,editorial_description"})
    print(f"{len(prods)} peças internas no banco")
    suppliers = [norm(s["name"]) for s in sink.rest("GET", "suppliers", {"select": "name"}) or [] if len(norm(s["name"])) >= 4]
    media = page_all("product_media", {"is_primary": "eq.true", "status": "eq.active",
                                       "select": "product_id,quality,has_text,watermark,type"})
    prim = {m["product_id"]: m for m in media}
    flags = page_all("product_quality_flags", {"flag": "eq.possibleDuplicate", "resolved": "eq.false", "select": "product_id"})
    dup = {f["product_id"] for f in flags}
    hide_keys = hidden_launch_keys()
    held_back = set()
    if hide_keys:
        items = sink.rest("GET", "import_items", {"idempotency_key": f"in.({','.join(sorted(hide_keys))})", "select": "product_id"})
        held_back = {i["product_id"] for i in items or [] if i.get("product_id")}

    ok, review = [], []
    for p in prods:
        why = []
        nb = bad_name(p.get("name") or "")
        if nb:
            why.append(nb)
        text = norm(" ".join(filter(None, [p.get("name"), p.get("description"), p.get("short_description"), p.get("editorial_description")])))
        if any(s in text for s in suppliers):
            why.append("nome ou texto cita o fornecedor")
        if not p.get("product_type_id") or not p.get("public_code"):
            why.append("sem tipo confirmado")
        m = prim.get(p["id"])
        if not m:
            why.append("sem foto principal")
        else:
            if m.get("quality") != "CATALOG_READY":
                why.append(f"foto principal com qualidade baixa ({m.get('quality') or 'sem nota'})")
            if m.get("has_text"):
                why.append("foto com texto do catálogo")
            if m.get("watermark"):
                why.append("foto com marca d'água")
        if p["id"] in dup:
            why.append("possível duplicidade")
        if p["id"] in held_back:
            why.append("deixada de fora na seleção aprovada")
        (review if why else ok).append((p, why))

    if not a.dry_run:
        ids = [p["id"] for p, _ in ok]
        for i in range(0, len(ids), 100):
            chunk = ids[i:i + 100]
            sink.rest("PATCH", "products", {"id": f"in.({','.join(chunk)})", "visibility": "eq.internal"},
                      {"visibility": "public", "curation_tier": "archive", "status": "active"}, prefer="return=minimal")

    with open(a.csv, "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh, delimiter=";")
        w.writerow(["Código", "Nome", "Motivo"])
        for p, why in review:
            w.writerow([p.get("public_code") or "", p.get("name") or "", ", ".join(why)])

    reasons: dict[str, int] = {}
    for _, why in review:
        for r in why:
            reasons[r] = reasons.get(r, 0) + 1
    verb = "seriam publicadas" if a.dry_run else "publicadas"
    lines = [f"## Publicar no Acervo{' (teste, nada gravado)' if a.dry_run else ''}",
             f"- **{len(ok)} peças {verb}** no Acervo (página Acervo, busca por descrição e Áurea)",
             f"- **{len(review)} peças continuam internas** para revisar no painel (lista completa na planilha pecas-para-revisar.csv, em Artifacts)",
             "", "### Por que ficaram de fora (uma peça pode ter mais de um motivo)"]
    lines += [f"- {r}: {n}" for r, n in sorted(reasons.items(), key=lambda x: -x[1])]
    lines += ["", f"### Exemplos que {'seriam publicados' if a.dry_run else 'foram publicados'}"]
    lines += [f"- {p.get('public_code')} · {p.get('name')}" for p, _ in ok[:25]]
    out = "\n".join(lines)
    print(out)
    if os.environ.get("GITHUB_ACTIONS"):   # resumo também como aviso da execução (legível pela API do GitHub)
        print(f"::notice title=Publicar no Acervo::" + out[:3500].replace("%", "%25").replace("\r", "").replace("\n", "%0A"))
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as fh:
            fh.write(out + "\n")


if __name__ == "__main__":
    main()
