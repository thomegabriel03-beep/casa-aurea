"""Leitura de catálogo PDF, página a página.

Genérico por princípio: nada aqui depende de um fornecedor específico.
- Texto: nativo do PDF (pdfplumber). OCR só entra quando a página não tem texto utilizável.
- Imagens: objetos incorporados extraídos com os bytes originais (pdfimages -all), unindo a
  máscara de transparência (SMask) quando existe. Render da página é o nível 2 (recorte).
"""
from __future__ import annotations

import os
import re
import subprocess
from collections import defaultdict
from dataclasses import dataclass, field

import pdfplumber


@dataclass
class Row:
    top: float
    x0: float
    x1: float
    size: float
    text: str
    italic: bool


@dataclass
class PageImage:
    objid: int
    bbox: tuple[float, float, float, float]   # x0, top, x1, bottom (pt)
    width: int
    height: int
    files: dict = field(default_factory=dict)  # {'image': path, 'smask': path}


@dataclass
class PageData:
    number: int
    width: float
    height: float
    rows: list[Row]
    images: list[PageImage]
    has_text: bool


# ---------------------------------------------------------------- texto
def page_rows(page) -> list[Row]:
    """Reconstrói linhas a partir dos caracteres (lida com texto espaçado tipo 'A G N E S')."""
    W = page.width
    chars = [c for c in page.chars if c["x1"] > 0 and c["x0"] < W]
    groups: dict[tuple, list] = defaultdict(list)
    for c in chars:
        groups[(round(c["top"] / 2.5), round(c["size"], 1))].append(c)
    rows: list[Row] = []
    for (_, size), cs in groups.items():
        cs.sort(key=lambda c: c["x0"])
        # colunas distintas na mesma altura viram linhas separadas (ex.: observação à esquerda e 'COD.' à direita)
        segments, seg = [], [cs[0]]
        for prev, c in zip(cs, cs[1:]):
            if c["x0"] - prev["x1"] > max(2.5 * size, 18):
                segments.append(seg)
                seg = []
            seg.append(c)
        segments.append(seg)
        for seg in segments:
            text, prev = "", None
            for c in seg:
                if prev is not None and c["x0"] - prev["x1"] > 0.35 * size:
                    text += " "
                text += c["text"]
                prev = c
            text = re.sub(r"\s+", " ", text).strip()
            if text:
                rows.append(Row(seg[0]["top"], seg[0]["x0"], seg[-1]["x1"], size, text, "Italic" in seg[0]["fontname"]))
    rows.sort(key=lambda r: (r.top, r.x0))
    return rows


def merged_rows(rows: list[Row], tol: float = 2.5) -> list[Row]:
    """Une segmentos na mesma altura (ex.: rótulos 'L P A' e números em fontes diferentes),
    ordenando todos os pedaços pela posição horizontal."""
    small = sorted([r for r in rows if r.size < 20], key=lambda r: r.top)
    clusters: list[list[Row]] = []
    for r in small:
        if clusters and abs(clusters[-1][0].top - r.top) <= tol:
            clusters[-1].append(r)
        else:
            clusters.append([r])
    out = []
    for cl in clusters:
        cl.sort(key=lambda r: r.x0)
        out.append(Row(min(r.top for r in cl), cl[0].x0, max(r.x1 for r in cl), max(r.size for r in cl),
                       " ".join(r.text for r in cl), all(r.italic for r in cl)))
    return out


# ---------------------------------------------------------------- imagens
def extract_embedded_images(pdf_path: str, out_dir: str) -> dict[tuple[int, int], dict]:
    """Extrai todas as imagens incorporadas com os bytes originais.
    Retorna {(página, objid): {'image': caminho, 'smask': caminho}}."""
    os.makedirs(out_dir, exist_ok=True)
    listing = subprocess.run(["pdfimages", "-list", pdf_path], capture_output=True, text=True, check=True).stdout.splitlines()[2:]
    if not any(f.startswith("img-") for f in os.listdir(out_dir)):
        subprocess.run(["pdfimages", "-all", "-p", pdf_path, os.path.join(out_dir, "img")], check=True)
    files = {}
    for f in os.listdir(out_dir):
        m = re.match(r"img-(\d+)-(\d+)\.", f)
        if m:
            files[int(m.group(2))] = os.path.join(out_dir, f)
    result: dict[tuple[int, int], dict] = {}
    for line in listing:
        parts = line.split()
        if len(parts) < 12:
            continue
        page, num, kind, objid = int(parts[0]), int(parts[1]), parts[2], int(parts[10])
        if num in files:
            result.setdefault((page, objid), {})["smask" if kind == "smask" else "image"] = files[num]
    return result


def page_images(page, embedded: dict) -> list[PageImage]:
    out = []
    for im in page.images:
        objid = getattr(im.get("stream"), "objid", None)
        if objid is None:
            continue
        x0, top, x1, bottom = max(im["x0"], 0), max(im["top"], 0), min(im["x1"], page.width), min(im["bottom"], page.height)
        if x1 - x0 < 4 or bottom - top < 4:
            continue
        w, h = im["srcsize"]
        out.append(PageImage(objid, (x0, top, x1, bottom), int(w), int(h), embedded.get((page.page_number, objid), {})))
    return out


