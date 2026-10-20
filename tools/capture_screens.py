"""Captura telas do site no ar para posts da Vetra (roda na ação 'Capturar telas do site').
Salva PNGs em telas/ (celular 390x844 @3x e computador 1440x900 @2x). A conversa de teste com a
Áurea é apagada do banco no fim, para não aparecer como lead."""
import json, os, re, sys, time, urllib.request
from playwright.sync_api import sync_playwright

SITE = os.environ.get("SITE", "https://www.acasaurea.com.br").rstrip("/")
OUT = "telas"; os.makedirs(OUT, exist_ok=True)
ASK = os.environ.get("ASK", "Quero um sofá claro para uma sala pequena, com pet em casa")

def shot(p, name): p.screenshot(path=f"{OUT}/{name}.png"); print("ok", name)

with sync_playwright() as pw:
    b = pw.chromium.launch()
    # celular
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True, locale="pt-BR")
    p = ctx.new_page()
    p.goto(SITE + "/", wait_until="networkidle"); p.wait_for_timeout(2500); shot(p, "m01-abertura")
    for i, y in enumerate([900, 2200, 3600]):
        p.mouse.wheel(0, y); p.wait_for_timeout(1800); shot(p, f"m0{2+i}-filme-{i+1}")
    html = p.content()
    slugs = re.findall(r'href="#/produto/([a-z0-9-]+)"', html)
    for name, h in [("m05-moveis", "#/moveis"), ("m06-acervo", "#/acervo"), ("m07-sobre", "#/sobre"), ("m08-curadoria", "#/curadoria"),
                    ("m09-materiais", "#/materiais"), ("m10-natal", "#/colecoes/natal"), ("m11-busca", "#/busca")]:
        p.goto(SITE + "/" + h, wait_until="networkidle"); p.wait_for_timeout(2200); shot(p, name)
    p.goto(SITE + "/#/moveis", wait_until="networkidle"); p.wait_for_timeout(1500)
    slugs = re.findall(r'href="#/produto/([a-z0-9-]+)"', p.content())
    for k, s in enumerate(slugs[:3]):
        p.goto(SITE + "/#/produto/" + s, wait_until="networkidle"); p.wait_for_timeout(2200); shot(p, f"m12-produto-{k+1}")
    p.goto(SITE + "/#showroom", wait_until="networkidle"); p.wait_for_timeout(2500); shot(p, "m13-showroom")
    # Áurea
    p.goto(SITE + "/", wait_until="networkidle"); p.wait_for_timeout(1500)
    p.evaluate("document.querySelector('button[data-conc][aria-label]').click()"); p.wait_for_timeout(1200); shot(p, "m14-aurea-abertura")
    p.fill("#conc .conc-in", ASK); p.press("#conc .conc-in", "Enter")
    for _ in range(40):
        p.wait_for_timeout(1000)
        if not p.evaluate("document.getElementById('conc').classList.contains('is-busy')"): break
    p.wait_for_timeout(800); shot(p, "m15-aurea-resposta")
    cid = p.evaluate("sessionStorage.getItem('ca-conc-id')")
    ctx.close()
    # computador
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2, locale="pt-BR")
    p = ctx.new_page()
    p.goto(SITE + "/", wait_until="networkidle"); p.wait_for_timeout(2500); shot(p, "d01-abertura")
    p.mouse.wheel(0, 2400); p.wait_for_timeout(2000); shot(p, "d02-filme")
    for name, h in [("d03-moveis", "#/moveis"), ("d04-acervo", "#/acervo"), ("d05-sobre", "#/sobre")]:
        p.goto(SITE + "/" + h, wait_until="networkidle"); p.wait_for_timeout(2200); shot(p, name)
    ctx.close(); b.close()

# apaga a conversa de teste
url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
if cid and url and key:
    time.sleep(3)
    req = urllib.request.Request(f"{url}/rest/v1/aurea_conversations?id=eq.{cid}", method="DELETE", headers={"apikey": key, "Authorization": f"Bearer {key}"})
    urllib.request.urlopen(req); print("conversa de teste apagada")
