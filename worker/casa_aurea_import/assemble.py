"""Montagem das peças a partir das páginas: título → peça; páginas seguintes sem título → mesma peça.
Uma página pode ter várias peças (vários títulos): imagens e códigos vão para o título mais próximo."""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .extract import PageData, Row, find_codes, merged_rows, parse_dimensions
from .classify import classify, vocab, norm, THRESHOLD

MIN_IMG_SIDE = 140          # ícones e vinhetas ficam de fora
TITLE_MIN, TITLE_MAX = 22, 95
OPENER_SIZE = 100            # textos gigantes = abertura de seção
NOT_TITLES = {"sumario", "summary", "colecao", "collection", "indice"}


@dataclass
class Candidate:
    name: str
    title_page: int
    title_row: Row | None
    header: str | None = None
    section: str | None = None
    pages: list[int] = field(default_factory=list)
    images: list[dict] = field(default_factory=list)       # {'page', 'objid', 'bbox', 'files', 'w', 'h'}
    rows: list[Row] = field(default_factory=list)
    multi_on_page: bool = False


def is_title(r: Row, page: PageData) -> bool:
    if not (TITLE_MIN <= r.size <= TITLE_MAX) or r.x0 < 8 or r.x1 > page.width - 4 or r.top > page.height * 0.45:
        return False
    t = r.text.strip()
    if not (2 <= len(t) <= 40) or norm(t) in NOT_TITLES:
        return False
    letters = re.sub(r"[^A-Za-zÀ-ÿ]", "", t)
    return len(letters) >= 2 and t.upper() == t


def section_opener(page: PageData) -> str | None:
    big = [r for r in page.rows if r.size >= OPENER_SIZE]
    return " ".join(r.text for r in big) if big else None


def header_for(page: PageData, title: Row) -> str | None:
    # rótulo pequeno 'SOFÁ MOSS' / 'PUFF ATLAS' com o nome da peça: diz o tipo
    tn = norm(title.text)
    lab = [r for r in page.rows if r.size <= 9.5 and r.text.isupper() and tn and tn in norm(r.text) and norm(r.text) != tn]
    if lab:
        return sorted(lab, key=lambda r: abs(r.x0 - title.x0))[0].text
    return header_for_old(page, title)


def header_for_old(page: PageData, title: Row) -> str | None:
    cands = [r for r in page.rows if "|" in r.text and r.size < 14 and r.top < title.top + 5 and r.x0 >= 0]
    if cands:
        return sorted(cands, key=lambda r: title.top - r.top)[0].text
    small_above = [r for r in page.rows if r.size < 14 and title.top - 60 < r.top < title.top and r.x0 >= 0]
    return small_above[-1].text if small_above else None


def background_objids(pages: list[PageData]) -> set:
    """Imagem repetida em boa parte das páginas (fundo de slide, moldura) não é foto de peça."""
    from collections import Counter
    cnt = Counter(i.objid for p in pages for i in p.images)
    return {o for o, n in cnt.items() if n >= max(4, 0.3 * len(pages))}


def assemble(pages: list[PageData]) -> tuple[list[Candidate], dict]:
    products: list[Candidate] = []
    current: list[Candidate] = []
    section = None
    bg_ids = background_objids(pages)
    stats = {"opener_pages": [], "skipped_pages": [], "no_text_pages": []}
    for page in pages:
        if not page.has_text and page.images:
            stats["no_text_pages"].append(page.number)
        opener = section_opener(page)
        titles = [r for r in page.rows if is_title(r, page)]
        if opener and not titles:
            section = opener
            current = []
            stats["opener_pages"].append(page.number)
            continue
        imgs = [i for i in page.images if min(i.width, i.height) >= MIN_IMG_SIDE and i.files.get("image") and i.objid not in bg_ids]
        if titles:
            current = []
            for t in titles:
                c = Candidate(name=re.sub(r"[\s!¡?.:;-]+$", "", t.text).strip().title(), title_page=page.number, title_row=t, header=header_for(page, t), section=section,
                              multi_on_page=len(titles) > 1)
                products.append(c)
                current.append(c)
        if not current:
            stats["skipped_pages"].append(page.number)
            continue
        for c in current:
            if page.number not in c.pages:
                c.pages.append(page.number)
        # imagens: com vários títulos na página, cada imagem vai para o título mais próximo
        for im in imgs:
            target = current[0]
            if len(current) > 1 and titles:
                cx = (im.bbox[0] + im.bbox[2]) / 2
                target = min(current, key=lambda c: abs(((c.title_row.x0 + c.title_row.x1) / 2) - cx) if c.title_page == page.number else 1e9)
            target.images.append({"page": page.number, "objid": im.objid, "bbox": im.bbox, "files": im.files, "w": im.width, "h": im.height})
        for c in current:
            if len(current) == 1 or c.title_page != page.number:
                c.rows.extend((page.number, r) for r in page.rows)
            else:  # linhas da página dividida pela proximidade horizontal
                for r in page.rows:
                    near = min(current, key=lambda x: abs(((x.title_row.x0 + x.title_row.x1) / 2) - (r.x0 + r.x1) / 2))
                    if near is c:
                        c.rows.append((page.number, r))
    # mesma peça em duas páginas-título seguidas (ex.: foto alternativa antes da ficha):
    # a primeira, sem códigos nem medidas, vira galeria da seguinte. Peças com o mesmo nome
    # em categorias diferentes continuam separadas.
    merged: list[Candidate] = []
    for c in products:
        prev = merged[-1] if merged else None
        if (prev and norm(prev.name) == norm(c.name) and c.title_page == prev.pages[-1] + 1 and len(prev.pages) == 1
                and not find_codes([r for _, r in prev.rows]) and not any(parse_dimensions(r.text) for _, r in prev.rows)
                and (prev.header or "") == (c.header or "")):
            c.images = prev.images + c.images
            c.pages = prev.pages + c.pages
            c.rows = prev.rows + c.rows
            c.title_page = prev.title_page
            stats.setdefault("merged_title_pages", []).append(prev.title_page)
            merged[-1] = c
        else:
            merged.append(c)
    return merged, stats


