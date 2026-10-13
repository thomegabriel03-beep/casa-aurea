"""Layout B: catálogos em que a ficha fica na própria página da foto, com título em caixa mista
('Cadeira Búzios'), código solto ('CAD032', 'BAQ022-B') e medidas 'LxPxA' ('55X58X81').

Cada CÓDIGO ancora a peça. Sob um título de produto, todos os códigos são variações da mesma peça;
sob um título 'Coleção X', cada código com base diferente é uma peça própria da coleção.
Páginas sem código (ambientação, aberturas) não viram peça.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .classify import classify, norm, vocab
from .extract import PageData, Row

CODE = re.compile(r"^[A-Z]{2,6}\d{2,6}[A-Z]?(?:\s*-\s*[A-Z0-9]{1,10})*$")
INLINE = re.compile(r"^(.{2,60}?)\s+-\s+([A-Z]{2,6}\d{2,6}[A-Z]?(?:\s*-\s*[A-Z0-9]{1,10})*)$")
DIMS = re.compile(r"^\s*(\d{2,4})\s*(Ø)?\s*[xX]\s*\.?(\d{2,4})\s*(?:[xX]\s*\.?(\d{2,4}))?\s*(?:cm)?\s*$")
OPENER = 90
TITLE_MIN = 22
BODY_MAX = 20
OUTDOOR = re.compile(r"area externa|areas externas|outdoor|ambiente externo", re.I)


def base(code: str) -> str:
    return re.split(r"\s*-\s*", code)[0]


def parse_dims(text: str):
    m = DIMS.match(text.replace("ø", "Ø"))
    if not m:
        return None
    a, diam, b, c = m.groups()
    a, b = int(a), int(b)
    if diam:   # '45ØX45' = diâmetro 45 × altura 45
        return {"diameter_cm": a, "height_cm": b, "width_cm": None, "depth_cm": None, "raw": text.strip()}
    if c:
        return {"width_cm": a, "depth_cm": b, "height_cm": int(c), "diameter_cm": None, "raw": text.strip()}
    return {"width_cm": a, "depth_cm": b, "height_cm": None, "diameter_cm": None, "raw": text.strip()}


def dims_label(d):
    parts = [("L", d["width_cm"]), ("P", d["depth_cm"]), ("A", d["height_cm"]), ("Ø", d["diameter_cm"])]
    return " × ".join(f"{k} {v}" for k, v in parts if v) + " cm"


@dataclass
class BCandidate:
    name: str
    title_page: int
    title_row: Row | None
    header: str | None = None
    section: str | None = None
    pages: list = field(default_factory=list)
    images: list = field(default_factory=list)
    rows: list = field(default_factory=list)
    multi_on_page: bool = False
    layout: str = "B"
    data: dict = field(default_factory=dict)
    anchor: tuple = (0, 0)


def blocks(rows: list[Row]) -> list[list[Row]]:
    """Agrupa as linhas em blocos de texto (colunas) pela posição horizontal e continuidade vertical."""
    rows = [r for r in rows if r.size < OPENER]
    out: list[list[Row]] = []
    for r in sorted(rows, key=lambda r: (r.top, r.x0)):
        for b in out:
            last = b[-1]
            if abs(b[0].x0 - r.x0) <= 70 and 0 <= r.top - last.top <= 80:
                b.append(r)
                break
        else:
            out.append([r])
    # título sozinho logo acima de um bloco sem título (ex.: título alinhado diferente) = mesmo bloco
    merged: list[list[Row]] = []
    for b in sorted(out, key=lambda b: b[0].top):
        prev = merged[-1] if merged else None
        only_title = prev is not None and all(r.size >= TITLE_MIN for r in prev)
        has_title = any(r.size >= TITLE_MIN for r in b)
        if only_title and not has_title and 0 <= b[0].top - prev[-1].top <= 130 and abs(prev[0].x0 - b[0].x0) <= 260:
            prev.extend(b)
        else:
            merged.append(b)
    return merged


def parse_block(block: list[Row]):
    """Lê um bloco de cima para baixo e devolve as peças que ele descreve."""
    title, collection, designer = None, None, None
    entries, desc, pending = [], [], None
    last_title_top = None
    for r in block:
        t = r.text.strip()
        if r.size >= TITLE_MIN:
            m = re.match(r"^cole[cç][aã]o\s*(.*)$", t, re.I)
            if m:
                collection = m.group(1).strip() or None
                title, last_title_top = None, r.top
                continue
            if collection == "" or (collection is None and last_title_top is not None and title is None and r.top - last_title_top < 45 and entries == []):
                pass
            if title is not None and last_title_top is not None and r.top - last_title_top < 45:
                title = f"{title} {t}"          # título em duas linhas ('Mesa Ripada' / 'Lateral')
            elif collection is not None and title is None and last_title_top is not None and r.top - last_title_top < 62 and not entries:
                collection = f"{collection} {t}".strip()   # 'Coleção' / 'Nissan'
            else:
                title = t
            last_title_top = r.top
            continue
        if re.match(r"^designer\s*:", t, re.I):
            designer = t.split(":", 1)[1].strip()
            continue
        mi = INLINE.match(t)
        if CODE.match(t.replace(" ", "")) or CODE.match(t):
            entries.append({"code": re.sub(r"\s+", "", t), "label": pending, "dims": []})
            pending = None
            continue
        if mi and CODE.match(mi.group(2).replace(" ", "")):
            entries.append({"code": re.sub(r"\s+", "", mi.group(2)), "label": mi.group(1).strip(), "dims": []})
            pending = None
            continue
        d = parse_dims(t)
        if d:
            if entries:
                entries[-1]["dims"].append({**d, "label": pending})
            else:
                entries.append({"code": None, "label": pending, "dims": [{**d, "label": None}]})
            pending = None
            continue
        if re.match(r"^sob medida$", t, re.I):
            (entries[-1]["dims"] if entries else desc).append({"label": "Sob medida", "raw": t} if entries else t)
            continue
        # linha curta antes de código/medida = rótulo; o resto é descrição literal do catálogo
        if pending:
            desc.append(pending)
        pending = t if len(t) <= 32 else None
        if pending is None:
            desc.append(t)
    if pending:
        desc.append(pending)
    return title, collection, designer, entries, desc


def build_products(page: PageData, section: str | None, opener_collection: str | None):
    prods = []
    for blk in blocks(page.rows):
        title, collection, designer, entries, desc = parse_block(blk)
        coded = [e for e in entries if e["code"]]
        if not coded and not any(e["dims"] for e in entries):
            continue
        if not title and not collection and not coded:
            continue
        coll = collection or opener_collection
        groups = []
        if title:
            groups.append((title, entries))
        else:
            by_base: dict[str, list] = {}
            for e in entries:
                by_base.setdefault(base(e["code"]) if e["code"] else "—", []).append(e)
            for b, es in by_base.items():
                label = next((e["label"] for e in es if e["label"]), None)
                # rótulo que começa por um tipo ('Poltrona', 'Mesa Gota') nomeia a peça; rótulo de opção
                # ('Trama vertical', 'Com braço') vira variação e a peça leva o nome da coleção + código
                typed = label and classify(None, label, None)["source"] == "nome (início)"
                if typed:
                    nm = f"{label} ({'Coleção ' + coll if coll else b})"
                else:
                    nm = f"{coll} {b}" if coll else (label or b)
                groups.append((nm, es))
        for name, es in groups:
            variants, codes = [], []
            for e in es:
                if e["code"]:
                    codes.append({"code": e["code"], "label": e["label"], "page": page.number, "via": "padrao_b"})
                for d in e["dims"]:
                    if "width_cm" not in d:
                        variants.append({"name": d["label"], "width_cm": None, "depth_cm": None, "height_cm": None, "diameter_cm": None, "source_page": page.number, "raw": d["raw"]})
                        continue
                    lab = " · ".join(x for x in (e["label"] if len(es) > 1 else None, d.get("label")) if x)
                    variants.append({"name": (f"{lab} · " if lab else "") + dims_label(d), "width_cm": d["width_cm"], "depth_cm": d["depth_cm"],
                                     "height_cm": d["height_cm"], "diameter_cm": d["diameter_cm"], "source_page": page.number, "raw": d["raw"],
                                     "supplier_code": e["code"]})
            seen, uniq = set(), []
            for c in codes:
                if c["code"] not in seen:
                    seen.add(c["code"])
                    uniq.append(c)
            text_lines = [x for x in desc if isinstance(x, str)]
            mats, fins = vocab(text_lines + [name])
            mats = [m for m in mats if m != "Madeira maciça" or any("maci" in norm(x) for x in text_lines)]
            cls = classify(None, name, section)
            prods.append({"name": name, "codes": uniq, "variants": variants, "designer": designer, "description": " ".join(text_lines).strip() or None,
                          "collection": coll, "materials": mats, "finishes": fins, "classification": cls,
                          "anchor": ((blk[0].x0 + blk[0].x1) / 2, blk[0].top)})
    return prods


def assemble_b(pages: list[PageData]):
    """Peças a partir dos códigos. Páginas sem código são ambientação e não viram peça."""
    cands: list[BCandidate] = []
    section, opener_collection = None, None
    stats = {"opener_pages": [], "skipped_pages": [], "no_text_pages": [], "layout": "B"}
    intro = " ".join(r.text for p in pages[:5] for r in p.rows)
    env = "outdoor" if OUTDOOR.search(norm(intro)) else None
    stats["catalog_environment"] = env
    for page in pages:
        big = [r for r in page.rows if r.size >= OPENER]
        if big:
            txt = " ".join(r.text for r in big).strip()
            m = re.match(r"^cole[cç][aã]o\s+(.*)$", txt, re.I)
            if m:
                opener_collection = m.group(1).strip().title()
            elif len(txt) > 3:
                section, opener_collection = txt, None
            stats["opener_pages"].append(page.number)
        prods = build_products(page, section, opener_collection)
        if not prods:
            if not big:
                stats["skipped_pages"].append(page.number)
            continue
        imgs = [i for i in page.images if min(i.width, i.height) >= 140 and i.files.get("image")]
        for p in prods:
            c = BCandidate(name=p["name"], title_page=page.number, title_row=None, section=section, pages=[page.number],
                           multi_on_page=len(prods) > 1, data=p, anchor=p["anchor"])
            cands.append(c)
        page_c = cands[-len(prods):]
        for im in imgs:
            cx, cy = (im.bbox[0] + im.bbox[2]) / 2, (im.bbox[1] + im.bbox[3]) / 2
            target = min(page_c, key=lambda c: (c.anchor[0] - cx) ** 2 + (c.anchor[1] - cy) ** 2) if len(page_c) > 1 else page_c[0]
            target.images.append({"page": page.number, "objid": im.objid, "bbox": im.bbox, "files": im.files, "w": im.width, "h": im.height})
    return cands, stats


def structure_b(c: BCandidate, env: str | None) -> dict:
    d = c.data
    return {"codes": d["codes"], "variants": d["variants"], "designer": d["designer"], "materials": d["materials"], "finishes": d["finishes"],
            "classification": d["classification"], "description": d["description"], "collection_original": d["collection"],
            "environment": env, "environment_reason": "catálogo de móveis para área externa" if env else None}
