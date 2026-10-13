#!/usr/bin/env python3
"""Gera o site público a partir da prévia aprovada (reference/preview/casa-aurea-preview.html).

O visual, os textos e o comportamento ficam idênticos à prévia. O que muda:
- o painel de demonstração (e todos os dados internos: fornecedores, catálogos, lote piloto,
  orçamentos) sai do arquivo público; "Painel" passa a abrir /admin (Next.js + Supabase);
- peças marcadas como internas (hide) não entram;
- as imagens embutidas viram arquivos em public/site/img (carregam sob demanda e ficam em cache);
- a Áurea conversa pela rota /api/aurea (Claude API no servidor, chave nunca vai ao navegador).

Uso: python3 scripts/build_public_site.py
Saída: public/site/index.html e public/site/img/*
"""
import base64, hashlib, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'reference', 'preview', 'casa-aurea-preview.html')
OUT = os.path.join(ROOT, 'public', 'site')
IMG_DIR = os.path.join(OUT, 'img')
IMG_URL = '/site/img/'

s = open(SRC, encoding='utf-8').read()


def cut_script(html, marker):
    """Remove o <script ...> que contém `marker` na tag de abertura."""
    i = html.find(marker)
    if i < 0:
        sys.exit('marcador não encontrado: ' + marker)
    a = html.rfind('<script', 0, i)
    b = html.find('</script>', i) + len('</script>')
    return html[:a] + html[b:]


def replace_once(html, old, new, label):
    n = html.count(old)
    if n != 1:
        sys.exit(f'{label}: esperado 1 trecho, achei {n}')
    return html.replace(old, new)


# 1. lote piloto do importador (fornecedor, catálogo, páginas): fora do site público
s = cut_script(s, 'id="pilotFixture"')

# 2. seleção de lançamento: só as peças liberadas (sem as internas)
i = s.find('id="launchFixture"')
a = s.find('>', i) + 1
b = s.find('</script>', a)
items = [it for it in json.loads(s[a:b]) if not it.get('hide')]
s = s[:a] + json.dumps(items, ensure_ascii=False, separators=(',', ':')) + s[b:]

# 3. script principal: tira o painel de demonstração inteiro
mi = s.find('PAINEL /admin — mesma estrutura do painel do Next.js')
start = s.rfind('/* =====', 0, mi)
end_marker = '  function closePanel(to){'
end = s.find(end_marker, start)
if start < 0 or end < 0:
    sys.exit('limites do painel não encontrados')
stub = ("  /* Painel: aplicação Next.js em /admin (login Supabase). Nada do painel fica no site público. */\n"
        "  function renderAdmin(){location.assign('/admin')}\n"
        "  function hideAdmin(){}\n")
s = s[:start] + stub + s[end:]

# dados internos que o script público não usa
s = re.sub(r"suppliers:\[[^\]]*\]\.map\(function\(n,i\)\{return \{id:'s'\+[^}]*\}\}\),", 'suppliers:[],', s, count=1)
if "suppliers:[]," not in s:
    sys.exit('lista de fornecedores não removida')
s = s.replace('href="#/admin"', 'href="/admin"')

# marcação do painel de demonstração
s = re.sub(r'<div id="admRoot"[^>]*>\s*</div>', '', s, count=1)

# 4. Áurea: IA pelo servidor (/api/aurea). O servidor guarda o conhecimento do site;
#    o navegador envia só a conversa.
old = "if(window.claude&&claude.use)claude.use('sample').then(function(s){sample=s}).catch(function(){});"
new = ("sample=function(input,o){o=o||{};var msgs=input.slice(2).map(function(m){return {role:m.role,content:String(m.content).slice(0,2000)}});"
       "return fetch('/api/aurea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:msgs,lang:(typeof LANG!=='undefined'?LANG:'pt')}),signal:o.signal})"
       ".then(function(r){if(!r.ok)throw {code:r.status===503?'capability_disabled':'http_'+r.status};return r.json()})"
       ".then(function(j){if(!j||!j.text)throw {code:'empty'};return {text:j.text}})"
       ".catch(function(e){if(e&&e.name==='AbortError')throw {code:'cancelled',text:''};throw e})};")
s = replace_once(s, old, new, 'Áurea')

# 4b. mapa do rodapé: fica sempre a arte aprovada (com "Abrir no Google Maps" e "Traçar rota");
#     o iframe do Google não é injetado por cima dela
s = replace_once(s, "if(!h||/claude|anthropic|localhost|usercontent/.test(h))return;", "return;", 'mapa')

# 5. filme: caminho absoluto (o documento é servido em /)
s = replace_once(s, "img.src='film/'+kind", "img.src='/film/'+kind", 'filme')

# 6. botão interno de pendências da prévia: nunca aparece no site
s = s.replace('</style>', '#ptoggle{display:none!important}</style>', 1)

# 7. imagens embutidas -> arquivos
os.makedirs(IMG_DIR, exist_ok=True)
written = {}


def to_file(m):
    ext = {'jpeg': 'jpg'}.get(m.group(1), m.group(1))
    raw = base64.b64decode(m.group(2))
    h = hashlib.sha1(raw).hexdigest()[:16]
    name = f'{h}.{ext}'
    if name not in written:
        with open(os.path.join(IMG_DIR, name), 'wb') as f:
            f.write(raw)
        written[name] = len(raw)
    return IMG_URL + name


s = re.sub(r'data:image/(webp|jpeg|png|gif);base64,([A-Za-z0-9+/=]+)', to_file, s)

# conferências de privacidade
for bad in ['Brazil Contemporâneo', 'Estofados Pirâmide', 'Tellaio', 'Heitor Móveis', 'pilotFixture', 'originalCode":"']:
    if bad in s:
        sys.exit('dado interno ainda presente: ' + bad)

os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8') as f:
    f.write(s)
print(f'index.html: {len(s)//1024} KB · {len(written)} imagens · {sum(written.values())//1024} KB · {len(items)} peças')
