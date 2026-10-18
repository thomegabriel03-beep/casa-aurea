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

# 2b. peças publicadas no painel (banco): o servidor (src/app/site-html) preenche este espaço
#     com as peças em Vitrine/Acervo, no mesmo formato da seleção de lançamento.
#     Se uma peça do banco tem o mesmo nome de uma peça da seleção, vale a do banco.
b = s.find('</script>', a) + len('</script>')
s = s[:b] + '<script type="application/json" id="dbFixture">[]</script>' + s[b:]
old = ("    var el=document.getElementById('launchFixture'); if(!el)return;\n"
       "    JSON.parse(el.textContent).forEach(function(it,i){\n"
       "      var ty=T(it.t); if(!ty)return;\n"
       "      var code=nextCode(it.t), keys=")
new = ("    var el=document.getElementById('launchFixture'); if(!el)return;\n"
       "    var DB=[];try{DB=JSON.parse((document.getElementById('dbFixture')||{}).textContent||'[]')}catch(e){}\n"
       "    DB=DB.filter(function(d){return !PRODUCTS.some(function(p){return norm(p.name)===norm(d.n)})});\n"
       "    var dbName={},dbCode={};DB.forEach(function(d){dbName[norm(d.n)]=1;dbCode[d.c]=1;\n"
       "      if(!T(d.t)&&d.tn)TYPES.push({code:d.t,name:d.tn,plural:d.tp||d.tn,slug:slugify(d.tp||d.tn),section:d.sec||'moveis',order:TYPES.length+1})});\n"
       "    JSON.parse(el.textContent).concat(DB).forEach(function(it,i){\n"
       "      var ty=T(it.t); if(!ty)return;\n"
       "      if(!it.c&&dbName[norm(it.n)]){nextCode(it.t);return}\n"
       "      var code=it.c||nextCode(it.t); while(!it.c&&dbCode[code])code=nextCode(it.t);\n"
       "      var keys=")
s = replace_once(s, old, new, 'peças do banco')
s = replace_once(s, "PRODUCTS.push({id:'lx-'+it.k,slug:slugify(it.n+' '+code),",
                 "PRODUCTS.push({id:'lx-'+it.k,slug:it.sl||slugify(it.n+' '+code),", 'slug do banco')

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

# 4a. Áurea: a conversa da aba vai para o painel (Leads da Áurea) a cada resposta e quando a
#     pessoa clica para falar no WhatsApp. Envio em segundo plano: não muda nada na tela.
s = replace_once(s,
    "    function save(){try{sessionStorage.setItem('ca-conc',JSON.stringify(turns.slice(-16)))}catch(e){}}\n",
    "    function save(){try{sessionStorage.setItem('ca-conc',JSON.stringify(turns.slice(-16)))}catch(e){}}\n"
    "    function newId(){try{if(crypto.randomUUID)return crypto.randomUUID()}catch(e){}var h='';for(var i=0;i<32;i++)h+=Math.floor(Math.random()*16).toString(16);"
    "return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-'+'89ab'[Math.floor(Math.random()*4)]+h.slice(17,20)+'-'+h.slice(20,32)}\n"
    "    var CID=null,LOGT=[];try{CID=sessionStorage.getItem('ca-conc-id');LOGT=JSON.parse(sessionStorage.getItem('ca-conc-log')||'[]')||[]}catch(e){}\n"
    "    if(!CID){CID=newId();try{sessionStorage.setItem('ca-conc-id',CID)}catch(e){}}\n"
    "    function rec(wa){LOGT=LOGT.slice(-60);try{sessionStorage.setItem('ca-conc-log',JSON.stringify(LOGT))}catch(e){}\n"
    "      if(!LOGT.length)return;var body=JSON.stringify({id:CID,lang:lg(),turns:LOGT,wa:!!wa});\n"
    "      try{if(navigator.sendBeacon&&navigator.sendBeacon('/api/aurea/registro',new Blob([body],{type:'application/json'})))return}catch(e){}\n"
    "      try{fetch('/api/aurea/registro',{method:'POST',headers:{'Content-Type':'application/json'},body:body,keepalive:true}).catch(function(){})}catch(e){}}\n"
    "    function recNew(){CID=newId();LOGT=[];try{sessionStorage.setItem('ca-conc-id',CID);sessionStorage.removeItem('ca-conc-log')}catch(e){}}\n",
    'Áurea: registro')
s = replace_once(s,
    "turns.push({role:'user',content:q}); bubble('user','<p>'+esc(q)+'</p>'); save();",
    "turns.push({role:'user',content:q}); LOGT.push({role:'user',content:q}); bubble('user','<p>'+esc(q)+'</p>'); save();",
    'Áurea: registro da pergunta')
s = replace_once(s,
    "var finish=function(t){b.innerHTML=botHTML(t);turns.push({role:'assistant',content:t});save();",
    "var finish=function(t){b.innerHTML=botHTML(t);turns.push({role:'assistant',content:t});LOGT.push({role:'assistant',content:t});rec();save();",
    'Áurea: registro da resposta')
s = replace_once(s,
    "function wa(){var last=turns.filter(",
    "function wa(){rec(true);var last=turns.filter(",
    'Áurea: registro do WhatsApp')
s = replace_once(s,
    "if(ctl)ctl.abort();turns=[];save();renderAll()",
    "if(ctl)ctl.abort();turns=[];save();recNew();renderAll()",
    'Áurea: nova conversa')

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

# a mesma seleção vai para o servidor: depois de ligada ao banco (worker/link_launch.py),
# o site lê essas peças do banco e mantém foto, textos e medidas aprovados (src/lib/catalog/site-feed.ts)
i = s.find('id="launchFixture"'); a = s.find('>', i) + 1; b = s.find('</script>', a)
with open(os.path.join(ROOT, 'src', 'data', 'launch-pieces.json'), 'w', encoding='utf-8') as fh:
    fh.write(s[a:b])

os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8') as f:
    f.write(s)
print(f'index.html: {len(s)//1024} KB · {len(written)} imagens · {sum(written.values())//1024} KB · {len(items)} peças')
