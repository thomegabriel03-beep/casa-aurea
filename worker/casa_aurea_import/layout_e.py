"""Layout E: uma peça por página, título pequeno em caixa alta que começa pelo tipo ('CADEIRA FLORENCE'),
e as fotos montadas numa colagem única (várias vistas numa só imagem).

- A colagem é dividida em vistas: primeiro pelas emendas retas entre painéis, depois pelos objetos
  separados por fundo branco. Cada vista vira uma foto da galeria; a principal é a vista inteira da peça.
- Páginas 'AMBIENTE' sem nome de peça entram como fotos de ambientação da peça anterior.
- Texto com letras duplicadas (negrito falso) é normalizado antes da leitura.
"""
from __future__ import annotations

import os
import re

import numpy as np
from PIL import Image

from .classify import classify, norm
from .extract import PageData
from .raster import product_crops


def undouble(t: str) -> str:
    s = t.replace(" ", "")
    if len(s) >= 4 and len(s) % 2 == 0 and all(s[i] == s[i + 1] for i in range(0, len(s), 2)):
        out, i = "", 0
        while i < len(t):
            out += t[i]
            i += 2 if i + 1 < len(t) and t[i + 1] == t[i] else 1
        return out
    return " ".join(undouble(w) if len(w) >= 4 else w for w in t.split(" ")) if " " in t else t


def is_title(text: str) -> bool:
    t = text.strip()
    if not (4 <= len(t) <= 40) or t.upper() != t or re.search(r"\d", t) or re.fullmatch(r"(\w ){3,}\w", t):
        return False
    return classify(None, t.title(), None)["source"] == "nome (início)"


def xy_cut(g, x0, y0, x1, y1, out, depth=0, th=0.4, minp=280):
    reg = g[y0:y1, x0:x1]
    h, w = reg.shape
    best = None
    if w > 2 * minp:
        d = (np.abs(np.diff(reg, axis=1)) > 14).mean(axis=0)
        i = int(np.argmax(d[minp:w - minp])) + minp
        if d[i] > th:
            best = ("v", i, d[i])
    if h > 2 * minp:
        d = (np.abs(np.diff(reg, axis=0)) > 14).mean(axis=1)
        i = int(np.argmax(d[minp:h - minp])) + minp
        if d[i] > th and (best is None or d[i] > best[2]):
            best = ("h", i, d[i])
    if best is None or depth > 4:
        out.append((x0, y0, x1, y1))
        return out
    k, i, _ = best
    if k == "v":
        xy_cut(g, x0, y0, x0 + i + 1, y1, out, depth + 1)
        xy_cut(g, x0 + i + 1, y0, x1, y1, out, depth + 1)
    else:
        xy_cut(g, x0, y0, x1, y0 + i + 1, out, depth + 1)
        xy_cut(g, x0, y0 + i + 1, x1, y1, out, depth + 1)
    return out


def split_collage(path: str, out_dir: str, tag: str) -> list[dict]:
    img = Image.open(path).convert("RGB")
    g = np.asarray(img.convert("L")).astype(np.int16)
    views = []
    for (x0, y0, x1, y1) in xy_cut(g, 0, 0, img.width, img.height, []):
        panel = img.crop((x0, y0, x1, y1))
        comps = product_crops(panel, (0, 0, panel.width, panel.height), min_frac=0.03, max_items=6)
        boxes = [b for b, conf in comps if conf >= 0.9] if len(comps) > 1 else []
        for b in (boxes or [(0, 0, panel.width, panel.height)]):
            box = (x0 + b[0], y0 + b[1], x0 + b[2], y0 + b[3])
            if (box[2] - box[0]) < 200 or (box[3] - box[1]) < 200:
                continue
            fn = os.path.join(out_dir, f"{tag}-x{box[0]}y{box[1]}.png")
            img.crop(box).save(fn)
            arr = np.asarray(img.crop(box).convert("L")).astype(np.int16)
            cover = float((arr < 235).mean())
            # quanto o objeto encosta nas bordas: vista inteira da peça encosta pouco; close-up enche o quadro
            bg = np.median(np.concatenate([arr[:4, :4].ravel(), arr[:4, -4:].ravel(), arr[-4:, :4].ravel(), arr[-4:, -4:].ravel()]))
            edge = np.concatenate([arr[:3].ravel(), arr[-3:].ravel(), arr[:, :3].ravel(), arr[:, -3:].ravel()])
            touch = float((np.abs(edge - bg) > 30).mean())
            cover = float((np.abs(arr - bg) > 28).mean())   # cobertura do objeto em relação ao fundo do próprio painel
            views.append({"file": fn, "box": box, "cover": cover, "touch": touch, "area": (box[2] - box[0]) * (box[3] - box[1])})
    return views