def read_pages(pdf_path: str, img_dir: str, start: int = 1, end: int | None = None):
    """Gera PageData página a página (permite checkpoint entre páginas)."""
    embedded = extract_embedded_images(pdf_path, img_dir)
    with pdfplumber.open(pdf_path) as pdf:
        end = end or len(pdf.pages)
        for n in range(start, end + 1):
            p = pdf.pages[n - 1]
            rows = page_rows(p)
            yield PageData(n, p.width, p.height, rows, page_images(p, embedded), has_text=any(len(r.text) > 2 for r in rows))
            p.flush_cache()


def page_count(pdf_path: str) -> int:
    with pdfplumber.open(pdf_path) as pdf:
        return len(pdf.pages)


# ---------------------------------------------------------------- campos
NUM = r"(\d+[.,]?\d*)"


def to_cm(v: str, unit: str = "m") -> float | None:
    try:
        x = float(v.replace(" ", "").replace(",", "."))
    except ValueError:
        return None
    return round(x * 100, 1) if unit == "m" else x


DIM_PATTERNS = [
    # L 2,00 P 1,00 A 0,76 m   (largura, profundidade, altura)
    (re.compile(r"\bL\s*" + NUM + r"\s*P\s*" + NUM + r"\s*A\s*" + NUM + r"\s*(m|cm)\b"), ("width", "depth", "height")),
    # Ø 1,40 A 0,76 m  /  D 1,40 A 0,76 m
    (re.compile(r"(?:Ø|ø|DIÂM\.?|DIAM\.?)\s*" + NUM + r"\s*A\s*" + NUM + r"\s*(m|cm)\b"), ("diameter", "height")),
    # L 0,50 A 0,60 m
    (re.compile(r"\bL\s*" + NUM + r"\s*A\s*" + NUM + r"\s*(m|cm)\b"), ("width", "height")),
]


def parse_dimensions(text: str) -> dict | None:
    t = re.sub(r"(\d)\s+([.,])\s*(\d)", r"\1\2\3", text)  # '2 ,00' → '2,00'
    for rx, names in DIM_PATTERNS:
        m = rx.search(t)
        if m:
            unit = m.groups()[-1]
            vals = [to_cm(g, unit) for g in m.groups()[:-1]]
            if all(v is not None and 0 < v < 2000 for v in vals):
                d = dict(zip(names, vals))
                d["raw"] = m.group(0)
                return d
    return None


CODE_LABEL = re.compile(r"\b(COD\.?|CÓD\.?|CÓDIGO|REF\.?)(?=\s|$)", re.I)
CODE_VALUE = re.compile(r"^[A-Z]{0,4}[-.]?\d{3,8}[A-Z]?$")


def find_codes(rows: list[Row], code_size: float | None = None) -> list[dict]:
    """Códigos do fornecedor.
    1) valor junto de um rótulo 'COD.' (acima, ao lado ou na mesma linha);
    2) sem rótulo legível: número isolado no mesmo corpo de fonte dos códigos confirmados no catálogo
       (padrão aprendido do próprio PDF; marcado como 'padrao' para revisão)."""
    labels = [r for r in rows if CODE_LABEL.search(r.text)]
    found = []
    for r in rows:
        inline = re.search(r"\b(?:COD\.?|CÓD\.?|REF\.?)\s*([A-Z]{0,4}[-.]?\d{3,8}[A-Z]?)\b", r.text, re.I)
        if inline:
            found.append((r, inline.group(1), "rotulo"))
            continue
        val = r.text.replace(" ", "")
        if not CODE_VALUE.match(val):
            continue
        cx = (r.x0 + r.x1) / 2
        near = any((abs(l.top - r.top) <= 30 and min(abs(l.x1 - r.x0), abs(r.x1 - l.x0), abs(((l.x0 + l.x1) / 2) - cx)) <= 140)
                   or (0 < r.top - l.top < 260 and abs(((l.x0 + l.x1) / 2) - cx) < 60) for l in labels)
        if near:
            found.append((r, val, "rotulo"))
        elif code_size and abs(r.size - code_size) <= 0.25:
            found.append((r, val, "padrao"))
    codes, seen = [], set()
    for r, val, via in sorted(found, key=lambda x: x[0].top):
        if val in seen:
            continue
        seen.add(val)
        below = [x for x in rows if 0 < x.top - r.top < 26 and abs(((x.x0 + x.x1) / 2) - ((r.x0 + r.x1) / 2)) < 80
                 and not CODE_VALUE.match(x.text.replace(" ", "")) and not CODE_LABEL.search(x.text)]
        below.sort(key=lambda x: x.top)
        codes.append({"code": val, "label": below[0].text.title() if below else None, "top": r.top, "size": r.size, "via": via})
    return codes
