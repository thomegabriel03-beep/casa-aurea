"""Layout K: cada página é uma imagem única (foto + texto desenhados juntos); o PDF só tem o número da página
como texto. A ficha é lida por OCR na própria imagem:
  'Wellington' (nome, letra cursiva → quase sempre a conferir) / 'poltrona elétrica' (tipo) /
  'Módulo 1 Assento - C: 86cm | P: 92cm | A: 82cm' (medidas; C = comprimento/largura).
A foto da peça é recortada da imagem pela diferença em relação ao fundo.
"""
from __future__ import annotations

import json
import os
import re

import pytesseract
from PIL import Image

from .classify import classify, norm
from .extract import PageData
from .raster import product_crops

DIMS = re.compile(r"C\s*[:;]\s*(\d{2,3})\s*[ceo]?[mn]?\s*[|/Il]?\s*P\s*[:;]\s*(\d{2,3})\s*[ceo]?[mn]?\s*[|/Il]?\s*A\s*[:;]\s*(\d{2,3})", re.I)


def fix_ocr_numbers(t: str) -> str:
    """'1]O6cm' → '106cm', '8lem' → '81cm', '4Icm' → '41cm' (só dentro de números seguidos de unidade)."""
    def rep(m):
        return m.group(1) + m.group(2).replace("l", "1").replace("I", "1").replace("]", "1").replace("[", "1").replace("|", "1").replace("O", "0") + "cm"
    return re.sub(r"([:\s-])([\dlIO\]\[|]{2,5})\s*[ceo][mn]\b", rep, t)


def page_image(page: PageData):
    big = [i for i in page.images if i.files.get("image") and (i.bbox[2] - i.bbox[0]) > page.width * 0.8 and (i.bbox[3] - i.bbox[1]) > page.height * 0.8]
    return big[0] if big else None


def count_pages(pages):
    return sum(1 for p in pages if page_image(p) and sum(len(r.text) for r in p.rows) < 20)


def assemble_k(pages: list[PageData], out: str):
    from .layout_b import BCandidate
    cache_dir = os.path.join(out, "_ocrk")
    os.makedirs(cache_dir, exist_ok=True)
    cands, prev = [], None
    stats = {"opener_pages": [], "skipped_pages": [], "no_text_pages": [], "layout": "K", "ocr_pages": []}
    for page in pages:
        im = page_image(page)
        if not im or sum(len(r.text) for r in page.rows) >= 20:
            stats["skipped_pages"].append(page.number)
            continue
        cp = os.path.join(cache_dir, f"k{page.number:03d}.json")
        if os.path.exists(cp):
            data = json.load(open(cp))
        else:
            img = Image.open(im.files["image"]).convert("L")
            d = pytesseract.image_to_data(img, config="--psm 3", output_type=pytesseract.Output.DICT)
            data = {"w": img.width, "h": img.height, "words": [[d["text"][i], float(d["conf"][i]), d["left"][i], d["top"][i], d["height"][i], d["block_num"][i], d["line_num"][i], d["par_num"][i]]
                                                            for i in range(len(d["text"])) if d["text"][i].strip()]}
            json.dump(data, open(cp, "w"))
        stats["ocr_pages"].append(page.number)
        lines = {}
        for t, c, x, y, h, b, ln, par in data["words"]:
            k = (b, par, ln)
            L = lines.setdefault(k, {"words": [], "y": y, "x": x, "h": h, "conf": []})
            L["words"].append(t)
            L["conf"].append(c)
            L["h"] = max(L["h"], h)
        lines = sorted(lines.values(), key=lambda L: L["y"])
        for L in lines:
            L["text"] = fix_ocr_numbers(" ".join(L["words"]))
        dims = [L for L in lines if DIMS.search(L["text"])]
        sheet = dims or [L for L in lines if re.search(r"\bC\s*:", L["text"]) and re.search(r"\bP\s*:", L["text"])]
        if not sheet:
            if prev is not None:     # página de ambientação da peça anterior
                prev.images.append({"page": page.number, "objid": im.objid, "bbox": im.bbox, "files": im.files, "w": im.width, "h": im.height, "hint": "extra"})
                prev.pages.append(page.number)
            else:
                stats["skipped_pages"].append(page.number)
            continue
        if not dims:
            dims = sheet     # ficha presente, mas medidas com 'ou' / ilegíveis: peça sem medida estruturada
        top = [L for L in lines if L["y"] < dims[0]["y"] and not re.search(r"imagens meramente", L["text"], re.I)]
        name_l = top[0] if top else None
        type_l = next((L for L in top[1:] if classify(None, L["text"], None)["source"] == "nome (início)"), None)
        name = re.sub(r"[^A-Za-zÀ-ÿ' ]", "", name_l["text"]).strip().title() if name_l else ""
        conf = sum(name_l["conf"]) / len(name_l["conf"]) if name_l else 0
        variants = []
        for L in dims:
            for m in DIMS.finditer(L["text"]):
                w, p, h = (int(x) for x in m.groups())
                if min(w, p, h) < 25 and max(w, p, h) >= 60:
                    continue   # dígito perdido no OCR ('P: 16' num sofá): melhor sem medida
                label = L["text"][:m.start()].strip(" -–:")
                label = re.sub(r"M[ée]dulo", "Módulo", label).replace("Brago", "Braço")
                variants.append({"name": (label + " · " if label else "") + f"L {w} × P {p} × A {h} cm", "width_cm": w, "depth_cm": p, "height_cm": h,
                                 "diameter_cm": None, "source_page": page.number, "raw": L["text"]})
        typeline = type_l["text"] if type_l else None
        cls = classify(typeline, name, None)
        if cls["type"] == "SOF" and typeline and not cls["subtype"]:
            tn = norm(typeline)
            cls["subtype"] = "Retrátil e reclinável" if "retratil" in tn and "reclin" in tn else ("Retrátil" if "retratil" in tn else ("Reclinável" if "reclin" in tn else None))
        # foto da peça recortada da página (fora da faixa de texto do topo)
        pimg = Image.open(im.files["image"]).convert("RGB")
        y0 = int((max(L["y"] + L["h"] for L in dims) + 20)) if dims else 0
        y0 = min(y0, int(pimg.height * 0.45))
        crops = product_crops(pimg, (0, y0, pimg.width, int(pimg.height * 0.95)), min_frac=0.03, max_items=3)
        files = []
        for i, (box, cconf) in enumerate(crops or [((0, 0, pimg.width, pimg.height), 0.5)]):
            fn = os.path.join(cache_dir, f"k{page.number:03d}-{i}.png")
            pimg.crop(box).save(fn)
            files.append({"page": page.number, "objid": im.objid, "bbox": None, "files": {"image": fn}, "w": box[2] - box[0], "h": box[3] - box[1],
                          "hint": "design" if i == 0 else "extra", "source_type": "page_crop"})
        c = BCandidate(name=name, title_page=page.number, title_row=None, pages=[page.number])
        c.layout = "K"
        c.images = files
        c.data = {"codes": [], "variants": variants, "designer": None, "description": typeline, "collection": None, "materials": [], "finishes": [],
                  "classification": cls, "name_confidence": round(conf, 1)}
        cands.append(c)
        prev = c
    return cands, stats


def structure_k(c) -> dict:
    d = c.data
    return {"codes": [], "variants": d["variants"], "designer": None, "materials": [], "finishes": [], "classification": d["classification"],
            "description": d["description"], "collection_original": None, "environment": None, "environment_reason": None,
            "ocr_name": True, "name_confidence": d["name_confidence"]}
