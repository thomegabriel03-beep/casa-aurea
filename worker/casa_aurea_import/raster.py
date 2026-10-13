"""Catálogos sem camada de texto (ex.: 'Microsoft Print to PDF', páginas viram imagens).

É o nível 2 da regra de imagens e o caminho de OCR da regra de texto:
- a página é renderizada na resolução nativa das imagens incorporadas (sem ampliar pixels);
- o texto vem de OCR (tesseract), usado só onde não há texto nativo;
- o produto é recortado da página pela diferença em relação ao fundo; recorte duvidoso vai para revisão.
Nada é inventado: nome lido por OCR com baixa confiança vira "Nome a conferir".
Produz exatamente o mesmo formato de peça do caminho com texto nativo (mesma gravação, mesma revisão).
"""
from __future__ import annotations

import hashlib
import os
import re
import subprocess

import cv2
import numpy as np
import pytesseract
from PIL import Image, ImageOps

from .classify import norm, vocab
from .quality import assess, hamming, phash, save_web

NAME_CFG = "--psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def native_dpi(pdf: str) -> int:
    out = subprocess.run(["pdfimages", "-list", pdf], capture_output=True, text=True).stdout.splitlines()[2:]
    ppi = [int(l.split()[12]) for l in out if len(l.split()) > 12 and l.split()[12].isdigit()]
    return max(set(ppi), key=ppi.count) if ppi else 150


def render_pages(pdf: str, out: str, dpi: int) -> list[str]:
    os.makedirs(out, exist_ok=True)
    if not any(f.endswith(".png") for f in os.listdir(out)):
        subprocess.run(["pdftoppm", "-r", str(dpi), "-png", pdf, os.path.join(out, "p")], check=True)
    return sorted(os.path.join(out, f) for f in os.listdir(out) if f.endswith(".png"))


def ocr_words(img: Image.Image) -> list[dict]:
    """Leitura rápida (resolução nativa) só para saber o papel da página: foto ou técnica."""
    d = pytesseract.image_to_data(img.convert("L"), config="--psm 11", output_type=pytesseract.Output.DICT)
    return [{"t": d["text"][i], "c": float(d["conf"][i]), "x": d["left"][i], "y": d["top"][i], "h": d["height"][i]}
            for i in range(len(d["text"])) if d["text"][i].strip() and float(d["conf"][i]) > 50]


def ocr_text(img: Image.Image, box) -> str:
    c = img.crop(box)
    c = c.resize((c.width * 2, c.height * 2), Image.LANCZOS)
    return pytesseract.image_to_string(c, config="--psm 4")


