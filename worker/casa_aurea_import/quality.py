"""Qualidade e identidade das imagens: dimensões, nitidez, nota e hash perceptual (pHash)."""
from __future__ import annotations

import io
import os

import cv2
import numpy as np
from PIL import Image

# Nota por USO (recalibrada após o piloto):
#  CATALOG_READY     ≥ 800 px, nítida, sem texto/marca → grid, busca, miniatura e página da peça
#  DETAIL_ACCEPTABLE 500–799 px → miniatura, galeria e detalhe (não como foto principal grande)
#  EDITORIAL_REVIEW  qualquer tamanho com problema a conferir (texto na imagem, marca d'água, pouca nitidez, recorte estranho)
#  REJECTED          < 500 px ou praticamente vazia
# hero_ready (≥ 2000 px e CATALOG_READY) é independente: destaque editorial exige material original do fornecedor.
GRADES = ("CATALOG_READY", "DETAIL_ACCEPTABLE", "EDITORIAL_REVIEW", "REJECTED")
USES = {"CATALOG_READY": ["miniatura", "grid", "busca", "página da peça"], "DETAIL_ACCEPTABLE": ["miniatura", "galeria", "detalhe"],
        "EDITORIAL_REVIEW": [], "REJECTED": []}


def compose(files: dict) -> Image.Image | None:
    """Imagem original + máscara de transparência (quando existir), sem recompressão dos pixels."""
    path = files.get("image")
    if not path or not os.path.exists(path):
        return None
    img = Image.open(path)
    img.load()
    if img.mode in ("P", "L", "CMYK", "I;16"):
        img = img.convert("RGB")
    mask_path = files.get("smask")
    if mask_path and os.path.exists(mask_path):
        mask = Image.open(mask_path).convert("L")
        if mask.size != img.size:
            mask = mask.resize(img.size, Image.LANCZOS)
        img = img.convert("RGB")
        img.putalpha(mask)
    return img


