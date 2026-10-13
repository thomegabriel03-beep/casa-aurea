"""Layout H (folders): rótulo do tipo ('CADEIRA'), nome grande logo abaixo ('ASSIS') e linhas de opção
'- COM COSTURA BASE FIXA – CD284'. Mesas trazem tabelas 'MS3050 - C. 2,20 L. 1,10 A. 0,78 [REDONDO]'
agrupadas por tampo. Medidas das cadeiras ficam só no desenho (em mm) e não são convertidas.
"""
from __future__ import annotations

import re

from .classify import classify, norm, vocab
from .extract import PageData

CODE = r"[A-Z]{2,4}\d{2,5}[A-Z]?"
OPTION = re.compile(rf"^[-–]\s*(.*?)\s*[-–]+\s*({CODE})\s*$|^[-–]\s*({CODE})\s*$")
TABLE = re.compile(rf"^({CODE})\s*-\s*C\.\s*([\d,]+)\s*L\.\s*([\d,]+)\s*A\.\s*([\d,]+)\s*(REDONDO)?", re.I)


def m2cm(v):
    x = float(v.replace(",", "."))
    return round(x * 100) if x < 10 else x


def anchors(page: PageData):
    out = []
    for r in page.rows:
        t = r.text.strip()
        if 12 <= r.size <= 20 and t.isalpha() and t.isupper() and classify(None, t.title(), None)["source"] == "nome (início)":
            name = [x for x in page.rows if x.size >= 25 and 0 < x.top - r.top < 35 and abs(x.x0 - r.x0) < 10]
            if name:
                out.append((r, name[0]))
    return out


def count_anchors(pages):
    return sum(len(anchors(p)) for p in pages)


def assemble_h(pages: list[PageData]):
    from .layout_b import BCandidate
    cands, stats = [], {"opener_pages": [], "skipped_pages": [], "no_text_pages": [], "layout": "H"}
    for page in pages:
        an = anchors(page)
        if not an:
            stats["skipped_pages"].append(page.number)
            continue
        page_c = []
        for i, (tr, nr) in enumerate(an):
            # região do bloco: da âncora até a próxima âncora à direita (mesma faixa) e abaixo (mesma coluna)
            right = min([a[0].x0 for a in an if a[0].x0 > tr.x0 + 20 and abs(a[0].top - tr.top) < 120] + [page.width])
            below = min([a[0].top for a in an if a[0].top > tr.top + 20 and a[0].x0 < right - 20] + [page.height])
            block = [r for r in page.rows if tr.x0 - 5 <= r.x0 < right and tr.top <= r.top < below]
            opts, variants, group, drawing, text = [], [], None, [], []
            # colunas do bloco (ex.: duas tabelas lado a lado) lidas uma de cada vez
            for r in sorted(block, key=lambda r: (int((r.x0 - tr.x0) // 300), r.top, r.x0)):
                t = r.text.strip()
                mo = OPTION.match(t)
                mt = TABLE.match(t)
                if mo:
                    opts.append({"code": mo.group(2) or mo.group(3), "label": (mo.group(1) or "").strip(" -–").lower() or None})
                elif mt:
                    code, c, l, a, red = mt.groups()
                    c, l, a = m2cm(c), m2cm(l), m2cm(a)
                    dims = {"width_cm": None, "depth_cm": None, "diameter_cm": c} if red else {"width_cm": c, "depth_cm": l, "diameter_cm": None}
                    g = lambda v: int(v) if v == int(v) else v
                    size = f"Ø {g(c)} × A {g(a)} cm" if red else f"L {g(c)} × P {g(l)} × A {g(a)} cm"
                    variants.append({"name": " · ".join(x for x in (group.capitalize() if group else None, size) if x), "height_cm": a, **dims,
                                     "source_page": page.number, "raw": t, "supplier_code": code})
                    opts.append({"code": code, "label": group.lower() if group else None})
                elif re.fullmatch(r"\d{3,4}", t):
                    drawing.append(t)
                elif r.size < 10 and t.isupper() and not re.search(r"\d", t) and len(t) > 6 and ":" not in t:
                    group = t
                elif r is not tr and r is not nr and r.size < 10:
                    text.append(t)
            tipo, nome = tr.text.strip().title(), nr.text.strip().title()
            desc = opts[0]["label"] if len(opts) == 1 and opts[0]["label"] else None
            name = f"{tipo} {nome}" + (f" {desc}" if desc else "")
            seen, codes = set(), []
            for o in opts:
                if o["code"] not in seen:
                    seen.add(o["code"])
                    codes.append({"code": o["code"], "label": o["label"], "page": page.number, "via": "rotulo_h"})
            if not variants and len(codes) > 1:   # banqueta alta/baixa etc.: opções sem medida rotulada
                variants = [{"name": c["label"].capitalize() if c["label"] else c["code"], "width_cm": None, "depth_cm": None, "height_cm": None,
                             "diameter_cm": None, "source_page": page.number, "raw": c["code"], "supplier_code": c["code"]} for c in codes]
            mats, fins = vocab(text)
            c = BCandidate(name=name, title_page=page.number, title_row=nr, pages=[page.number])
            c.layout = "H"
            c.anchor = ((tr.x0 + right) / 2, (tr.top + below) / 2)
            c.region = (tr.x0 - 5, tr.top, right, below)
            c.data = {"codes": codes, "variants": variants, "designer": None, "description": " ".join(text)[:600] or None, "collection": None,
                      "materials": mats, "finishes": fins, "classification": classify(None, name, None), "drawing_numbers": drawing[:20]}
            page_c.append(c)
        imgs = [i for i in page.images if min(i.width, i.height) >= 140 and i.files.get("image")]
        for im in imgs:
            x0, y0, x1, y1 = im.bbox
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            inside = [c for c in page_c if c.region[0] <= cx < c.region[2] and c.region[1] - 40 <= cy < c.region[3]]
            if (x1 - x0) > page.width * 0.4 and not inside:      # ambientação grande da página
                for c in page_c:
                    c.images.append({"page": page.number, "objid": im.objid, "bbox": im.bbox, "files": im.files, "w": im.width, "h": im.height, "hint": "extra"})
                continue
            owner = inside[0] if inside else min(page_c, key=lambda c: (c.anchor[0] - cx) ** 2 + (c.anchor[1] - cy) ** 2)
            owner.images.append({"page": page.number, "objid": im.objid, "bbox": im.bbox, "files": im.files, "w": im.width, "h": im.height, "hint": "design"})
        cands += page_c
    return cands, stats


def structure_h(c) -> dict:
    d = c.data
    return {"codes": d["codes"], "variants": d["variants"], "designer": None, "materials": d["materials"], "finishes": d["finishes"],
            "classification": d["classification"], "description": d["description"], "collection_original": None, "environment": None,
            "environment_reason": None, "drawing_numbers": d["drawing_numbers"]}
