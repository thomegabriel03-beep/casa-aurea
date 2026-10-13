"""Layout D: coleções por linha (ex.: tapetes). Uma página de linha traz o nome grande e a ficha
(composição, tamanhos, diâmetros, origem); as páginas seguintes mostram os desenhos com rótulo
'Alberto 01', 'Alberto 02'…

Cada DESENHO é uma peça (aparência própria). Os tamanhos da ficha da linha viram as variantes de cada desenho.
A foto do desenho é a imagem logo acima do rótulo; detalhes e ambientação próximos entram na galeria.
"""
from __future__ import annotations

import re

from .classify import classify, norm
from .extract import PageData

LABEL = re.compile(r"^([A-ZÀ-Ý][A-Za-zÀ-ÿ'´ ]{1,30}?)\s+(\d{1,3})$")
SIZE = re.compile(r"^(?:[^:\d]{0,30}:\s*)?(\d{2,3})\s*[xX]\s*(\d{2,3})\s*(?:cm)?$", re.I)
DIAM = re.compile(r"^Ø\s*(\d{2,3})$")


def count_labels(pages: list[PageData]) -> int:
    return sum(1 for p in pages for r in p.rows if 9 <= r.size <= 14 and LABEL.match(r.text.strip()))


def line_spec(page: PageData):
    big = [r for r in page.rows if r.size >= 40 and re.fullmatch(r"[A-ZÀ-Ý ]{3,30}", r.text.strip())]
    if not big:
        return None
    text = [r.text.strip() for r in sorted(page.rows, key=lambda r: (r.top, r.x0)) if r.size < 20]
    sizes, diams, spec = [], [], []
    for t in text:
        m, d = SIZE.match(t), DIAM.match(t)
        if m:
            sizes.append((int(m.group(1)), int(m.group(2))))
        elif d:
            diams.append(int(d.group(1)))
        elif not re.fullmatch(r"\d{1,3}", t):
            spec.append(t)
    flags = [t for t in spec if t.upper() in ("LANÇAMENTO", "NOVO", "EXCLUSIVO")]
    spec = [t for t in spec if t not in flags]
    return {"line": big[0].text.strip().title(), "sizes": sizes, "diams": diams, "spec": " · ".join(spec), "tags": flags, "page": page.number}


def assemble_d(pages: list[PageData]):
    from .layout_b import BCandidate
    cands, line, section = [], None, None
    stats = {"opener_pages": [], "skipped_pages": [], "no_text_pages": [], "layout": "D", "lines": []}
    for page in pages:
        spec = line_spec(page)
        if spec:
            line = spec
            stats["lines"].append(spec["line"])
            stats["opener_pages"].append(page.number)
            continue
        big = [r for r in page.rows if r.size >= 30]
        labels = [r for r in page.rows if 9 <= r.size <= 14 and LABEL.match(r.text.strip())]
        if not labels:
            if big:
                section = " ".join(r.text for r in big)   # ex.: 'TAPETINHOS'
            stats["skipped_pages"].append(page.number)
            continue
        imgs = [i for i in page.images if min(i.width, i.height) >= 140 and i.files.get("image")]
        page_cands = []
        for lab in labels:
            name = lab.text.strip()
            cx = (lab.x0 + lab.x1) / 2
            variants = []
            if line and norm(name).startswith(norm(line["line"])):
                variants = [{"name": f"{w} × {l} cm", "width_cm": w, "depth_cm": l, "height_cm": None, "diameter_cm": None, "source_page": line["page"], "raw": f"{w}x{l}"}
                            for w, l in line["sizes"]] + \
                           [{"name": f"Ø {d} cm", "width_cm": None, "depth_cm": None, "height_cm": None, "diameter_cm": d, "source_page": line["page"], "raw": f"Ø {d}"}
                            for d in line["diams"]]
            cls = classify(None, f"tapete {name}", section)
            c = BCandidate(name=name, title_page=page.number, title_row=None, section=section, pages=[page.number] + ([line["page"]] if line else []),
                           multi_on_page=False)
            c.layout = "D"
            c.anchor = (cx, lab.top)
            c.data = {"codes": [], "variants": variants, "designer": None,
                      "description": (line["spec"] if line else None), "collection": line["line"] if line else None,
                      "materials": [], "finishes": [], "classification": cls, "tags": line["tags"] if line else []}
            page_cands.append(c)
        # foto do desenho: a imagem cuja coluna contém o rótulo e que termina logo acima dele
        for im in imgs:
            ix0, iy0, ix1, iy1 = im.bbox
            icx = (ix0 + ix1) / 2
            owner = min(page_cands, key=lambda c: abs(c.anchor[0] - icx) + (0 if ix0 - 5 <= c.anchor[0] <= ix1 + 5 else 400))
            role_hint = "design" if (ix0 - 5 <= owner.anchor[0] <= ix1 + 5 and 0 <= owner.anchor[1] - iy1 <= 60 and (iy1 - iy0) > (ix1 - ix0) * 0.9) else "extra"
            owner.images.append({"page": page.number, "objid": im.objid, "bbox": im.bbox, "files": im.files, "w": im.width, "h": im.height, "hint": role_hint})
        cands.extend(page_cands)
    return cands, stats


def structure_d(c) -> dict:
    d = c.data
    return {"codes": [], "variants": d["variants"], "designer": None, "materials": [], "finishes": [], "classification": d["classification"],
            "description": d["description"], "collection_original": d["collection"], "environment": None, "environment_reason": None}