def sharpness(img: Image.Image) -> float:
    g = np.asarray(img.convert("L"))
    h, w = g.shape
    if max(h, w) > 900:
        s = 900 / max(h, w)
        g = cv2.resize(g, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    return float(cv2.Laplacian(g, cv2.CV_64F).var())


def edge_strength(img: Image.Image) -> float:
    """Força das bordas mais nítidas (percentil 99,5 do gradiente). Evita acusar 'pouca nitidez'
    em peças lisas sobre fundo branco, que têm pouca textura mas contornos nítidos."""
    rgba = img.convert("RGBA")
    bg = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    g = np.asarray(Image.alpha_composite(bg, rgba).convert("L"), dtype=np.float32)
    h, w = g.shape
    if max(h, w) > 900:
        s = 900 / max(h, w)
        g = cv2.resize(g, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    mag = np.hypot(cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1))
    return float(np.percentile(mag, 99.5))


def phash(img: Image.Image) -> str:
    """pHash de 64 bits (DCT 32×32 → 8×8). Sinal de similaridade, nunca decisão de mescla."""
    rgb = img.convert("RGBA")
    bg = Image.new("RGBA", rgb.size, (255, 255, 255, 255))
    g = Image.alpha_composite(bg, rgb).convert("L").resize((32, 32), Image.LANCZOS)
    d = cv2.dct(np.asarray(g, dtype=np.float32))[:8, :8]
    flat = d.flatten()
    bits = flat > np.median(flat[1:])
    return "".join("%x" % int("".join("1" if b else "0" for b in bits[i:i + 4]), 2) for i in range(0, 64, 4))


def hamming(a: str, b: str) -> int:
    return bin(int(a, 16) ^ int(b, 16)).count("1")


def coverage(img: Image.Image) -> float:
    """Fração da imagem ocupada pelo objeto (alfa ou não-branco). Ajuda a detectar recorte ruim."""
    if img.mode == "RGBA":
        a = np.asarray(img.split()[-1]) > 16
    else:
        a = np.asarray(img.convert("L")) < 245
    return float(a.mean())


def background(img: Image.Image) -> str:
    """transparente | fundo sólido | foto com ambiente."""
    if img.mode == "RGBA":
        a = np.asarray(img.split()[-1])
        if (a < 16).mean() > 0.05:
            return "transparente"
    g = np.asarray(img.convert("L"), dtype=np.float32)
    h, w = g.shape
    bw, bh = max(2, w // 25), max(2, h // 25)
    border = np.concatenate([g[:bh].ravel(), g[-bh:].ravel(), g[:, :bw].ravel(), g[:, -bw:].ravel()])
    if border.std() < 7 or (border.mean() > 228 and border.std() < 28):   # liso, ou branco com sombra suave
        return "fundo sólido"
    return "foto com ambiente"


def text_in_image(img: Image.Image) -> list[str]:
    """Palavras legíveis gravadas nos pixels (OCR). Texto do PDF por cima da foto não conta: ele não está na imagem."""
    try:
        import pytesseract
    except ImportError:
        return []
    g = img.convert("RGBA")
    bg = Image.new("RGBA", g.size, (255, 255, 255, 255))
    g = Image.alpha_composite(bg, g).convert("L")
    if max(g.size) < 1400:
        s = 1400 / max(g.size)
        g = g.resize((int(g.width * s), int(g.height * s)), Image.LANCZOS)
    try:
        d = pytesseract.image_to_data(g, config="--psm 11", output_type=pytesseract.Output.DICT)
    except Exception:
        return []
    words = [w for w, c in zip(d["text"], d["conf"]) if len(w) >= 3 and sum(ch.isalpha() for ch in w) >= 3 and float(c) >= 80]
    return words


WATERMARK = ("©", "www", ".com", "copyright", "amostra", "sample", "watermark")


def assess(img: Image.Image, files: dict, bbox_pt: tuple, source_type: str, ocr: bool = True) -> dict:
    w, h = img.size
    long_side = max(w, h)
    sharp = sharpness(img)
    ppi = round(w / max((bbox_pt[2] - bbox_pt[0]) / 72, 0.01)) if bbox_pt else None
    size = os.path.getsize(files["image"]) + (os.path.getsize(files["smask"]) if files.get("smask") else 0)
    ratio = w / h
    cov = coverage(img)
    words = text_in_image(img) if ocr else []
    watermark = any(any(k in wd.lower() for k in WATERMARK) for wd in words)
    reasons = []
    if long_side < 500 or cov < 0.02:
        grade = "REJECTED"
        reasons.append("imagem quase vazia" if cov < 0.02 else f"resolução insuficiente ({w}×{h})")
    else:
        if words:
            reasons.append("texto na imagem: " + " ".join(words[:5]))
        if watermark:
            reasons.append("possível marca d'água")
        if sharp < 40 and edge_strength(img) < 160:
            reasons.append("pouca nitidez")
        if ratio > 4 or ratio < 0.25:
            reasons.append("proporção extrema")
        grade = "EDITORIAL_REVIEW" if reasons else ("CATALOG_READY" if long_side >= 800 else "DETAIL_ACCEPTABLE")
    return {"width": w, "height": h, "long_side": long_side, "aspect_ratio": round(ratio, 3), "file_size": size, "effective_ppi": ppi,
            "sharpness": round(sharp, 1), "coverage": round(cov, 3), "source_type": source_type, "quality": grade,
            "quality_reasons": reasons, "uses": USES[grade], "hero_ready": grade == "CATALOG_READY" and long_side >= 2000,
            "background": background(img), "has_text": bool(words), "watermark": watermark, "has_alpha": img.mode == "RGBA"}


def save_web(img: Image.Image, path: str) -> str:
    """Grava a mídia: PNG sem perdas quando há transparência; JPEG original copiado quando não houver alfa."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if img.mode == "RGBA":
        path = os.path.splitext(path)[0] + ".png"
        img.save(path, optimize=True)
    else:
        path = os.path.splitext(path)[0] + ".jpg"
        img.convert("RGB").save(path, quality=95, subsampling=0)
    return path