def assemble_e(pages: list[PageData], out: str):
    from .layout_b import BCandidate
    crop_dir = os.path.join(out, "_crops")
    os.makedirs(crop_dir, exist_ok=True)
    cands, stats = [], {"opener_pages": [], "skipped_pages": [], "no_text_pages": [], "layout": "E"}
    prev = None
    for page in pages:
        rows = [(r, undouble(r.text)) for r in page.rows]
        titles = [(r, t) for r, t in rows if r.top < page.height * 0.22 and is_title(t)]
        ambient = any(re.sub(r"\s", "", t).upper() == "AMBIENTE" for _, t in rows)
        big = [i for i in page.images if i.files.get("image") and min(i.width, i.height) >= 300
               and not ((i.bbox[2] - i.bbox[0]) > page.width * 0.95 and (i.bbox[3] - i.bbox[1]) > page.height * 0.95)]
        if not titles and not (ambient and prev and big):
            stats["skipped_pages"].append(page.number)
            continue
        if titles:
            r, t = titles[0]
            name = t.title()
            text = " ".join(t for _, t in rows)
            variants = []
            for m in re.finditer(r"(\d{2,3})\s*[xX]\s*(\d{2,3})\s*[xX]\s*(\d{2,3})", text):
                a, b, c = (int(x) for x in m.groups())
                variants.append({"name": f"{a} × {b} × {c} cm", "width_cm": a, "depth_cm": b, "height_cm": c, "diameter_cm": None, "source_page": page.number, "raw": m.group(0)})
            dm = re.search(r"(\d{2,3})\s*cm\s*di[aâ]metro", norm(text))
            if dm:
                variants.append({"name": f"Ø {dm.group(1)} cm", "width_cm": None, "depth_cm": None, "height_cm": None, "diameter_cm": int(dm.group(1)), "source_page": page.number, "raw": dm.group(0)})
            c = BCandidate(name=name, title_page=page.number, title_row=r, pages=[page.number])
            c.layout = "E"
            c.data = {"codes": [], "variants": variants, "designer": None, "description": None, "collection": None, "materials": [], "finishes": [],
                      "classification": classify(None, name, None)}
            target, hint_all = c, None
            cands.append(c)
            prev = c
        else:
            target, hint_all = prev, "extra"
            if page.number not in prev.pages:
                prev.pages.append(page.number)
        for im in big:
            views = split_collage(im.files["image"], crop_dir, f"p{page.number:03d}-o{im.objid}")
            if not views:
                continue
            # vista principal: objeto inteiro (cobertura média) com maior área; close-ups enchem o quadro
            clean = [v for v in views if v["touch"] < 0.3 and 0.06 <= v["cover"] <= 0.6]
            main = max(clean, key=lambda v: v["area"] * (1 - v["touch"]) * (1 - v["cover"])) if clean else min(views, key=lambda v: v["touch"])
            for v in views:
                target.images.append({"page": page.number, "objid": im.objid, "bbox": None, "files": {"image": v["file"]}, "w": v["box"][2] - v["box"][0],
                                      "h": v["box"][3] - v["box"][1], "hint": hint_all or ("design" if v is main else "extra"), "source_type": "page_crop"})
    return cands, stats


def structure_e(c) -> dict:
    d = c.data
    return {"codes": [], "variants": d["variants"], "designer": None, "materials": [], "finishes": [], "classification": d["classification"],
            "description": None, "collection_original": None, "environment": None, "environment_reason": None}
