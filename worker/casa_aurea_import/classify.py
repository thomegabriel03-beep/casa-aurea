"""Classificação automática com nível de confiança. Nunca tratada como verdade absoluta."""
from __future__ import annotations

import re
import unicodedata


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower()).strip()


# (expressão no texto do catálogo, tipo, subtipo, confiança)
RULES = [
    (r"mesa de jantar|dining table", "MES", "Jantar", 0.97),
    (r"mesa de centro|coffee table|center table", "MES", "Centro", 0.95),
    (r"mesa lateral|side table|end table", "MES", "Lateral", 0.95),
    (r"mesa de apoio|apoio", "MES", "Apoio", 0.85),
    (r"sofa table", "MES", "Sofa table", 0.95),
    (r"bistro", "MES", "Bistrô", 0.95),
    (r"escrivaninha|desk|office", "MES", "Office", 0.8),
    (r"mesa de cabeceira|criado|nightstand|bedside", "MCB", None, 0.95),
    (r"aparador|console", "APA", None, 0.95),
    (r"buffet|sideboard", "BUF", None, 0.95),
    (r"balcao|counter|bar cabinet", "BUF", None, 0.7),
    (r"carrinho|bar cart|trolley", "CAR", None, 0.95),
    (r"comoda|dresser|chest of drawers", "COM", None, 0.95),
    (r"gaveteiro|\bdrawer\b", "GAV", None, 0.95),          # tipos acrescentados após o piloto (catálogo real)
    (r"estante|bookcase", "EST", None, 0.95),
    (r"cristaleira|cupboard|china cabinet", "CRI", None, 0.95),
    (r"cabideiro|hatstand|coat rack", "CAB", None, 0.95),
    (r"rack|tv stand|home theater", "RAC", None, 0.95),
    (r"poltrona|armchair|lounge chair", "POL", None, 0.95),
    (r"banqueta|stool", "BAQ", None, 0.95),
    (r"cadeira|chair", "CAD", None, 0.9),
    (r"banco|bench", "BCO", None, 0.9),
    (r"puff|pouf|pufe", "PUF", None, 0.95),
    (r"sofa\b|sofa |sofas", "SOF", None, 0.9),
    (r"cama\b|bed\b", "CAM", None, 0.9),
    (r"tapete|rug", "TAP", None, 0.95),
    (r"espreguicadeira|sun lounger|chaise longue", "ESP", None, 0.95),
    (r"chaise", "ESP", None, 0.75),       # em catálogo de área externa costuma ser espreguiçadeira: confirmar
    (r"ombrelone|umbrella|parasol", "OMB", None, 0.95),
    (r"balanco|swing", "BAL", None, 0.9),
    (r"complemento", "ACC", None, 0.6),
    (r"conjunto de mesas", "MES", None, 0.9),
    (r"mesas?\b", "MES", None, 0.85),    # 'Mesa Abdul': tipo certo, subtipo vem da seção quando houver
]

THRESHOLD = 0.8


SUFFIX = {"centro": "mesa de centro", "lateral": "mesa lateral", "apoio": "mesa de apoio", "canto": "mesa lateral",
          "jantar": "mesa de jantar", "bistro": "mesa bistro"}


def classify(header: str | None, name: str | None, section: str | None) -> dict:
    """Prioridade: cabeçalho da página da peça > seção do catálogo > nome."""
    # 'Eva - Centro', 'Apolo - Aparador': o sufixo depois do traço diz o tipo, como um cabeçalho
    if name and not header and re.search(r"\s[-–]\s*\S", name):
        suf = norm(re.split(r"\s[-–]\s*", name)[-1])
        header = SUFFIX.get(suf, suf) if suf else None
    for source, text, weight in (("cabeçalho", header, 1.0), ("nome (início)", name, 1.0), ("seção", section, 0.9), ("nome", name, 0.75)):
        t = norm(text or "")
        if not t:
            continue
        for rx, code, sub, conf in RULES:
            # nome que COMEÇA pelo tipo ('Cadeira Búzios', 'Mesa Ripada Lateral') vale como cabeçalho
            hit = re.match(r"^(?:" + rx + r")", t) if source == "nome (início)" else re.search(rx, t)
            if hit:
                c = round(conf * weight, 2)
                if code == "MES" and sub is None and section:
                    for rx2, code2, sub2, _ in RULES:
                        if code2 == "MES" and sub2 and re.search(rx2, norm(section)):
                            sub = sub2
                            break
                return {"type": code, "subtype": sub, "confidence": c, "source": source, "matched": text}
    return {"type": None, "subtype": None, "confidence": 0.0, "source": None, "matched": None}


# vocabulário de materiais e acabamentos (pt/en) → nome na taxonomia Casa Áurea
MATERIALS = {
    "nogueira": "Nogueira", "walnut": "Nogueira", "carvalho": "Carvalho", "oak": "Carvalho", "freijo": "Freijó",
    "cinamomo": "Cinamomo", "eucalipto": "Eucalipto", "marmore": "Mármore", "marble": "Mármore", "travertino": "Travertino",
    "pedra": "Pedra natural", "stone": "Pedra natural", "granito": "Granito", "vidro": "Vidro", "glass": "Vidro",
    "couro": "Couro", "leather": "Couro", "linho": "Linho", "boucle": "Bouclé", "tecido": "Tecido", "fabric": "Tecido",
    "latao": "Latão", "brass": "Latão", "aco": "Metal", "steel": "Metal", "metal": "Metal", "aluminio": "Alumínio",
    "palha": "Palhinha", "rattan": "Rattan", "fibra sintetica": "Fibra sintética", "corda nautica": "Corda náutica", "corda": "Corda náutica", "laminado": "Laminado de madeira",
    "madeira": "Madeira maciça", "concreto": "Concreto", "ceramica": "Cerâmica", "marchetaria": "Marchetaria",
}
FINISHES = {"natural": "Natural", "laca": "Laca", "lacquer": "Laca", "fosco": "Fosco", "matte": "Fosco", "brilho": "Brilho",
            "preto": "Preto", "black": "Preto", "champagne": "Champagne", "grafite": "Grafite", "bronze": "Bronze",
            "cromado": "Cromo", "ebanizado": "Ebanizado", "imbuia": "Imbuia", "fendi": "Fendi", "dourado": "Dourado", "branco": "Branco"}


def vocab(texts: list[str]) -> tuple[list[str], list[str]]:
    mats, fins = [], []
    for t in texts:
        n = norm(t)
        for k, v in MATERIALS.items():
            if re.search(r"\b" + k + r"\b", n) and v not in mats:
                mats.append(v)
        for k, v in FINISHES.items():
            if re.search(r"\b" + k + r"\b", n) and v not in fins:
                fins.append(v)
    return mats, fins
