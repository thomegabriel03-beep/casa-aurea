"""Layout F: peças rotuladas 'Tipo + número' ('Rack 2470', 'Cadeira 2461') junto da foto, com um quadro
'Medidas' ('Buffet 242: 80 x 180 x 46 cm', linhas seguintes = outros tamanhos) e uma coluna 'Materiais'.

- O número do rótulo é o código do fornecedor.
- A ordem das medidas é descoberta no próprio catálogo: em cadeiras a maior medida é a altura;
  se ela vem primeiro, o catálogo usa A × L × P; senão, L × P × A.
"""
from __future__ import annotations

import re

from .classify import classify, norm, vocab
from .extract import PageData

LABEL = re.compile(r"^([A-ZÀ-Ý][A-Za-zÀ-ÿ\s/]{2,45}?)\s+(\d{2,5})$")
MEAS = re.compile(r"^(.{0,45}?)\s*(\d{2,5})?\s*:\s*(\d{1,3}(?:[.,]\d)?)\s*[xX]\s*(\d{1,3}(?:[.,]\d)?)\s*[xX]\s*(\d{1,3}(?:[.,]\d)?)\s*cm", re.I)
CONT = re.compile(r"^\s*(\d{1,3}(?:[.,]\d)?)\s*[xX]\s*(\d{1,3}(?:[.,]\d)?)\s*[xX]\s*(\d{1,3}(?:[.,]\d)?)\s*cm", re.I)


def typed(name: str) -> bool:
    return classify(None, name, None)["source"] == "nome (início)"


def count_labels(pages: list[PageData]) -> int:
    return sum(1 for p in pages for r in p.rows if LABEL.match(r.text.strip()) and typed(LABEL.match(r.text.strip()).group(1)))


def num(x):
    return float(x.replace(",", "."))


