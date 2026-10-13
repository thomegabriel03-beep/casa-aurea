"""Layout J: grade de peças (foto recortada + legenda embaixo), com o texto convertido em curvas
(CorelDRAW e afins): a legenda só existe como desenho e é lida por OCR.

Legenda típica: 'BANQUETA AMSTERDÃ' / 'ACABAMENTO DISPONÍVEL:' / 'FIBRA - CORDA' / '48L X 56P X 1,20H'.
Nome lido por OCR com baixa confiança vai para 'Nome a conferir'. Nada é inventado.
"""
from __future__ import annotations

import os
import re
import subprocess

import pytesseract
from PIL import Image

from .classify import classify, norm, vocab
from .extract import PageData

DPI = 220
DIM = re.compile(r"(\d+(?:[.,]\d+)?)\s*L\s*[xX]\s*(\d+(?:[.,]\d+)?)\s*P\s*[xX]\s*(\d+(?:[.,]\d+)?)\s*[HA]\b")
DIAM = re.compile(r"(?:Ø|O|D)\s*(\d+(?:[.,]\d+)?)\s*[xX]\s*(\d+(?:[.,]\d+)?)\s*[HA]\b")


def fix_digits(t: str) -> str:
    """Troca comum do OCR dentro de medidas: S→5, O→0, I/l→1 entre dígitos e antes das letras de eixo."""
    def rep(m):
        return m.group(0).replace("S", "5").replace("O", "0").replace("I", "1").replace("l", "1")
    return re.sub(r"[\dSOIl][\dSOIl,\.]*(?=\s*[LPHA]\b)", rep, t)


def to_cm(v: str) -> float:
    x = float(v.replace(",", "."))
    return round(x * 100) if x < 5 else x


def ocr_lines(pdf: str, page: PageData, out: str):
    os.makedirs(out, exist_ok=True)
    base = os.path.join(out, f"j{page.number:03d}")
    if not os.path.exists(base + ".png"):
        subprocess.run(["pdftoppm", "-f", str(page.number), "-l", str(page.number), "-r", str(DPI), "-png", "-singlefile", pdf, base],
                       check=True, stderr=subprocess.DEVNULL)
    import json as _json
    if os.path.exists(base + ".json"):
        words = _json.load(open(base + ".json"))
    else:
        img = Image.open(base + ".png").convert("L")
        s = page.width / img.width
        d = pytesseract.image_to_data(img, config="--psm 11", output_type=pytesseract.Output.DICT)
        words = [{"t": d["text"][i], "c": float(d["conf"][i]), "x0": d["left"][i] * s, "x1": (d["left"][i] + d["width"][i]) * s,
                  "y": d["top"][i] * s, "h": d["height"][i] * s} for i in range(len(d["text"])) if d["text"][i].strip() and float(d["conf"][i]) > 30]
        _json.dump(words, open(base + ".json", "w"))
    lines = []
    for w in sorted(words, key=lambda w: (round(w["y"] / 3), w["x0"])):
        for L in lines:
            # legendas vizinhas ficam lado a lado: só junta palavras realmente próximas
            if abs(L["y"] - w["y"]) <= 4 and 0 <= w["x0"] - L["x1"] < max(6, 0.9 * w["h"]):
                L["words"].append(w)
                L["x1"] = max(L["x1"], w["x1"])
                break
        else:
            lines.append({"y": w["y"], "x0": w["x0"], "x1": w["x1"], "words": [w]})
    for L in lines:
        L["words"].sort(key=lambda w: w["x0"])
        L["text"] = " ".join(w["t"] for w in L["words"])
        L["conf"] = sum(w["c"] for w in L["words"]) / len(L["words"])
    return lines


def candidate_pages(pages: list[PageData]) -> int:
    return sum(1 for p in pages if not p.has_text and len([i for i in p.images if i.files.get("smask")]) >= 3)