def structure(c: Candidate, code_size: float | None = None) -> dict:
    """Converte a candidata em dados estruturados (sem inventar nada ausente)."""
    by_page: dict[int, list[Row]] = {}
    for pn, r in c.rows:
        by_page.setdefault(pn, []).append(r)
    codes, dims, texts, designer = [], [], [], None
    for pn, rows in by_page.items():
        for cd in find_codes(rows, code_size):
            cd["page"] = pn
            codes.append(cd)
        blacklist = re.compile(r"DESIGN|STUDIO|COD\.|CÓD|CONTEMPOR", re.I)
        block_group, last_top = None, None
        for r in merged_rows(rows):
            d = parse_dimensions(r.text)
            if not d:
                continue
            # rótulo do grupo de medidas: linha em português logo acima, na mesma coluna (ex.: 'TAMPO RETANGULAR')
            labels = [x for x in rows if 0 < r.top - x.top <= 45 and not x.italic and 6.5 <= x.size <= 9.5
                      and x.x0 < r.x0 + 60 and not re.search(r"\d", x.text) and not blacklist.search(x.text)
                      and len([w for w in x.text.split() if len(w) >= 3]) >= 1 and len(x.text) <= 50 and x.text.isupper()]
            found = sorted(labels, key=lambda x: r.top - x.top)[0].text if labels else None
            # o rótulo vale para o bloco inteiro de medidas logo abaixo dele
            if found:
                block_group = found
            elif last_top is None or r.top - last_top > 22:
                block_group = None
            d["group"] = block_group
            last_top = r.top
            d["page"] = pn
            dims.append(d)
        ordered = sorted(rows, key=lambda r: r.top)
        for i, r in enumerate(ordered):
            if re.match(r"^DESIGN BY$", r.text.strip(), re.I) and i + 1 < len(ordered):
                designer = " ".join(x.text for x in ordered[i + 1:i + 3] if x.top - r.top < 40).title()
            if r.size <= 9 and not r.italic:
                texts.append(r.text)
    # tira duplicatas de medida e separa o rótulo bilíngue do grupo (ex.: 'TAMPO RETANGULAR RECTANGULAR TOP')
    seen, variants = set(), []
    for d in dims:
        key = (d.get("width"), d.get("depth"), d.get("height"), d.get("diameter"), d.get("group"))
        if key in seen:
            continue
        seen.add(key)
        abbr = {"width": "L", "depth": "P", "height": "A", "diameter": "Ø"}
        label = " × ".join(f"{abbr[k]} {v:g}" for k, v in d.items() if k in abbr) + " cm"
        if d.get("group"):
            label = f"{d['group'].capitalize()} · {label}"
        variants.append({"name": label, "width_cm": d.get("width"), "depth_cm": d.get("depth"), "height_cm": d.get("height"),
                         "diameter_cm": d.get("diameter"), "source_page": d["page"], "raw": d["raw"]})
    uniq, seen_codes = [], set()
    for cd in codes:
        if cd["code"] not in seen_codes:
            seen_codes.add(cd["code"])
            uniq.append(cd)
    codes = uniq
    if not variants:
        variants = ldpa_variants(by_page)
    mats, fins = vocab(texts)
    cls = classify(c.header, c.name, c.section)
    if cls["type"] == "SOF" and not cls["subtype"]:
        tags = {norm(r.text) for rows in by_page.values() for r in rows if r.size <= 9.5 and r.text.isupper() and r.top < 90}
        tagtxt = " ".join(tags)
        if "cama" in tagtxt:
            cls["subtype"] = "Sofá-cama"
        elif "retratil" in tagtxt and "reclinavel" in tagtxt:
            cls["subtype"] = "Retrátil e reclinável"
        elif "retratil" in tagtxt:
            cls["subtype"] = "Retrátil"
        elif "reclinavel" in tagtxt:
            cls["subtype"] = "Reclinável"
        elif "modulado" in tagtxt or "modular" in tagtxt or "canto" in tagtxt:
            cls["subtype"] = "Modular"
    return {"codes": codes, "variants": variants, "designer": designer, "materials": mats, "finishes": fins, "classification": cls}


