"""Layout I: título da peça em caixa mista que começa pelo tipo ('Mesa Bergen', 'Cadeira Miami'),
seguido de linhas de especificação ('Tubo: 1 7/8"', 'Base: Laminado Carvalho Americano').
Pode haver várias peças por página; medidas costumam estar só no desenho técnico.
"""
from __future__ import annotations

import re

from .classify import classify, vocab
from .extract import PageData


def titles(page: PageData):
    out = []
    rows = sorted(page.rows, key=lambda r: r.top)
    for r in rows:
        t = r.text.strip()
        if not (10.5 <= r.size <= 16) or not (5 <= len(t) <= 45) or t.isupper() or re.search(r"\d", t):
            continue
        if classify(None, t, None)["source"] != "nome (início)":
            continue
        specs = [x for x in rows if 0 < x.top - r.top <= 40 and abs(x.x0 - r.x0) < 15 and x.size < r.size]
        if specs:
            out.append(r)
    return out


def count_titles(pages):
    return sum(len(titles(p)) for p in pages)


def assemble_i(pages: list[PageData]):
    from .layout_b import BCandidate
    cands, stats = [], {"opener_pages": [], "skipped_pages": [], "no_text_pages": [], "layout": "I"}
    for page in pages:
        ts = titles(page)
        if not ts:
            stats["skipped_pages"].append(page.number)
            continue
        page_c = []
        for r in ts:
            spec, y = [], r.top
            for x in sorted(page.rows, key=lambda x: x.top):
                if x.top > y and x.top - y <= (32 if y == r.top else 16) and abs(x.x0 - r.x0) < 15 and x.size < r.size:
                    spec.append(x.text.strip())
                    y = x.top
            drawing = [x.text.strip() for x in page.rows if re.fullmatch(r"\d+,\d{2}(?:\s*/\s*\d+,\d{2})*\s*m", x.text.strip())]
            name = r.text.strip()
            mats, fins = vocab(spec)
            c = BCandidate(name=name, title_page=page.number, title_row=r, pages=[page.number])
            c.layout = "I"
            c.anchor = ((r.x0 + r.x1) / 2, r.top)
            c.data = {"codes": [], "variants": [], "designer": None, "description": " · ".join(spec) or None, "collection": None,
                      "materials": mats, "finishes": fins, "classification": classify(None, name, None), "drawing_numbers": drawing[:20]}
            page_c.append(c)
        imgs = [i for i in page.images if min(i.width, i.height) >= 140 and i.files.get("image")]
        big = [i for i in imgs if (i.bbox[2] - i.bbox[0]) > page.width * 0.6]
        for im in imgs:
            if im in big and len(page_c) > 1:       # foto de ambiente da página inteira: galeria de todas
                for c in page_c:
                    c.images.append({"page": page.number, "objid": im.objid, "bbox": im.bbox, "files": im.files, "w": im.width, "h": im.height, "hint": "extra"})
                continue
            cx, cy = (im.bbox[0] + im.bbox[2]) / 2, (im.bbox[1] + im.bbox[3]) / 2
            owner = min(page_c, key=lambda c: (c.anchor[0] - cx) ** 2 + (c.anchor[1] - cy) ** 2)
            owner.images.append({"page": page.number, "objid": im.objid, "bbox": im.bbox, "files": im.files, "w": im.width, "h": im.height,
                                 "hint": "extra" if im in big else "design"})
        for c in page_c:
            c.multi_on_page = len(page_c) > 1 and any(not any(i.get("hint") == "design" for i in x.images) for x in page_c)
        cands += page_c
    return cands, stats


def structure_i(c) -> dict:
    d = c.data
    return {"codes": [], "variants": [], "designer": None, "materials": d["materials"], "finishes": d["finishes"], "classification": d["classification"],
            "description": d["description"], "collection_original": None, "environment": None, "environment_reason": None,
            "drawing_numbers": d["drawing_numbers"] or None}
