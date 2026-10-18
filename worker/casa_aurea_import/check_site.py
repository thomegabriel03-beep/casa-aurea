"""Conferência automática do site no ar (roda numa ação do GitHub).

    SITE=https://casa-aurea-one.vercel.app python -m casa_aurea_import.check_site

Confere: peças do banco na página inicial, privacidade (nada de fornecedor nem página de catálogo
no HTML), a IA da Áurea (chave configurada?), o registro de conversas/leads (grava e apaga uma
conversa de teste) e as páginas legais sem avisos internos.
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
import uuid

from . import sink
from .classify import norm

SITE = os.environ.get("SITE", "https://casa-aurea-one.vercel.app").rstrip("/")


def http(method: str, path: str, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(SITE + path, data=data, method=method,
                                 headers={"Content-Type": "application/json", "User-Agent": "casa-aurea-check"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read().decode("utf-8", "ignore")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "ignore")


def main():
    out = [f"## Conferência do site ({SITE})"]
    ok_all = True

    def line(ok: bool, text: str):
        nonlocal ok_all
        ok_all &= ok
        out.append(f"- {'✅' if ok else '❌'} {text}")

    st, html = http("GET", "/")
    line(st == 200, f"página inicial abre (HTTP {st})")
    m = re.search(r'id="dbFixture">(.*?)</script>', html, re.S)
    items = json.loads(m.group(1)) if m else []
    acv = sum(1 for x in items if x.get("acv"))
    line(len(items) > 0, f"{len(items)} peças do banco no site ({len(items) - acv} na vitrine, {acv} no acervo)")
    lf = re.search(r'id="launchFixture"[^>]*>(.*?)</script>', html, re.S)
    line(bool(lf) and lf.group(1).strip() == "[]", "seleção de lançamento lida do banco (painel controla tudo)")

    sup = [norm(s["name"]) for s in sink.rest("GET", "suppliers", {"select": "name"}) or [] if len(norm(s["name"])) >= 5]
    low = norm(html)
    leaked = [s for s in sup if s in low]
    line(not leaked, "nenhum nome de fornecedor no site" + (f" (achei: {', '.join(leaked[:3])})" if leaked else ""))
    line("/original/" not in html, "nenhuma foto com nome de página de catálogo")

    st, body = http("POST", "/api/aurea", {"messages": [{"role": "user", "content": "Oi! Qual o horário do showroom?"}], "lang": "pt"})
    if st == 200:
        line(True, "Áurea respondendo com a IA (chave configurada)")
    elif st == 503 and "indisponivel" in body:
        line(False, "Áurea sem a chave da IA (ANTHROPIC_API_KEY não configurada na Vercel): usando o modo simples")
    else:
        line(False, f"Áurea com erro na IA (HTTP {st}): conferir a chave na Vercel")

    cid = str(uuid.uuid4())
    turns = [{"role": "user", "content": "Teste automático da Vetra, pode ignorar. Meu nome é Teste Vetra, (48) 90000-0000"},
             {"role": "assistant", "content": "Recebido."}]
    st, _ = http("POST", "/api/aurea/registro", {"id": cid, "lang": "pt", "turns": turns, "wa": True})
    rows = sink.rest("GET", "aurea_conversations", {"id": f"eq.{cid}", "select": "id,name,phone,is_lead"}) or []
    saved = bool(rows) and rows[0].get("is_lead") and rows[0].get("phone") == "(48) 90000-0000"
    line(bool(saved), "leads da Áurea sendo salvos no painel" + ("" if saved else f" (HTTP {st}; nada gravado)"))
    if rows:
        sink.rest("DELETE", "aurea_conversations", {"id": f"eq.{cid}"}, prefer="return=minimal")

    for path in ("/privacidade", "/termos"):
        st, page = http("GET", path)
        line(st == 200 and "Pendente" not in page, f"{path} abre sem avisos internos (HTTP {st})")

    text = "\n".join(out)
    print(text)
    if os.environ.get("GITHUB_ACTIONS"):
        print("::notice title=Conferência do site::" + text[:3500].replace("%", "%25").replace("\n", "%0A"))
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as fh:
            fh.write(text + "\n")


if __name__ == "__main__":
    main()