def ldpa_variants(by_page) -> list[dict]:
    """Fichas 'L 100 / 110 / 120 cm' + 'P 100 cm | A 87 cm' (larguras por módulo, profundidade e altura em comum),
    e trios em linha 'Canto L 135 cm P 135 cm A 63 cm'. Só o que está rotulado."""
    out = []
    for pn, rows in by_page.items():
        mrows = merged_rows(rows)
        text = " \n ".join(r.text for r in mrows)
        pm = re.search(r"\bP\s*(?:M[óo]dulos\s*)?(\d{2,3})\s*cm", text)
        am = re.search(r"\bA\s*(\d{2,3})\s*cm", text)
        P = int(pm.group(1)) if pm else None
        A = int(am.group(1)) if am else None
        prev_label = None
        for r in mrows:
            t = r.text.strip()
            for m in re.finditer(r"(?:^|\s)([A-Za-zÀ-ÿ]{4,20})?\s*L\s*(\d{2,3})\s*(?:cm)?\s*P\s*(\d{2,3})\s*(?:cm)?\s*A\s*(\d{2,3})\s*cm", t):
                lab = (m.group(1) or "").strip()
                out.append({"name": (lab.capitalize() + " · " if lab else "") + f"L {m.group(2)} × P {m.group(3)} × A {m.group(4)} cm",
                            "width_cm": int(m.group(2)), "depth_cm": int(m.group(3)), "height_cm": int(m.group(4)), "diameter_cm": None,
                            "source_page": pn, "raw": m.group(0).strip()})
            lm = re.match(r"^L\s+(?:([A-Za-zÀ-ÿ ]{3,30}?)\s+)?((?:\d{2,3}\s*/\s*)*\d{2,3})\s*cm\b", t)
            if lm:
                # rótulo do grupo: linha da própria ficha (mesmo corpo e coluna) logo acima
                near = prev_label if prev_label and abs(prev_label[1] - r.size) <= 0.6 and abs(prev_label[2] - r.x0) <= 15 and 0 < r.top - prev_label[3] <= 22 else None
                label = (lm.group(1) or (near[0] if near else "") or "").strip()
                for w in re.findall(r"\d{2,3}", lm.group(2)):
                    dims = " × ".join(x for x in (f"L {w}", f"P {P}" if P else None, f"A {A}" if A else None) if x) + " cm"
                    out.append({"name": (label.capitalize() + " · " if label else "") + dims, "width_cm": int(w), "depth_cm": P, "height_cm": A,
                                "diameter_cm": None, "source_page": pn, "raw": lm.group(0)})
            elif not re.search(r"\d", t) and len(t) <= 40 and r.size >= 10:
                prev_label = (t.split("  ")[0], r.size, r.x0, r.top)
    for pn, rows in by_page.items():
        ordered = sorted(rows, key=lambda r: (r.top, r.x0))
        for i, r in enumerate(ordered):
            hm = re.fullmatch(r"\s*([LDPAC])((?:\s*[xX×]\s*[LDPAC])+)\s*", r.text)
            if not hm:
                continue
            keys = [k.upper() for k in re.findall(r"[LDPAC]", r.text)]
            nxt = next((x for x in ordered[i + 1:i + 3] if re.fullmatch(r"\s*\d+(?:[.,]\d+)?(?:\s*[xX×]\s*\d+(?:[.,]\d+)?)+\s*(?:m|cm)?\s*", x.text)), None)
            if not nxt:
                continue
            vals = [float(v.replace(",", ".")) for v in re.findall(r"\d+(?:[.,]\d+)?", nxt.text)]
            if len(vals) != len(keys):
                continue
            vals = [round(v * 100) if v < 10 else v for v in vals]
            d = dict(zip(keys, vals))
            above = [x for x in ordered[max(0, i - 3):i] if not re.search(r"\d", x.text) and "dimens" not in norm(x.text) and len(x.text) <= 30 and r.top - x.top < 60]
            label = above[-1].text.strip() if above else ""
            g = lambda v: int(v) if v == int(v) else v
            parts = [(k2, d.get(k1)) for k1, k2 in (("L", "L"), ("C", "L"), ("P", "P"), ("A", "A"), ("D", "Ø")) if d.get(k1)]
            out.append({"name": (label.capitalize() + " · " if label else "") + " × ".join(f"{k} {g(v)}" for k, v in parts) + " cm",
                        "width_cm": d.get("L") or d.get("C"), "depth_cm": d.get("P"), "height_cm": d.get("A"), "diameter_cm": d.get("D"),
                        "source_page": pn, "raw": f"{r.text.strip()} = {nxt.text.strip()}"})
    seen, uniq = set(), []
    for v in out:
        if v["name"] not in seen:
            seen.add(v["name"])
            uniq.append(v)
    return uniq