def assemble_f(pages: list[PageData]):
    from .layout_b import BCandidate
    cands, raw_meas = [], []
    stats = {"opener_pages": [], "skipped_pages": [], "no_text_pages": [], "layout": "F"}
    for page in pages:
        labels = []
        for r in page.rows:
            m = LABEL.match(r.text.strip())
            # rótulo de peça: 'Tipo número'; sem tipo conhecido também entra (fica 'Sem tipo' na revisão)
            if m and len(m.group(1).split()) <= 5 and r.size <= 9 and not m.group(1).strip().isupper():
                labels.append((r, m.group(1).strip(), m.group(2)))
        if not labels:
            stats["skipped_pages"].append(page.number)
            continue
        half = page.width / 2
        by_code = {}
        for r, nm, code in labels:
            if code in by_code:
                continue
            c = BCandidate(name=f"{nm} {code}", title_page=page.number, title_row=r, pages=[page.number])
            c.layout = "F"
            c.anchor = ((r.x0 + r.x1) / 2, r.top)
            c.data = {"codes": [{"code": code, "label": None, "page": page.number, "via": "rotulo_f"}], "variants": [], "designer": None,
                      "description": None, "collection": None, "materials": [], "finishes": [], "classification": None, "raw": [], "type_name": nm,
                      "side": 0 if r.x0 < half else 1}
            by_code[code] = c
        page_c = list(by_code.values())
        # quadro de medidas
        rows = sorted(page.rows, key=lambda r: (0 if r.x0 < half else 1, r.top))
        last = None
        for r in rows:
            t = r.text.strip()
            m = MEAS.match(t)
            if m:
                prefix, code = m.group(1).strip(), m.group(2)
                target = by_code.get(code) if code else None
                if target is None and norm(prefix):
                    named = [c for c in page_c if norm(c.data["type_name"]).startswith(norm(prefix).rstrip("s"))]
                    target = named[0] if len(named) == 1 else None
                if target is None:
                    side = 0 if r.x0 < half else 1
                    same = [c for c in page_c if c.data["side"] == side] or page_c
                    target = next((c for c in same if norm(prefix) and norm(c.data["type_name"]).startswith(norm(prefix).rstrip("s"))), None) or \
                        (same[0] if len(same) == 1 else None)
                if target is not None:
                    target.data["raw"].append((num(m.group(3)), num(m.group(4)), num(m.group(5)), t))
                    last = target
                continue
            m2 = CONT.match(t)
            if m2 and last is not None:
                last.data["raw"].append((num(m2.group(1)), num(m2.group(2)), num(m2.group(3)), t))
                continue
        # coluna de materiais: texto longo da mesma metade da página
        for c in page_c:
            side = c.data["side"]
            text = [r.text for r in page.rows if (0 if r.x0 < half else 1) == side and r.size <= 8 and len(r.text) > 40 and not MEAS.match(r.text)]
            c.data["description"] = " ".join(text)[:900] or None
            mats, fins = vocab(text)
            c.data["materials"], c.data["finishes"] = mats, fins
            sec = next((r.text for r in page.rows if (0 if r.x0 < half else 1) == side and r.size <= 6.5 and r.text.isupper()
                        and r.text not in ("MATERIAIS", "CORES")), None)
            c.data["classification"] = classify(None, c.name, sec)
            c.section = sec
        imgs = [i for i in page.images if min(i.width, i.height) >= 140 and i.files.get("image")]
        for im in imgs:
            cx, cy = (im.bbox[0] + im.bbox[2]) / 2, (im.bbox[1] + im.bbox[3]) / 2
            owner = min(page_c, key=lambda c: (c.anchor[0] - cx) ** 2 + (c.anchor[1] - cy) ** 2)
            owner.images.append({"page": page.number, "objid": im.objid, "bbox": im.bbox, "files": im.files, "w": im.width, "h": im.height})
        # rótulo colado à foto: a atribuição só é incerta se alguma peça ficou sem foto
        for c in page_c:
            c.multi_on_page = len(page_c) > 1 and any(not x.images for x in page_c)
        cands.extend(page_c)
        raw_meas += [(c.data["classification"]["type"], x) for c in page_c for x in c.data["raw"]]
    # 'Ref 2428' em página de ambiente = foto de uma peça já rotulada: vira galeria dela, não peça nova
    by = {}
    for c in cands:
        by.setdefault(c.data["codes"][0]["code"], []).append(c)
    keep = []
    for c in cands:
        if re.match(r"^ref\.?$", c.data["type_name"], re.I):
            owners = [o for o in by[c.data["codes"][0]["code"]] if o is not c and not re.match(r"^ref\.?$", o.data["type_name"], re.I)]
            if owners:
                o = owners[0]
                o.images += [{**im, "hint": "extra"} for im in c.images]
                o.pages = sorted(set(o.pages + c.pages))
                continue
        keep.append(c)
    cands = keep
    # ordem das medidas aprendida no catálogo (cadeiras/poltronas/banquetas: a altura é a maior medida)
    seats = [x for t, x in raw_meas if t in ("CAD", "POL", "BAQ")]
    first_max = sum(1 for a, b, c, _ in seats if a >= max(b, c))
    order = "ALP" if seats and first_max >= len(seats) * 0.6 else "LPA"
    stats["dims_order"] = "A × L × P" if order == "ALP" else "L × P × A"
    for c in cands:
        for a, b, d, t in c.data["raw"]:
            h, w, p = (a, b, d) if order == "ALP" else (d, a, b)
            g = lambda x: int(x) if x == int(x) else x
            c.data["variants"].append({"name": f"L {g(w)} × P {g(p)} × A {g(h)} cm", "width_cm": w, "depth_cm": p, "height_cm": h, "diameter_cm": None,
                                       "source_page": c.title_page, "raw": t})
    return cands, stats


def structure_f(c) -> dict:
    d = c.data
    return {"codes": d["codes"], "variants": d["variants"], "designer": None, "materials": d["materials"], "finishes": d["finishes"],
            "classification": d["classification"], "description": d["description"], "collection_original": None, "environment": None, "environment_reason": None}