def assemble_j(pdf: str, pages: list[PageData], out: str):
    from .layout_b import BCandidate
    cands, section = [], None
    stats = {"opener_pages": [], "skipped_pages": [], "no_text_pages": [], "layout": "J", "ocr_pages": []}
    for page in pages:
        if page.has_text:
            stats["skipped_pages"].append(page.number)
            continue
        imgs = [i for i in page.images if i.files.get("image") and min(i.width, i.height) >= 90
                and not ((i.bbox[2] - i.bbox[0]) > page.width * 0.8 and (i.bbox[3] - i.bbox[1]) > page.height * 0.6)]
        lines = ocr_lines(pdf, page, os.path.join(out, "_ocr"))
        stats["ocr_pages"].append(page.number)
        txt = " ".join(L["text"] for L in lines)
        m = re.search(r"LINHA DE\s+([A-ZÀ-Ý ,]+)", txt)
        if m:
            section = m.group(1).strip()
        if not imgs:
            stats["skipped_pages"].append(page.number)
            continue
        page_c = []
        for im in imgs:
            x0, y0, x1, y1 = im.bbox
            cap = sorted([L for L in lines if y1 - 8 <= L["y"] <= y1 + 115 and (x0 - 30) <= (L["x0"] + L["x1"]) / 2 <= (x1 + 30)], key=lambda L: (L["y"], L["x0"]))
            # linhas na mesma altura (nome quebrado em palavras) são unidas na ordem horizontal
            merged = []
            for L in cap:
                if merged and abs(merged[-1]["y"] - L["y"]) <= 4:
                    merged[-1] = {**merged[-1], "text": merged[-1]["text"] + " " + L["text"], "conf": (merged[-1]["conf"] + L["conf"]) / 2}
                else:
                    merged.append(dict(L))
            cap = merged
            if not cap:
                continue
            name_lines, fin, dims, conf = [], [], [], []
            state = "name"
            for L in cap:
                t = L["text"].strip()
                ft = fix_digits(t)
                if DIM.search(ft) or DIAM.search(ft):
                    dims.append(ft)
                    state = "done"
                elif re.search(r"ACABAMENTO", t, re.I):
                    state = "fin"
                elif state == "name" and re.fullmatch(r"[A-ZÀ-Ý][A-ZÀ-Ý \-]{2,40}", t):
                    name_lines.append(t)
                    conf.append(L["conf"])
                elif state == "fin":
                    fin.append(t)
            if not name_lines:
                continue
            if not dims:
                # medida quebrada em pedaços pelo OCR: junta a legenda inteira e procura de novo
                blob = fix_digits(re.sub(r"\s+", " ", " ".join(L["text"] for L in cap)))
                blob = re.sub(r"(\d)\s*([LPHA])\b", r"\1\2", blob)
                if DIM.search(blob):
                    dims.append(DIM.search(blob).group(0))
            name = " ".join(name_lines[:2]).title()
            variants = []
            for t in dims:
                mm = DIM.search(t)
                if mm:
                    w, p, h = (to_cm(x) for x in mm.groups())
                    if min(w, p, h) < 20:
                        continue   # leitura duvidosa do OCR: melhor sem medida do que medida errada
                    variants.append({"name": f"L {w:g} × P {p:g} × A {h:g} cm", "width_cm": w, "depth_cm": p, "height_cm": h, "diameter_cm": None,
                                     "source_page": page.number, "raw": t})
            fin = [x for x in fin if not re.search(r"\d\s*[LPHA]\b|\bX\b", fix_digits(x))]
            mats, fins = vocab(fin)
            c = BCandidate(name=name, title_page=page.number, title_row=None, pages=[page.number], section=section)
            c.layout = "J"
            c.anchor = ((x0 + x1) / 2, y1)
            c.images = [{"page": page.number, "objid": im.objid, "bbox": im.bbox, "files": im.files, "w": im.width, "h": im.height, "hint": "design"}]
            c.data = {"codes": [], "variants": variants, "designer": None, "description": ("Acabamento disponível: " + " ".join(fin)) if fin else None,
                      "collection": None, "materials": mats, "finishes": fins, "classification": classify(None, name, section),
                      "name_confidence": round(sum(conf) / len(conf), 1) if conf else 0}
            page_c.append(c)
        cands += page_c
    return cands, stats


def structure_j(c) -> dict:
    d = c.data
    return {"codes": [], "variants": d["variants"], "designer": None, "materials": d["materials"], "finishes": d["finishes"],
            "classification": d["classification"], "description": d["description"], "collection_original": None,
            "environment": None, "environment_reason": None, "ocr_name": True, "name_confidence": d["name_confidence"]}
