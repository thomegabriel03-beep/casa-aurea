"""Layout C: catálogos editoriais (InDesign) em que cada peça tem um bloco descritivo
('Estrutura em madeira…', 'Composição: O Sofá Abrigo…') e as medidas aparecem só no desenho técnico.

- O texto vem do PDF; páginas com texto em curvas ou fonte sem mapeamento são lidas por OCR.
- Cada bloco descritivo é uma peça; uma página dupla pode ter duas (uma por metade).
- Nome: frase do próprio texto ('O Sofá Abrigo'), ou o maior título da metade da página; lido por OCR = a conferir.
- Medidas só entram quando o texto diz o que são ('Altura total 84cm', 'módulos de 90, 100 ou 110cm').
  Números soltos no desenho ficam guardados como estão, sem virar largura/altura.
"""
from __future__ import annotations

import os
import re
import subprocess

import pytesseract
from PIL import Image

from .classify import classify, norm, vocab
from .extract import PageData

KEY = re.compile(r"\bestrutura\b", re.I)
TYPEWORDS = r"sof[aá](?:-cama)?|poltrona|puff|pufe|chaise|namoradeira|cadeira|banqueta|recamier|otomana"
NAMED = re.compile(r"\b(?i:o|a)\s+((?i:" + TYPEWORDS + r"))\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-zà-ÿ]{2,})")


def page_text_or_ocr(pdf: str, page: PageData, out: str) -> tuple[list[dict], bool]:
    """Linhas com posição. Se a página não tem texto utilizável, usa OCR (marcado)."""
    rows = [{"x": r.x0, "y": r.top, "size": r.size, "text": r.text} for r in page.rows
            if not re.match(r"^(voltar ao índice|\d{1,3})$", r.text.strip(), re.I)]
    if sum(len(r["text"]) for r in rows) > 120:
        return rows, False
    os.makedirs(out, exist_ok=True)
    base = os.path.join(out, f"ocr{page.number:03d}")
    if not os.path.exists(base + ".png"):
        subprocess.run(["pdftoppm", "-f", str(page.number), "-l", str(page.number), "-r", "110", "-png", "-singlefile", pdf, base], check=True)
    img = Image.open(base + ".png").convert("L")
    scale = page.width / img.width
    d = pytesseract.image_to_data(img, config="--psm 3", output_type=pytesseract.Output.DICT)
    lines = {}
    for i, w in enumerate(d["text"]):
        if not w.strip() or float(d["conf"][i]) < 40:
            continue
        k = (d["block_num"][i], d["par_num"][i], d["line_num"][i])
        L = lines.setdefault(k, {"x": d["left"][i] * scale, "y": d["top"][i] * scale, "size": d["height"][i] * scale, "words": []})
        L["words"].append(w)
        L["size"] = max(L["size"], d["height"][i] * scale)
    return [{"x": L["x"], "y": L["y"], "size": L["size"], "text": " ".join(L["words"])} for L in lines.values()], True


def dims_from_prose(text: str) -> list[dict]:
    t = norm(text)
    out = []
    m = re.search(r"modulos de ([\d, ou e]+?)\s*cm", t)
    widths = [int(x) for x in re.findall(r"\d{2,3}", m.group(1))] if m else []
    h = re.search(r"altura (?:total )?(?:de )?(\d{2,3})\s*cm", t)
    p = re.search(r"profundidade(?: total)?(?: de assento)?:? (?:de )?(\d{2,3})\s*cm", t)
    for w in widths:
        out.append({"name": f"Módulo L {w} cm", "width_cm": w, "depth_cm": int(p.group(1)) if p else None,
                    "height_cm": int(h.group(1)) if h else None, "diameter_cm": None, "raw": m.group(0)})
    if not out and (h or p):
        out.append({"name": "Medidas descritas", "width_cm": None, "depth_cm": int(p.group(1)) if p else None,
                    "height_cm": int(h.group(1)) if h else None, "diameter_cm": None, "raw": (h.group(0) if h else "") + " " + (p.group(0) if p else "")})
    return out


