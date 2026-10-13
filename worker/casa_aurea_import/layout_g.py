"""Layout G: páginas de ficha com entradas 'CÓDIGO(S)' + 'NOME — medidas' (medidas em metros,
'0,58 × 0,50 × 0,80'), às vezes vários códigos ('MS7285 / MS7275 …') com uma lista de medidas na mesma ordem.
Páginas de ambiente com o nome da linha ('SERENA & ALBA') antecedem a ficha e entram como fotos de ambientação.
"""
from __future__ import annotations

import re

from .classify import classify, norm, vocab
from .extract import PageData

CODE = r"[A-Z]{2,4}\d{3,5}[A-Z]?"
CODES = re.compile(rf"^{CODE}(?:\s*/\s*{CODE})*$")
DIM = re.compile(r"(\d+(?:[.,]\d+)?)\s*[×xX]\s*(\d+(?:[.,]\d+)?)(?:\s*[×xX]\s*(\d+(?:[.,]\d+)?))?")
SEP = re.compile(r"\(cid:127\)|•|·")


def to_cm(v: str) -> float:
    x = float(v.replace(",", "."))
    return round(x * 100) if x < 10 else x


def parse_dims(text: str) -> list[dict]:
    out = []
    for part in SEP.split(text):
        m = DIM.search(part)
        if not m:
            continue
        a, b, c = m.groups()
        w, p = to_cm(a), to_cm(b)
        h = to_cm(c) if c else None
        out.append({"width_cm": w, "depth_cm": p, "height_cm": h, "raw": m.group(0)})
    return out


def count_entries(pages: list[PageData]) -> int:
    n = 0
    for p in pages:
        rows = sorted(p.rows, key=lambda r: (r.top, r.x0))
        for i, r in enumerate(rows):
            if CODES.match(r.text.strip()) and any(0 < x.top - r.top < 30 and abs(x.x0 - r.x0) < 30 and re.search(r"[A-Z]{3}", x.text) for x in rows[i + 1:i + 3]):
                n += 1
    return n


def assemble_g(pages: list[PageData]):
    from .layout_b import BCandidate
    cands, stats = [], {"opener_pages": [], "skipped_pages": [], "no_text_pages": [], "layout": "G"}
    pending_ambient = None   # (título da linha, imagens)
    for page in pages:
        rows = sorted(page.rows, key=lambda r: (r.top, r.x0))
        big = [r for r in rows if r.size >= 16 and re.search(r"[A-Z]{3}", r.text) and "heitor" not in r.text.lower()]
        title = big[0].text.strip() if big else None
        entries = [r for r in rows if CODES.match(r.text.strip())]
        # página com camadas de texto sobrepostas (exportação com versões repetidas): fica a maior de cada código
        best = {}
        for r in entries:
            k = re.sub(r"\s", "", r.text)
            if k not in best or r.size > best[k].size:
                best[k] = r
        if len(best) < len(entries):
            entries = sorted(best.values(), key=lambda r: r.top)
            keep_sizes = {round(r.size, 1) for r in entries}
            rows = [x for x in rows if any(abs(x.size - s) <= 0.3 for s in keep_sizes) or not CODES.match(x.text.strip())]
            sizes = sorted(keep_sizes)
            rows = [x for x in rows if x.size >= min(sizes) - 0.3 or x.size >= 16]
        imgs = [i for i in page.images if min(i.width, i.height) >= 140 and i.files.get("image")]
        if not entries:
            if imgs and title:
                pending_ambient = (title, imgs, page.number)
                stats["opener_pages"].append(page.number)
            else:
                stats["skipped_pages"].append(page.number)
            continue
        page_c = []
        for k, r in enumerate(entries):
            nxt = entries[k + 1].top if k + 1 < len(entries) else 1e9
            block = [x for x in rows if r.top < x.top < min(nxt, r.top + 60) and abs(x.x0 - r.x0) < 40]
            codes = [c.strip() for c in r.text.split("/")]
            name, dims = None, []
            for x in block:
                t = x.text.strip()
                if name is None and re.search(r"[A-ZÀ-Ý]{3}", t):
                    nm, _, rest = t.partition("—")
                    name = nm.strip()
                    dims += parse_dims(rest)
                else:
                    dims += parse_dims(t)
            if not name:
                continue
            variants = []
            for i, d in enumerate(dims):
                code = codes[i] if len(codes) == len(dims) else None
                g = lambda v: int(v) if v == int(v) else v
                label = " × ".join(f"{k} {g(v)}" for k, v in (("L", d["width_cm"]), ("P", d["depth_cm"]), ("A", d["height_cm"])) if v) + " cm"
                variants.append({"name": (f"{code} · " if code and len(codes) > 1 else "") + label, "width_cm": d["width_cm"], "depth_cm": d["depth_cm"],
                                 "height_cm": d["height_cm"], "diameter_cm": None, "source_page": page.number, "raw": d["raw"], "supplier_code": code})
            pretty = name.title().replace(" C/ ", " c/ ").replace(" Tp ", " tampo ")
            mats, fins = vocab([name])
            c = BCandidate(name=pretty, title_page=page.number, title_row=r, pages=[page.number], section=title)
            c.layout = "G"
            c.anchor = (r.x0, r.top + 10)
            c.data = {"codes": [{"code": x, "label": None, "page": page.number, "via": "rotulo_g"} for x in codes], "variants": variants, "designer": None,
                      "description": name, "collection": title.title() if title else None, "materials": mats, "finishes": fins,
                      "classification": classify(None, pretty, None)}
            page_c.append(c)
        # foto da peça: imagem à esquerda da entrada, na mesma faixa vertical
        for im in imgs:
            cy = (im.bbox[1] + im.bbox[3]) / 2
            owner = min(page_c, key=lambda c: abs(c.anchor[1] - cy) + (0 if im.bbox[2] <= c.anchor[0] + 10 else 300) + abs(c.anchor[0] - im.bbox[2]) * 0.2)
            owner.images.append({"page": page.number, "objid": im.objid, "bbox": im.bbox, "files": im.files, "w": im.width, "h": im.height, "hint": "design"})
        if pending_ambient and title and norm(pending_ambient[0]) == norm(title):
            for c in page_c:
                c.images += [{"page": pending_ambient[2], "objid": i.objid, "bbox": i.bbox, "files": i.files, "w": i.width, "h": i.height, "hint": "extra"} for i in pending_ambient[1]]
                c.pages = sorted(set(c.pages + [pending_ambient[2]]))
        pending_ambient = None
        for c in page_c:
            c.multi_on_page = len(page_c) > 1 and any(not any(i.get("hint") == "design" for i in x.images) for x in page_c)
        cands += page_c
    return cands, stats


def structure_g(c) -> dict:
    d = c.data
    return {"codes": d["codes"], "variants": d["variants"], "designer": None, "materials": d["materials"], "finishes": d["finishes"],
            "classification": d["classification"], "description": d["description"], "collection_original": d["collection"], "environment": None, "environment_reason": None}