def ocr_name(img: Image.Image, box) -> tuple[str, float]:
    """Nome em fonte decorativa: binariza, engrossa e lê como uma linha só. Devolve texto e confiança."""
    best = ("", 0.0)
    for dil in (1, 2):
        c = np.asarray(img.crop(box).convert("L"))
        c = cv2.resize(c, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)
        _, b = cv2.threshold(c, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        if b.mean() < 127:
            b = 255 - b
        b = 255 - cv2.dilate(255 - b, np.ones((dil, dil), np.uint8), iterations=2)
        ys, xs = np.where(b < 128)
        if not len(xs):
            continue
        b = b[max(0, ys.min() - 20):ys.max() + 20, max(0, xs.min() - 20):xs.max() + 20]
        d = pytesseract.image_to_data(Image.fromarray(b), config=NAME_CFG, output_type=pytesseract.Output.DICT)
        ws = [(d["text"][i], float(d["conf"][i])) for i in range(len(d["text"])) if d["text"][i].strip()]
        if ws:
            text = " ".join(w for w, _ in ws)
            conf = sum(c for _, c in ws) / len(ws)
            if conf > best[1]:
                best = (text, conf)
    return best


def product_crops(img: Image.Image, region, min_frac=0.02, max_items=4) -> list[tuple]:
    """Recorta objetos que diferem do fundo dentro de uma região. Retorna [(caixa, confiança)]."""
    x0, y0, x1, y1 = region
    a = np.asarray(img.convert("RGB"), dtype=np.int16)[y0:y1, x0:x1]
    h, w, _ = a.shape
    border = np.concatenate([a[:6].reshape(-1, 3), a[-6:].reshape(-1, 3), a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    diff = np.abs(a - bg).sum(axis=2)
    mask = (diff > 36).astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((25, 25), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask)
    boxes = []
    for i in range(1, n):
        bx, by, bw, bh, area = stats[i]
        if area < min_frac * w * h or bw < 120 or bh < 80:
            continue
        fill = area / float(bw * bh)
        pad = int(0.03 * max(bw, bh))
        box = (max(0, bx - pad) + x0, max(0, by - pad) + y0, min(w, bx + bw + pad) + x0, min(h, by + bh + pad) + y0)
        # fotos que sangram até a borda da página são normais; recorte duvidoso = objeto muito esparso
        conf = 0.9 if fill > 0.15 else 0.55
        boxes.append((box, conf, area))
    boxes.sort(key=lambda b: -b[2])
    return [(b[0], b[1]) for b in boxes[:max_items]]


DIM_WIDTH = re.compile(r"(\d)\s*Lugar(?:es)?[^/\n]{0,20}/\s*(\d+[.,]?\d*)\s*cm", re.I)


def parse_widths(text: str) -> list[dict]:
    """Larguras por módulo, como escritas no catálogo ('1 Lugar /145cm'). '0,95cm' no catálogo = 0,95 m."""
    out, seen = [], set()
    for lug, v in DIM_WIDTH.findall(text):
        x = float(v.replace(",", "."))
        cm = round(x * 100) if x < 10 else round(x)
        key = (lug, cm)
        if key in seen or not (40 <= cm <= 500):
            continue
        seen.add(key)
        out.append({"name": f"{lug} lugar(es) · L {cm} cm", "width_cm": cm, "depth_cm": None, "height_cm": None, "diameter_cm": None, "raw": f"{lug} Lugar /{v}cm"})
    return out


def sofa_classification(text: str) -> dict:
    t = norm(text)
    cues = sum(k in t for k in ("assento", "encosto", "braco", "lugar"))
    if cues < 3:
        return {"type": None, "subtype": None, "confidence": 0.0, "source": None, "matched": None}
    sub = None
    if "sofa cama" in t or "sofacama" in t:
        sub = "Sofá-cama"
    elif "chaise" in t:
        sub = "Chaise"
    elif "retratil" in t and "reclin" in t:
        sub = "Retrátil e reclinável"
    elif "retratil" in t:
        sub = "Retrátil"
    elif "reclin" in t:
        sub = "Reclinável"
    return {"type": "SOF", "subtype": sub, "confidence": 0.85, "source": "estrutura descrita (assento, encosto, braço, lugares)", "matched": None}


def analyze_raster(pdf: str, supplier: str, catalog: str, out: str):
    """Detecta peças em catálogo rasterizado: página de foto (pouco texto) + página técnica (muito texto)."""
    import json as _json
    dpi = native_dpi(pdf)
    paths = render_pages(pdf, os.path.join(out, "_pages"), dpi)
    roles_path = os.path.join(out, "roles.json")
    roles = _json.load(open(roles_path)) if os.path.exists(roles_path) else {}
    pages = []
    for i, pth in enumerate(paths, 1):
        if str(i) not in roles:
            print(f"  página {i}/{len(paths)}", flush=True)
            n = len(ocr_words(Image.open(pth).convert("RGB")))
            roles[str(i)] = "tecnica" if n > 80 else "foto" if n <= 25 else "outra"
            _json.dump(roles, open(roles_path, "w"))
        pages.append({"n": i, "path": pth, "role": roles[str(i)]})
    items_dir = os.path.join(out, "items")
    os.makedirs(items_dir, exist_ok=True)
    budget = float(os.environ.get("RASTER_BUDGET_S", "0")) or None
    import time as _t
    started = _t.time()
    products, info_pages, skipped = [], [], []
    i = 0
    while i < len(pages):
        p = pages[i]
        nxt = pages[i + 1] if i + 1 < len(pages) else None
        if p["role"] == "foto" and nxt and nxt["role"] == "tecnica":
            group = [p, nxt]
            i += 2
        elif p["role"] == "tecnica":
            group = [p]
            i += 1
        else:
            skipped.append(p["n"])
            i += 1
            continue
        key = hashlib.sha1(f"{norm(supplier)}|{norm(catalog)}|{group[0]['n']}".encode()).hexdigest()[:16]
        cached = os.path.join(items_dir, key + ".json")
        if os.path.exists(cached):          # checkpoint: peça já processada
            products.append(_json.load(open(cached)))
            continue
        if budget and _t.time() - started > budget:
            raise TimeoutError("tempo do bloco esgotado; rode de novo para continuar do checkpoint")
        print(f"  peça nas páginas {[g['n'] for g in group]}", flush=True)
        for g in group:
            g["img"] = Image.open(g["path"]).convert("RGB")
        hero = group[0] if group[0]["role"] == "foto" else None
        spec = group[-1]
        W, H = spec["img"].size
        name, conf = ("", 0.0)
        if hero:
            name, conf = ocr_name(hero["img"], (int(W * .55), int(H * .885), int(W * .985), int(H * .965)))
        n2, c2 = ocr_name(spec["img"], (int(W * .02), int(H * .03), int(W * .30), int(H * .10)))
        if c2 > conf:
            name, conf = n2, c2
        name = re.sub(r"\s*SOFA\s*CAMA$", "", name).strip()
        text = ocr_text(spec["img"], (0, 0, int(W * .55), H))
        pt_lines = [l for l in text.splitlines() if l.strip()]
        media = []
        crops = []
        if hero:
            for box, cconf in product_crops(hero["img"], (0, int(H * .12), W, int(H * .88)), max_items=1):
                crops.append((hero, box, cconf))
        # a faixa do rodapé (aviso legal do fornecedor) fica de fora do recorte
        for box, cconf in product_crops(spec["img"], (int(W * .52), int(H * .03), W, int(H * .90)), min_frac=0.03, max_items=4):
            crops.append((spec, box, cconf))
        for pg, box, cconf in crops:
            im = pg["img"].crop(box)
            tmp = os.path.join(out, "media", key, f"p{pg['n']:03d}-x{box[0]}y{box[1]}.png")
            os.makedirs(os.path.dirname(tmp), exist_ok=True)
            im.save(tmp)
            q = assess(im, {"image": tmp}, None, "page_crop")
            if cconf < 0.7 and q["quality"] in ("CATALOG_READY", "DETAIL_ACCEPTABLE"):
                q["quality"] = "EDITORIAL_REVIEW"
                q["quality_reasons"].append("recorte automático a conferir")
                q["uses"] = []
            path = save_web(im, tmp)
            media.append({**q, "phash": phash(im), "page": pg["n"], "path": os.path.relpath(path, out), "area": (box[2] - box[0]) * (box[3] - box[1]), "crop_box": box})
        primary = media[0] if media and hero else (max(media, key=lambda m: m["area"]) if media else None)
        for m in media:
            m["role"] = "primary" if m is primary else "gallery"
        mats, fins = vocab(pt_lines)
        mats = [m for m in mats if m != "Madeira maciça"]   # 'madeira de reflorestamento' não é madeira maciça
        cls = sofa_classification(text)
        prod = {
            "key": key, "name": name.title() if name else "", "name_confidence": round(conf, 1), "supplier": supplier, "catalog": catalog,
            "title_page": group[0]["n"], "pages": [g["n"] for g in group], "header": None, "section": None, "designer": None,
            "original_codes": [], "variants": parse_widths(text), "materials": mats, "finishes": fins, "classification": cls,
            "composition": "\n".join(pt_lines[:40]), "media": sorted(media, key=lambda m: m["role"] != "primary"), "media_errors": [],
            "multi_on_page": False, "visibility": "internal", "curation_tier": "archive", "ocr": True,
        }
        for m in prod["media"]:
            m["crop_box"] = list(m["crop_box"])
        _json.dump(prod, open(cached, "w"), ensure_ascii=False, default=str)
        products.append(prod)
    return products, {"opener_pages": [], "skipped_pages": skipped, "no_text_pages": [p["n"] for p in pages], "raster": True, "dpi": dpi}