def assemble_c(pdf: str, pages: list[PageData], out: str):
    from .layout_b import BCandidate
    cands = []
    stats = {"opener_pages": [], "skipped_pages": [], "no_text_pages": [], "layout": "C", "ocr_pages": []}
    for page in pages:
        rows, ocr = page_text_or_ocr(pdf, page, os.path.join(out, "_ocr"))
        if ocr:
            stats["ocr_pages"].append(page.number)
        keys = [r for r in rows if KEY.search(r["text"])]
        if not keys:
            stats["skipped_pages"].append(page.number)
            continue
        half = page.width / 2
        # uma peça por metade da página que tenha bloco descritivo (página dupla)
        sides = sorted({0 if r["x"] < half else 1 for r in keys})
        for side in sides:
            x0, x1 = (0, half) if side == 0 else (half, page.width)
            if len(sides) == 1:
                x0, x1 = 0, page.width
            part = [r for r in rows if x0 <= r["x"] < x1]
            text = " ".join(r["text"] for r in sorted(part, key=lambda r: (r["y"], r["x"])))
            named = NAMED.search(text)
            titles = sorted([r for r in part if r["size"] >= 18 and re.fullmatch(r"[A-Za-zÀ-ÿ]{3,20}", r["text"].strip())], key=lambda r: -r["size"])
            name, conf, typeword = None, 0.0, None
            if named:
                typeword, name, conf = named.group(1), named.group(2).capitalize(), (70.0 if ocr else 95.0)
            elif titles:
                name, conf = titles[0]["text"].strip().capitalize(), (60.0 if ocr else 92.0)
            if name and len(name) % 2 == 0 and len(name) >= 4 and all(name[i].lower() == name[i + 1].lower() for i in range(0, len(name), 2)):
                name = name[::2].capitalize()      # texto em negrito falso (cada letra desenhada duas vezes)
            if not typeword:
                tw = re.search(r"\b(" + TYPEWORDS + r")\b", text, re.I)
                typeword = tw.group(1) if tw else None
            cls = classify(None, f"{typeword} {name or ''}" if typeword else (name or ""), None)
            fabric = re.search(r"\bTEC\.?\s*(\d{2,5})", text, re.I)
            loose = re.findall(r"(?<![\w/])\d{2,3}(?:/\d{2,3})+|(?<![\w/,.])\d{2,3}(?![\w/,.])", " ".join(r["text"] for r in part if r["size"] < 10 and re.fullmatch(r"[\d/ -]+", r["text"].strip())))
            mats, fins = vocab([text])
            mats = [m for m in mats if m != "Madeira maciça" or "madeira macica" in norm(text)]
            desc = re.sub(r"\s+", " ", text[text.lower().find("estrutura"):])[:900]
            c = BCandidate(name=name or "", title_page=page.number, title_row=None, pages=[page.number], multi_on_page=len(sides) > 1)
            c.data = {"name": name or "", "codes": [], "variants": dims_from_prose(text), "designer": None, "description": desc, "collection": None,
                      "materials": mats, "finishes": fins, "classification": cls, "anchor": ((x0 + x1) / 2, 0),
                      "ocr": ocr, "name_confidence": conf, "fabric_ref": f"Tec. {fabric.group(1)}" if fabric else None, "drawing_numbers": loose[:40]}
            c.anchor = ((x0 + x1) / 2, page.height / 2)
            imgs = [i for i in page.images if min(i.width, i.height) >= 140 and i.files.get("image") and x0 <= (i.bbox[0] + i.bbox[2]) / 2 < x1]
            c.images = [{"page": page.number, "objid": i.objid, "bbox": i.bbox, "files": i.files, "w": i.width, "h": i.height} for i in imgs]
            c.layout = "C"
            cands.append(c)
    return cands, stats


def structure_c(c) -> dict:
    d = c.data
    return {"codes": [], "variants": d["variants"], "designer": None, "materials": d["materials"], "finishes": d["finishes"],
            "classification": d["classification"], "description": d["description"], "collection_original": None,
            "environment": None, "environment_reason": None, "ocr_name": d["ocr"], "name_confidence": d["name_confidence"],
            "fabric_ref": d["fabric_ref"], "drawing_numbers": d["drawing_numbers"]}
