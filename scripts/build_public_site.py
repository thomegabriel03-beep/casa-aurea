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
new = ("sample=function(input,o){o=o||{};var msgs=input.slice(2).map(function(m){var x={role:m.role,content:String(m.content).slice(0,2000)};if(m.pid&&PHOTOS[m.pid])x.image=PHOTOS[m.pid];return x});"
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

# 4c. Áurea: foto do ambiente (aprovado pelo Gabriel em 18/10/2026). Botão de câmera no campo da conversa;
#     a foto é reduzida no navegador (1280 px), vai para a IA junto com a mensagem e não é guardada.
s = replace_once(s,
    '<form class="conc-form"><textarea class="conc-in"',
    '<div class="conc-att" hidden></div><form class="conc-form">'
    '<button type="button" class="conc-cam" aria-label="Enviar foto do ambiente"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">'
    '<path d="M3.5 8.5h3.2l1.6-2.3h7.4l1.6 2.3h3.2v10.3h-17z"/><circle cx="12" cy="13.4" r="3.4"/></svg></button>'
    '<input type="file" class="conc-file" accept="image/*" hidden><textarea class="conc-in"',
    'Áurea: botão de foto')
s = replace_once(s,
    "    var sugg=root.querySelector('.conc-sugg');\n",
    "    var sugg=root.querySelector('.conc-sugg');\n"
    "    var cam=root.querySelector('.conc-cam'),fileIn=root.querySelector('.conc-file'),att=root.querySelector('.conc-att'),PHOTOS={},PIMG=null;\n"
    "    var CAMT={pt:['Foto do ambiente','Remover foto','O que quer mudar? (opcional)','Recebi sua foto! Para analisar o seu ambiente com calma, a equipe pode olhar com você pelo WhatsApp [[wa]] ou no showroom.','Não consegui abrir essa imagem. Tente outra foto (JPG ou PNG).'],\n"
    "      en:['Room photo','Remove photo','What to change? (optional)','Got your photo! To look at your space properly, the team can go through it with you on WhatsApp [[wa]] or at the showroom.','I could not open that image. Try another photo (JPG or PNG).'],\n"
    "      es:['Foto del ambiente','Quitar foto','¿Qué quieres cambiar? (opcional)','¡Recibí tu foto! Para analizar tu espacio con calma, el equipo puede verlo contigo por WhatsApp [[wa]] o en el showroom.','No pude abrir esa imagen. Prueba con otra foto (JPG o PNG).']};\n"
    "    function CT(i){return (CAMT[lg()]||CAMT.pt)[i]}\n"
    "    function shrink(f,cb){var u=URL.createObjectURL(f),im=new Image();im.onload=function(){var k=Math.min(1,1280/Math.max(im.naturalWidth,im.naturalHeight)),c=document.createElement('canvas');"
    "c.width=Math.max(1,Math.round(im.naturalWidth*k));c.height=Math.max(1,Math.round(im.naturalHeight*k));c.getContext('2d').drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(u);"
    "try{cb(c.toDataURL('image/jpeg',.82))}catch(e){cb(null)}};im.onerror=function(){URL.revokeObjectURL(u);cb(null)};im.src=u}\n"
    "    function showAtt(){if(!PIMG){att.hidden=true;att.innerHTML='';box.placeholder=X().ph;return}att.hidden=false;"
    "att.innerHTML='<img src=\"'+PIMG+'\" alt=\"'+esc(CT(0))+'\"><span>'+esc(CT(0))+'</span><button type=\"button\" class=\"conc-att-x\" aria-label=\"'+esc(CT(1))+'\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\" aria-hidden=\"true\"><path d=\"M6 6l12 12M18 6 6 18\"/></svg></button>';"
    "box.placeholder=CT(2)}\n"
    "    cam.addEventListener('click',function(){if(!busy)fileIn.click()});\n"
    "    fileIn.addEventListener('change',function(){var f=fileIn.files&&fileIn.files[0];fileIn.value='';if(!f)return;"
    "shrink(f,function(d){if(!d||d.length>1500000){bubble('bot','<p>'+esc(CT(4))+'</p>');return}PIMG=d;showAtt();box.focus()})});\n"
    "    att.addEventListener('click',function(e){if(e.target.closest('.conc-att-x')){PIMG=null;showAtt()}});\n"
    "    function userHTML(t){var ph=t.pid&&PHOTOS[t.pid];return (ph?'<img class=\"conc-photo\" src=\"'+ph+'\" alt=\"'+esc(CT(0))+'\">':(t.pid?'<p class=\"conc-photo-x\">'+esc(CT(0))+'</p>':''))+(t.content?'<p>'+esc(t.content)+'</p>':'')}\n",
    'Áurea: lógica da foto')
s = replace_once(s,
    "      q=String(q||'').trim(); if(!q||busy)return; box.value=''; sugg.hidden=true;\n"
    "      turns.push({role:'user',content:q}); LOGT.push({role:'user',content:q}); bubble('user','<p>'+esc(q)+'</p>'); save();",
    "      q=String(q||'').trim(); if((!q&&!PIMG)||busy)return; box.value=''; sugg.hidden=true;\n"
    "      var pid=null;if(PIMG){pid='f'+Date.now();PHOTOS[pid]=PIMG;PIMG=null;showAtt()}\n"
    "      var ut={role:'user',content:q};if(pid)ut.pid=pid;\n"
    "      turns.push(ut); LOGT.push({role:'user',content:(pid?'[enviou uma foto do ambiente] ':'')+q}); bubble('user',userHTML(ut)); save();",
    'Áurea: pergunta com foto')
s = replace_once(s,
    "      if(!sample||aiOff){setTimeout(function(){finish(localAnswer(q))},420);setBusy(true);return}",
    "      if(!sample||aiOff){setTimeout(function(){finish(pid&&!q?CT(3):localAnswer(q))},420);setBusy(true);return}",
    'Áurea: foto sem IA')
s = replace_once(s,
    "          finish(localAnswer(q));\n        });",
    "          finish(pid&&!q?CT(3):localAnswer(q));\n        });",
    'Áurea: foto com erro na IA')
s = replace_once(s,
    "turns.forEach(function(t){bubble(t.role==='user'?'user':'bot',t.role==='user'?'<p>'+esc(t.content)+'</p>':botHTML(t.content))});",
    "turns.forEach(function(t){bubble(t.role==='user'?'user':'bot',t.role==='user'?userHTML(t):botHTML(t.content))});",
    'Áurea: conversa salva com foto')
s = replace_once(s,
    "if(ctl)ctl.abort();turns=[];save();recNew();renderAll()",
    "if(ctl)ctl.abort();turns=[];PHOTOS={};PIMG=null;showAtt();save();recNew();renderAll()",
    'Áurea: nova conversa sem foto')
CAM_CSS = (
    '.conc-cam{width:38px;height:38px;flex:none;border-radius:50%;border:1px solid rgb(239 232 221/.25);color:#efe8dd;display:grid;place-items:center;transition:border-color .2s,color .2s}'
    '.conc-cam:hover,.conc-cam:focus-visible{border-color:#cfae82;color:#cfae82}.conc-cam svg{width:20px;height:20px}'
    '.conc-form:has(.conc-cam){padding-left:.4rem}.conc.is-busy .conc-cam{opacity:.4;pointer-events:none}'
    '.conc-att{display:flex;align-items:center;gap:.6rem;margin:0 var(--s4) var(--s2);padding:.4rem .5rem;border:1px solid rgb(239 232 221/.2);border-radius:14px;color:#efe8dd;font-size:.8rem}'
    '.conc-att[hidden]{display:none}.conc-att img{width:44px;height:44px;object-fit:cover;border-radius:8px}.conc-att span{flex:1}'
    '.conc-att-x{width:30px;height:30px;display:grid;place-items:center;color:#efe8dd;border-radius:50%}.conc-att-x svg{width:16px;height:16px}'
    '.conc-photo{display:block;max-width:200px;width:100%;border-radius:12px;margin-bottom:.4rem}.conc-photo-x{font-size:.8rem;opacity:.7}'
)
s = s.replace('</style>', CAM_CSS + '</style>', 1)

# 4f. Áurea: captação de contato (aprovada pelo Gabriel em 26/10/2026).
#     3 perguntas livres; antes da 4ª mensagem (ou de qualquer foto), a Áurea pede nome e WhatsApp num cartão
#     dentro da conversa. O servidor (/api/aurea) aplica a mesma regra e só libera com o token emitido por
#     /api/aurea/contato. O aparelho guarda só o primeiro nome, o perfil e o token (localStorage).
#     Origem da visita (UTM, referência, página de entrada, dispositivo) capturada no primeiro acesso (sessionStorage).
#     Textos em PT/EN/ES no dicionário da própria conversa (o painel da Áurea é data-noi18n).
s = replace_once(s,
    '<button type="button" class="conc-stop" hidden>Parar</button></form>',
    '<button type="button" class="conc-stop" hidden>Parar</button></form><div class="conc-lock" hidden></div>',
    'Áurea: espaço do campo bloqueado')
LEAD_JS = r"""    /* ---- captação de contato: 3 perguntas livres; depois (ou para foto) a Áurea pede nome e WhatsApp ---- */
    var LEADT={pt:{h:'Para continuar, como posso te chamar?',hf:'Para analisar a sua foto, me deixa seu nome e WhatsApp?',p:'Assim a nossa equipe pode te enviar as opções e valores pelo WhatsApp.',pf:'Assim eu olho o seu ambiente com calma e a nossa equipe pode te enviar as opções e valores pelo WhatsApp.',eb:'Concierge Casa Áurea',name:'Nome',wa:'WhatsApp',email:'E-mail',city:'Cidade',opt:'opcional',who:'Você é:',pr:['Cliente final','Arquiteto(a) ou designer','Empresa ou construtora'],go:'Continuar a conversa',goF:'Continuar',no:'Agora não',lgpd:'Seus dados ficam só com a Casa Áurea e são usados para o seu atendimento.',priv:'Privacidade',eName:'Me conta como posso te chamar.',eWa:'Confere o WhatsApp? Ex.: (48) 99999-9999 ou, de fora do Brasil, +351 912 345 678.',eEmail:'Esse e-mail parece incompleto.',eSave:'Não consegui salvar agora. Tente de novo em instantes ou fale com a equipe no WhatsApp.',sending:'Enviando…',thanks:'Obrigada, {n}! Vamos continuar.',thanksF:'Obrigada, {n}! Agora é só enviar a foto do seu espaço.',declined:'Tudo bem! Quando quiser, a nossa equipe continua com você pelo WhatsApp, já com o resumo da nossa conversa. [[wa]]',declinedF:'Tudo bem! Pode seguir perguntando por aqui, e a foto você também pode mandar direto para a nossa equipe no WhatsApp. [[wa]]',lock:'Para seguir conversando, deixe seu contato ou fale com a nossa equipe no WhatsApp.',reopen:'Deixar meu contato',teto:'A nossa conversa já está bem completa! Para seguir com todo o cuidado, a equipe continua com você pelo WhatsApp. [[wa]]',hi:'Olá, {n}!'},
      en:{h:'To carry on, what should I call you?',hf:'To look at your photo, may I have your name and WhatsApp?',p:'That way our team can send you options and prices on WhatsApp.',pf:'That way I can look at your space properly and our team can send you options and prices on WhatsApp.',eb:'Casa Áurea Concierge',name:'Name',wa:'WhatsApp',email:'Email',city:'City',opt:'optional',who:'You are:',pr:['Homeowner','Architect or designer','Company or developer'],go:'Continue the conversation',goF:'Continue',no:'Not now',lgpd:'Your details stay with Casa Áurea only and are used to assist you.',priv:'Privacy',eName:'Please tell me what to call you.',eWa:'Could you check the WhatsApp number? Include the country code, e.g. +44 7700 900123.',eEmail:'That email looks incomplete.',eSave:'I could not save it right now. Please try again in a moment or talk to the team on WhatsApp.',sending:'Sending…',thanks:'Thank you, {n}! Let’s carry on.',thanksF:'Thank you, {n}! Now just send the photo of your space.',declined:'No problem! Whenever you like, our team can carry on with you on WhatsApp, with a summary of our conversation. [[wa]]',declinedF:'No problem! You can keep asking here, and you can also send the photo straight to our team on WhatsApp. [[wa]]',lock:'To keep chatting, leave your contact or talk to our team on WhatsApp.',reopen:'Leave my contact',teto:'Our conversation is already quite complete! To carry on with proper care, the team will continue with you on WhatsApp. [[wa]]',hi:'Hello, {n}!'},
      es:{h:'Para continuar, ¿cómo te llamo?',hf:'Para analizar tu foto, ¿me dejas tu nombre y WhatsApp?',p:'Así nuestro equipo puede enviarte las opciones y los precios por WhatsApp.',pf:'Así miro tu ambiente con calma y nuestro equipo puede enviarte las opciones y los precios por WhatsApp.',eb:'Concierge Casa Áurea',name:'Nombre',wa:'WhatsApp',email:'E-mail',city:'Ciudad',opt:'opcional',who:'Eres:',pr:['Cliente final','Arquitecto/a o diseñador/a','Empresa o constructora'],go:'Continuar la conversación',goF:'Continuar',no:'Ahora no',lgpd:'Tus datos quedan solo con Casa Áurea y se usan para atenderte.',priv:'Privacidad',eName:'Cuéntame cómo te llamo.',eWa:'¿Revisas el WhatsApp? Incluye el código de país, p. ej. +54 9 11 2345 6789.',eEmail:'Ese e-mail parece incompleto.',eSave:'No pude guardarlo ahora. Inténtalo de nuevo en un momento o habla con el equipo por WhatsApp.',sending:'Enviando…',thanks:'¡Gracias, {n}! Sigamos.',thanksF:'¡Gracias, {n}! Ahora solo envía la foto de tu espacio.',declined:'¡Está bien! Cuando quieras, nuestro equipo sigue contigo por WhatsApp, con el resumen de nuestra conversación. [[wa]]',declinedF:'¡Está bien! Puedes seguir preguntando aquí, y la foto también puedes enviarla directo a nuestro equipo por WhatsApp. [[wa]]',lock:'Para seguir conversando, deja tu contacto o habla con nuestro equipo por WhatsApp.',reopen:'Dejar mi contacto',teto:'¡Nuestra conversación ya está muy completa! Para seguir con todo cuidado, el equipo continúa contigo por WhatsApp. [[wa]]',hi:'¡Hola, {n}!'}};
    var PFS=['cliente','arquiteto','empresa'];
    function LT(k){var o=LEADT[lg()]||LEADT.pt;return o[k]}
    function sget(st,k){try{return window[st].getItem(k)}catch(e){return null}}
    function sset(st,k,v){try{if(v==null)window[st].removeItem(k);else window[st].setItem(k,v)}catch(e){}}
    var LEAD=null;try{LEAD=JSON.parse(sget('localStorage','ca-lead')||'null');if(!LEAD||!LEAD.t||!LEAD.lid||!LEAD.n)LEAD=null}catch(e){LEAD=null}
    var QN=+(sget('sessionStorage','ca-lead-q')||0)||0,LSTATE=sget('sessionStorage','ca-lead-no')?'no':null,LVAR='msg',PEND=null,LV={name:'',phone:'',email:'',city:'',pf:''};
    /* origem da visita: guardada no primeiro acesso da sessão */
    var SRC=null;try{SRC=JSON.parse(sget('sessionStorage','ca-src')||'null')}catch(e){}
    if(!SRC){SRC={};try{var up=new URLSearchParams(location.search);['utm_source','utm_medium','utm_campaign'].forEach(function(k){var v=up.get(k);if(v)SRC[k]=v.slice(0,120)})}catch(e){}
      try{var rf=document.referrer;if(rf&&new URL(rf).host!==location.host)SRC.referrer=rf.slice(0,300)}catch(e){}
      SRC.landing=(location.pathname+location.search+location.hash).slice(0,300);
      SRC.device=(matchMedia('(max-width:767px)').matches||(matchMedia('(pointer:coarse)').matches&&Math.min(screen.width,screen.height)<768))?'mobile':'desktop';
      SRC.first_at=new Date().toISOString();sset('sessionStorage','ca-src',JSON.stringify(SRC))}
    function needLead(photo){return !LEAD&&(photo||QN>=3)}
    function convN(){return turns.filter(function(t){return t.role==='user'}).length}
    function apiBody(msgs){var b={messages:msgs,lang:lg(),n:LEAD?convN():Math.max(QN,convN())};if(LEAD){b.lead={id:LEAD.lid,t:LEAD.t};b.who={name:LEAD.n,profile:LEAD.p||''}}return b}
    function hiText(){var h=X().hi;return LEAD?h.replace(/^(Olá|Hello|¡Hola)!/,LT('hi').replace('{n}',LEAD.n)):h}
    var lockEl=root.querySelector('.conc-lock');
    function maskPhone(v,del){v=String(v||'');if(del)return v;
      if(/^\s*\+/.test(v))return '+'+v.replace(/[^\d ]/g,'').replace(/\s+/g,' ').replace(/^ /,'').slice(0,20);
      var d=v.replace(/\D/g,'').slice(0,11);if(!d)return '';if(d.length<3)return '('+d;
      var a='('+d.slice(0,2)+') ',r=d.slice(2);return d.length<=10?a+(r.length>4?r.slice(0,4)+'-'+r.slice(4):r):a+r.slice(0,5)+'-'+r.slice(5)}
    function phoneOk(v){var d=String(v||'').replace(/\D/g,'');if(/^\s*\+/.test(v)){if(d.indexOf('55')===0)d=d.slice(2);else return d.length>=8&&d.length<=15}
      return (d.length===10||(d.length===11&&d.charAt(2)==='9'))&&/^[1-9][0-9]/.test(d)}
    function cardHTML(){var f=LVAR==='foto',o=LEADT[lg()]||LEADT.pt,A='<svg aria-hidden="true"><use href="#arrow"/></svg>';
      return '<p class="conc-lead-eb">'+esc(o.eb)+'</p><h3 class="conc-lead-h" id="concLeadT">'+esc(f?o.hf:o.h)+'</h3><p class="conc-lead-p">'+esc(f?o.pf:o.p)+'</p>'+
      '<form class="conc-lead-f" novalidate>'+
      '<label class="cl-f"><span>'+esc(o.name)+' <i aria-hidden="true">*</i></span><input name="name" autocomplete="name" maxlength="80" required value="'+esc(LV.name)+'"></label>'+
      '<label class="cl-f"><span>'+esc(o.wa)+' <i aria-hidden="true">*</i></span><input name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="24" required placeholder="'+(lg()==='pt'?'(48) 99999-9999':'+55 48 99999-9999')+'" value="'+esc(LV.phone)+'"></label>'+
      '<div class="cl-row"><label class="cl-f"><span>'+esc(o.email)+' <em>'+esc(o.opt)+'</em></span><input name="email" type="email" inputmode="email" autocomplete="email" maxlength="120" value="'+esc(LV.email)+'"></label>'+
      '<label class="cl-f"><span>'+esc(o.city)+' <em>'+esc(o.opt)+'</em></span><input name="city" autocomplete="address-level2" maxlength="80" value="'+esc(LV.city)+'"></label></div>'+
      '<fieldset class="cl-who"><legend>'+esc(o.who)+' <em>'+esc(o.opt)+'</em></legend><div class="cl-chips">'+PFS.map(function(k,i){return '<button type="button" data-pf="'+k+'" aria-pressed="'+(LV.pf===k)+'">'+esc(o.pr[i])+'</button>'}).join('')+'</div></fieldset>'+
      '<p class="cl-err" role="alert"></p>'+
      '<div class="cl-acts"><button type="submit" class="cl-go">'+esc(f?o.goF:o.go)+A+'</button><button type="button" class="cl-no">'+esc(o.no)+'</button></div>'+
      '<p class="cl-lgpd">'+esc(o.lgpd)+' <a href="/privacidade" target="_blank" rel="noopener">'+esc(o.priv)+'</a></p></form>'}
    function showForm(on){form.hidden=!on;if(!on){sugg.hidden=true}}
    function mountCard(focus){var old=log.querySelector('.conc-lead');if(old)old.remove();
      var c=document.createElement('div');c.className='conc-lead';c.setAttribute('role','group');c.setAttribute('aria-labelledby','concLeadT');c.innerHTML=cardHTML();log.appendChild(c);
      showForm(false);lockEl.hidden=true;
      requestAnimationFrame(function(){log.scrollTop=Math.max(0,c.offsetTop-log.offsetTop-12)});
      if(focus&&!matchMedia('(pointer:coarse)').matches)setTimeout(function(){var i=c.querySelector(LV.name?'[name=phone]':'[name=name]');if(i)try{i.focus({preventScroll:true})}catch(e){}},280);
      return c}
    function showLead(v){LVAR=v||'msg';LSTATE='card';sset('sessionStorage','ca-lead-no',null);mountCard(true);if(!root.classList.contains('is-open'))open()}
    function showLock(){lockEl.innerHTML='<p>'+esc(LT('lock'))+'</p><p class="conc-lock-a"><button type="button" class="conc-lock-re">'+esc(LT('reopen'))+'</button></p>';lockEl.hidden=false;showForm(false)}
    function leadUI(){
      if(LEAD){LSTATE=null;lockEl.hidden=true;showForm(true);return}
      if(LSTATE==='card'){mountCard(false);return}
      if(LSTATE==='no'&&needLead(false)){bubble('bot',botHTML(LT('declined')));showLock();return}
      lockEl.hidden=true;showForm(true)}
    function decline(){var c=log.querySelector('.conc-lead');if(c)c.remove();var p=PEND;PEND=null;
      if(needLead(false)){LSTATE='no';sset('sessionStorage','ca-lead-no','1');bubble('bot',botHTML(LT('declined')));showLock()}
      else{LSTATE=null;bubble('bot',botHTML(LT('declinedF')));lockEl.hidden=true;showForm(true);if(p&&p.q){box.value=p.q}}
      log.scrollTop=log.scrollHeight}
    function fieldErr(c,name,msg){var e=c.querySelector('.cl-err');[].forEach.call(c.querySelectorAll('input'),function(i){i.removeAttribute('aria-invalid')});
      if(name){var i=c.querySelector('[name='+name+']');if(i){i.setAttribute('aria-invalid','true');try{i.focus({preventScroll:false})}catch(x){}}}e.textContent=msg||''}
    function submitLead(c){
      var nm=LV.name.replace(/\s+/g,' ').trim(),ph=LV.phone.trim(),em=LV.email.trim(),ci=LV.city.replace(/\s+/g,' ').trim();
      if(nm.replace(/[^A-Za-zÀ-ÿ]/g,'').length<2)return fieldErr(c,'name',LT('eName'));
      if(!phoneOk(ph))return fieldErr(c,'phone',LT('eWa'));
      if(em&&!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em))return fieldErr(c,'email',LT('eEmail'));
      fieldErr(c,null,'');var go=c.querySelector('.cl-go'),lbl=go.innerHTML;go.disabled=true;go.textContent=LT('sending');
      fetch('/api/aurea/contato',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:CID,lang:lg(),name:nm,phone:ph,email:em,city:ci,profile:LV.pf,source:SRC,consent:true})})
        .then(function(r){return r.json().catch(function(){return {}}).then(function(j){if(!r.ok||!j||!j.token)throw j||{};return j})})
        .then(function(j){
          var first=nm.split(' ')[0];first=first.charAt(0).toUpperCase()+first.slice(1);
          LEAD={n:first.slice(0,40),lid:CID,t:j.token,p:LV.pf||''};sset('localStorage','ca-lead',JSON.stringify(LEAD));sset('sessionStorage','ca-lead-no',null);
          LSTATE=null;c.remove();var g=log.querySelector('.conc-bot p');if(g&&g.parentNode===log.firstElementChild)g.textContent=hiText();
          var p=PEND;PEND=null;bubble('bot','<p>'+esc(LT(LVAR==='foto'&&!(p&&p.q)?'thanksF':'thanks').replace('{n}',LEAD.n))+'</p>');
          lockEl.hidden=true;showForm(true);
          if(p){if(p.img){PIMG=p.img;showAtt()}ask(p.q||'')}
          else if(LVAR==='foto'){try{fileIn.click()}catch(e){}}
          else box.focus()})
        .catch(function(j){go.disabled=false;go.innerHTML=lbl;
          if(j&&j.field==='phone')fieldErr(c,'phone',LT('eWa'));else if(j&&j.field==='name')fieldErr(c,'name',LT('eName'));else if(j&&j.field==='email')fieldErr(c,'email',LT('eEmail'));
          else fieldErr(c,null,LT('eSave'))})}
    log.addEventListener('input',function(e){var i=e.target;if(!i.closest||!i.closest('.conc-lead'))return;
      if(i.name==='phone'){var del=/^delete/.test(e.inputType||''),v=maskPhone(i.value,del);if(v!==i.value)i.value=v}
      if(i.name in LV)LV[i.name]=i.value;if(i.getAttribute('aria-invalid')){i.removeAttribute('aria-invalid');var er=i.closest('.conc-lead').querySelector('.cl-err');if(er)er.textContent=''}});
    log.addEventListener('click',function(e){var c=e.target.closest&&e.target.closest('.conc-lead');if(!c)return;
      var b=e.target.closest('[data-pf]');if(b){var k=b.getAttribute('data-pf');LV.pf=LV.pf===k?'':k;[].forEach.call(c.querySelectorAll('[data-pf]'),function(x){x.setAttribute('aria-pressed',String(x.getAttribute('data-pf')===LV.pf))});return}
      if(e.target.closest('.cl-no'))decline()});
    log.addEventListener('submit',function(e){var c=e.target.closest&&e.target.closest('.conc-lead');if(!c)return;e.preventDefault();e.stopPropagation();submitLead(c)});
    lockEl.addEventListener('click',function(e){if(e.target.closest('.conc-lock-re'))showLead(LVAR)});

"""
s = replace_once(s,
    "    /* ---- motor local (sem IA): respostas de especialista com as mesmas regras ---- */",
    LEAD_JS + "    /* ---- motor local (sem IA): respostas de especialista com as mesmas regras ---- */",
    'Áurea: captação de contato')
# a conversa vai para a IA com o total de mensagens e, para quem deixou contato, o token, o nome e o perfil;
# a recusa do servidor (sem contato) mostra o cartão em vez de cair no motor local
s = replace_once(s,
    "body:JSON.stringify({messages:msgs,lang:(typeof LANG!=='undefined'?LANG:'pt')}),signal:o.signal})",
    "body:JSON.stringify(apiBody(msgs)),signal:o.signal})",
    'Áurea: corpo do pedido')
s = replace_once(s,
    ".then(function(r){if(!r.ok)throw {code:r.status===503?'capability_disabled':'http_'+r.status};return r.json()})",
    ".then(function(r){if(r.status===403||r.status===429)return r.json().catch(function(){return {}}).then(function(j){throw {code:j&&j.error==='contato'?'contato':j&&j.error==='teto'?'teto':'http_'+r.status}});"
    "if(!r.ok)throw {code:r.status===503?'capability_disabled':'http_'+r.status};return r.json()})",
    'Áurea: recusa do servidor')
s = replace_once(s,
    "      q=String(q||'').trim(); if((!q&&!PIMG)||busy)return; box.value=''; sugg.hidden=true;\n",
    "      q=String(q||'').trim(); if((!q&&!PIMG)||busy)return; box.value=''; sugg.hidden=true;\n"
    "      if(needLead(!!PIMG)){PEND={q:q,img:PIMG};PIMG=null;showAtt();showLead(PEND.img?'foto':'msg');return}\n"
    "      if(!LEAD){QN++;sset('sessionStorage','ca-lead-q',String(QN))}\n",
    'Áurea: contato antes da 4ª mensagem')
s = replace_once(s,
    "          var c=e&&e.code;\n",
    "          var c=e&&e.code;\n"
    "          if(c==='contato'||c==='teto'){var ub=b.previousElementSibling;b.remove();turns.pop();LOGT.pop();save();setBusy(false);\n"
    "            if(c==='teto'){bubble('bot',botHTML(LT('teto')));return}\n"
    "            if(ub&&ub.classList.contains('conc-user'))ub.remove();if(LEAD){LEAD=null;sset('localStorage','ca-lead',null)}\n"
    "            PEND={q:q,img:pid?PHOTOS[pid]:null};showLead(PEND.img?'foto':'msg');return}\n",
    'Áurea: recusa sem contato')
s = replace_once(s,
    "    cam.addEventListener('click',function(){if(!busy)fileIn.click()});",
    "    cam.addEventListener('click',function(){if(busy)return;if(needLead(true)){PEND=null;showLead('foto');return}fileIn.click()});",
    'Áurea: foto pede contato')
s = replace_once(s,
    "log.innerHTML='';bubble('bot','<p>'+esc(X().hi)+'</p>');",
    "log.innerHTML='';bubble('bot','<p>'+esc(hiText())+'</p>');",
    'Áurea: saudação com o nome')
s = replace_once(s,
    "root.querySelector('.conc-wa-top').setAttribute('aria-label',X().wa);",
    "root.querySelector('.conc-wa-top').setAttribute('aria-label',X().wa);leadUI();",
    'Áurea: cartão ao redesenhar')
s = replace_once(s,
    "if(ctl)ctl.abort();turns=[];PHOTOS={};PIMG=null;showAtt();save();recNew();renderAll()",
    "if(ctl)ctl.abort();turns=[];PHOTOS={};PIMG=null;PEND=null;showAtt();save();recNew();renderAll()",
    'Áurea: nova conversa sem pendência')
s = replace_once(s,
    "var body=JSON.stringify({id:CID,lang:lg(),turns:LOGT,wa:!!wa});",
    "var body=JSON.stringify({id:CID,lang:lg(),turns:LOGT,wa:!!wa,source:SRC,n:LOGT.filter(function(t){return t.role==='user'}).length,lead:LEAD?{id:LEAD.lid,t:LEAD.t}:null});",
    'Áurea: registro com origem')
LEAD_CSS = (
    '.conc-form[hidden],.conc-lock[hidden]{display:none}'
    '.conc-lead{position:relative;flex:none;margin-top:var(--s1);padding:var(--s4) var(--s5);border:1px solid rgb(207 174 130/.3);'
    'background:linear-gradient(180deg,rgb(207 174 130/.07),rgb(207 174 130/0) 45%);animation:clIn .7s cubic-bezier(.16,1,.3,1) both}'
    '.conc-lead::before{content:"";position:absolute;left:var(--s5);right:var(--s5);top:-1px;height:1px;background:linear-gradient(90deg,transparent,#cfae82,transparent)}'
    '.conc-lead-eb{font-size:.625rem;letter-spacing:.26em;text-transform:uppercase;color:#cfae82}'
    '.conc-lead-h{margin-top:var(--s2);font-family:var(--serif);font-weight:400;font-size:1.4375rem;line-height:1.1;letter-spacing:-.005em;color:#efe8dd}'
    '.conc-lead-p{margin-top:var(--s2);font-size:.8125rem;line-height:1.55;color:rgb(239 232 221/.66)}'
    '.conc-lead-f{margin-top:var(--s3);display:grid;gap:.7rem}'
    '.cl-f{display:block;min-width:0}'
    '.cl-f span,.cl-who legend{display:block;padding:0;font-size:.625rem;letter-spacing:.18em;text-transform:uppercase;color:rgb(239 232 221/.58)}'
    '.cl-f span i{font-style:normal;color:#cfae82}'
    '.cl-f em,.cl-who legend em{font-style:normal;letter-spacing:.04em;text-transform:none;color:rgb(239 232 221/.36);margin-left:.25em}'
    '.cl-f input{display:block;width:100%;margin-top:.1rem;padding:.4rem 0 .45rem;background:none;border:0;border-bottom:1px solid rgb(239 232 221/.22);border-radius:0;'
    'color:#efe8dd;font:inherit;font-size:1rem;line-height:1.3;outline:0;transition:border-color .25s}'
    '.cl-f input:focus{border-bottom-color:#cfae82}.cl-f input::placeholder{color:rgb(239 232 221/.26)}'
    '.cl-f input[aria-invalid="true"]{border-bottom-color:#e0a898}'
    '.cl-f input:-webkit-autofill{-webkit-text-fill-color:#efe8dd;-webkit-box-shadow:0 0 0 40px #141c30 inset;caret-color:#efe8dd}'
    '.cl-row{display:grid;grid-template-columns:1fr 1fr;gap:var(--s4)}'
    '.cl-who{border:0;padding:0;margin:var(--s1) 0 0;min-width:0}'
    '.cl-chips{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.45rem}'
    '.cl-chips button{padding:.4rem .7rem;border:1px solid rgb(239 232 221/.2);border-radius:999px;font-size:.75rem;line-height:1.2;color:rgb(239 232 221/.8);transition:border-color .25s,color .25s,background .25s}'
    '.cl-chips button:hover{border-color:rgb(207 174 130/.6);color:#efe8dd}'
    '.cl-chips button[aria-pressed="true"]{border-color:#cfae82;color:#cfae82;background:rgb(207 174 130/.1)}'
    '.cl-err{font-size:.75rem;line-height:1.45;color:#e8b8aa}.cl-err:empty{display:none}'
    '.cl-acts{display:flex;align-items:center;flex-wrap:wrap;gap:var(--s2) var(--s4)}'
    '.cl-go{display:inline-flex;align-items:center;gap:.65rem;min-height:44px;padding:0 1.15rem;border-radius:999px;background:#efe8dd;color:#14110d;font-size:.8125rem;font-weight:500;letter-spacing:.01em;transition:background .25s}'
    '.cl-go svg{width:20px;height:8px;transition:transform .45s cubic-bezier(.16,1,.3,1)}.cl-go:hover{background:#fff}.cl-go:hover svg{transform:translateX(3px)}'
    '.cl-go[disabled]{opacity:.65;pointer-events:none}'
    '.cl-no{min-height:44px;padding:0 .25rem;font-size:.75rem;color:rgb(239 232 221/.6);text-decoration:underline;text-underline-offset:4px;text-decoration-color:rgb(239 232 221/.25)}'
    '.cl-no:hover{color:#efe8dd}'
    '.cl-lgpd{padding-top:var(--s3);border-top:1px solid rgb(239 232 221/.1);font-size:.6875rem;line-height:1.5;color:rgb(239 232 221/.45)}'
    '.cl-lgpd a{color:rgb(239 232 221/.72);text-decoration:underline;text-underline-offset:2px;text-decoration-color:rgb(239 232 221/.3)}.cl-lgpd a:hover{color:#efe8dd}'
    '.conc-lock{margin:0 var(--s4);padding:var(--s4) var(--s2) var(--s2);border-top:1px solid rgb(239 232 221/.12);text-align:center}'
    '.conc-lock p:first-child{font-family:var(--serif);font-style:italic;font-size:1.0625rem;line-height:1.35;color:rgb(239 232 221/.82)}'
    '.conc-lock-a{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:var(--s2) var(--s4);margin-top:var(--s3)}'
    '.conc-lock-re{min-height:40px;font-size:.75rem;color:#efe8dd;text-decoration:underline;text-underline-offset:4px;text-decoration-color:rgb(207 174 130/.6)}'
    '.conc-lock-re:hover{color:#cfae82}'
    '@keyframes clIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}'
    '@media(max-width:359px){.cl-row{grid-template-columns:1fr}}'
    '@media (prefers-reduced-motion:reduce){.conc-lead{animation:none}}'
)
s = s.replace('</style>', LEAD_CSS + '</style>', 1)

# 4e. Reunião com Rafa e Camila (21/10/2026) — mudanças visuais autorizadas pelo Gabriel em 21/10/2026.
#     Mesma linguagem V62 (cores, tipografia, tokens de movimento e componentes existentes); tudo em PT/EN/ES.
GOOGLE_REVIEW_URL = 'https://search.google.com/local/writereview?placeid=ChIJaWVDlm-p2JQR4ca4-4G334k'
#     (ficha "Casa Áurea" no Google: Av. Valério Gomes, 42 · Centro, Tijucas — SC · +55 48 98457-6227)
PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='
ARROW = '<svg aria-hidden="true"><use href="#arrow"/></svg>'
XICON = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">'
         '<path d="M6 6l12 12M18 6 6 18"/></svg>')

# 4e-1. abertura: o fim do filme alterna com o destaque da Coleção de Natal (crossfade, dois traços,
#       pausa com o mouse no texto; sem rotação automática com movimento reduzido)
s = replace_once(s,
    '              <a href="#showroom" class="tl">Conhecer o showroom<svg aria-hidden="true"><use href="#arrow"/></svg></a>\n'
    '            </div>\n'
    '          </div>\n'
    '        </div>\n',
    '              <a href="#showroom" class="tl">Conhecer o showroom<svg aria-hidden="true"><use href="#arrow"/></svg></a>\n'
    '            </div>\n'
    '          </div>\n'
    '          <div class="post-alt" id="postAlt" inert>\n'
    f'            <div class="post-alt-img"><img loading="lazy" class="pa-m" data-img="n_hero" src="{PIXEL}" alt="Árvore de Natal com bolas douradas e prateadas, em ambiente claro com piso de mármore">'
    f'<img loading="lazy" class="pa-d" data-img="n_hero_sq" src="{PIXEL}" alt="" aria-hidden="true"></div>\n'
    '            <div class="post-alt-shade" aria-hidden="true"></div>\n'
    '            <div class="post-copy wrap" id="postNatal">\n'
    '              <p class="eyebrow">Coleção de Natal 2026</p>\n'
    '              <h2 class="display"><span class="mask"><span>O Natal,</span></span><span class="mask"><span>em cada <em>detalhe</em>.</span></span></h2>\n'
    '              <p class="lead">Árvores, guirlandas e arranjos para residências, condomínios e empresas, com montagem da nossa equipe.</p>\n'
    '              <div class="actions">\n'
    f'                <a class="btn btn-primary" href="#/colecoes/natal">Conhecer a coleção{ARROW}</a>\n'
    f'                <button class="tl" data-wa="Olá, Casa Áurea. Gostaria de consultar a disponibilidade da Coleção de Natal 2026.">Consultar disponibilidade{ARROW}</button>\n'
    '              </div>\n'
    '            </div>\n'
    '          </div>\n'
    '          <div class="post-dots" id="postDots" role="group" aria-label="Destaques da abertura">'
    '<button type="button" aria-label="Abertura" aria-pressed="true"><i></i></button>'
    '<button type="button" aria-label="Coleção de Natal" aria-pressed="false"><i></i></button></div>\n'
    '        </div>\n',
    'abertura: destaque do Natal')
HERO_JS = r'''<script>
/* Abertura: alterna com o destaque da Coleção de Natal (só depois do filme, com a abertura na tela) */
(function(){
  var post=document.getElementById('post'),alt=document.getElementById('postAlt'),main=document.getElementById('postCopy'),nat=document.getElementById('postNatal'),dots=document.getElementById('postDots');
  if(!post||!alt||!main||!nat||!dots)return;
  var bs=[].slice.call(dots.querySelectorAll('button')),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,idx=0,seen=true,t=null;
  function show(i){
    if(i===idx)return; idx=i; var a=i===1; post.classList.toggle('is-alt',a);
    bs.forEach(function(b,k){b.setAttribute('aria-pressed',String(k===i))});
    clearTimeout(t);
    if(a){alt.removeAttribute('inert');main.setAttribute('inert','');nat.classList.remove('in');void nat.offsetWidth;nat.classList.add('in')}
    else{main.removeAttribute('inert');alt.setAttribute('inert','');t=setTimeout(function(){if(idx===0)nat.classList.remove('in')},1300)}
  }
  function sync(){
    var on=main.classList.contains('in');
    dots.classList.toggle('on',on); dots.classList.toggle('run',on&&seen&&!reduced);
    if(!on&&idx!==0)show(0);
  }
  new MutationObserver(sync).observe(main,{attributes:true,attributeFilter:['class']});
  if('IntersectionObserver' in window)new IntersectionObserver(function(es){seen=es[0].isIntersecting;sync()}).observe(post);
  dots.addEventListener('animationend',function(){if(dots.classList.contains('run'))show(idx?0:1)});
  bs.forEach(function(b,k){b.addEventListener('click',function(){show(k)})});
  /* pausa enquanto o mouse está sobre o texto, os botões ou os traços (a foto ocupa a tela toda) */
  post.addEventListener('mouseover',function(e){post.classList.toggle('is-paused',!!(e.target.closest&&e.target.closest('.post-copy>*,.post-dots')))});
  post.addEventListener('mouseleave',function(){post.classList.remove('is-paused')});
  post.addEventListener('focusin',function(){post.classList.add('is-paused')});
  post.addEventListener('focusout',function(e){if(!post.contains(e.relatedTarget))post.classList.remove('is-paused')});
  sync();
})();
</script>
'''
s = replace_once(s, '<!-- CATEGORIAS: logo depois do filme, sem intervalo -->',
                 HERO_JS + '<!-- CATEGORIAS: logo depois do filme, sem intervalo -->', 'abertura: script do destaque')
HERO_CSS = (
    '.post-alt{position:absolute;inset:0;z-index:1;background:#0f1628;opacity:0;visibility:hidden;transition:opacity 1.2s var(--ease-reveal),visibility 0s linear 1.2s}'
    '.post.is-alt .post-alt{opacity:1;visibility:visible;transition:opacity 1.2s var(--ease-reveal),visibility 0s}'
    '.post-alt-img{position:absolute;inset:0}.post-alt-img img{width:100%;height:100%;object-fit:cover;object-position:50% 22%}'
    '.post-alt-img .pa-d{display:none}'
    '.post-alt .post-alt-img img{transform:scale(1.04);transition:transform 6s var(--ease-editorial)}.post.is-alt .post-alt-img img{transform:none}'
    '.post-alt-shade{position:absolute;inset:0;background:linear-gradient(180deg,rgb(15 22 40/.45) 0%,rgb(15 22 40/0) 22%,rgb(15 22 40/.2) 42%,rgb(15 22 40/.9) 74%,#0f1628 100%)}'
    '.post-dots{position:absolute;z-index:3;left:var(--gutter);bottom:max(1.5rem,env(safe-area-inset-bottom));display:flex;gap:var(--s3);opacity:0;pointer-events:none;transition:opacity .8s var(--ease-nav)}'
    '.post-dots.on{opacity:1;pointer-events:auto}'
    '.post-dots button{width:40px;height:28px;display:flex;align-items:center}'
    '.post-dots i{position:relative;display:block;width:100%;height:1px;background:rgb(244 239 232/.3);overflow:hidden}'
    '.post-dots i::after{content:"";position:absolute;inset:0;background:var(--bronze-lt);transform:scaleX(0);transform-origin:left}'
    '.post-dots [aria-pressed="true"] i::after{transform:scaleX(1)}'
    '.post-dots.run [aria-pressed="true"] i::after{animation:postDot 4.6s linear both}'
    '.post.is-paused .post-dots i::after{animation-play-state:paused}'
    '.post-dots button:hover i{background:rgb(244 239 232/.6)}'
    '@keyframes postDot{from{transform:scaleX(0)}to{transform:scaleX(1)}}'
    '@media(max-width:767px){.post-dots{bottom:auto;top:calc(env(safe-area-inset-top,0px) + 5.25rem)}}'
    '@media(min-width:768px) and (max-width:1023px){.post-alt-img img{object-position:62% 28%}.post-alt-shade{background:linear-gradient(90deg,rgb(15 22 40/.94) 0%,rgb(15 22 40/.78) 50%,rgb(15 22 40/.4) 100%)}}'
    '@media(min-width:1024px){.post-alt-img{left:auto;width:42%}.post-alt-img .pa-m{display:none}.post-alt-img .pa-d{display:block;object-position:50% 50%}'
    '.post-alt-shade{background:linear-gradient(90deg,#0f1628 0%,#0f1628 58%,rgb(15 22 40/0) 72%)}}'
    '@media (prefers-reduced-motion:reduce){.post-alt,.post.is-alt .post-alt{transition:none}.post-alt .post-alt-img img{transform:none;transition:none}}'
)

# 4e-2. Áurea: convite de boas-vindas (autorizado pelo Gabriel em 21/10 e ampliado em 26/10).
#   Alguns segundos depois do filme, a Áurea entra no centro da tela com caminhos para guiar a visita.
#   Uma vez por sessão; não aparece se a conversa já foi aberta. No celular, vira uma folha que sobe de baixo.
ARR = '<svg aria-hidden="true"><use href="#arrow"/></svg>'
s = replace_once(s,
    '<div class="float" id="float" inert>',
    '<div class="aurea-hi" id="aureaHi" role="dialog" aria-modal="true" aria-labelledby="aureaHiT" aria-label="Convite da Áurea" hidden>'
    '<div class="aurea-hi-bg" data-hi-close></div>'
    '<div class="aurea-hi-card">'
    f'<button type="button" class="aurea-hi-x" data-hi-close aria-label="Fechar">{XICON}</button>'
    '<div class="aurea-hi-head"><span class="conc-av"><svg aria-hidden="true"><use href="#mark"/></svg></span>'
    '<p class="aurea-hi-eb">Concierge Casa Áurea</p></div>'
    '<h2 class="aurea-hi-h" id="aureaHiT">Olá, sou a <em>Áurea</em>.</h2>'
    '<p class="aurea-hi-p">Estou aqui para guiar a sua visita: indico peças para o seu ambiente, analiso uma foto do seu espaço e mostro o melhor do nosso acervo.</p>'
    '<p class="aurea-hi-q">Por onde quer começar?</p>'
    '<ul class="aurea-hi-ops">'
    f'<li><button type="button" data-hi="peca"><span><b>Encontrar a peça certa</b><i>Conte o ambiente e eu indico as opções</i></span>{ARR}</button></li>'
    f'<li><button type="button" data-hi="foto"><span><b>Enviar uma foto do meu espaço</b><i>Eu olho o ambiente e sugiro o que combina</i></span>{ARR}</button></li>'
    f'<li><button type="button" data-hi="natal"><span><b>Conhecer a Coleção de Natal</b><i>Árvores, guirlandas e ambientação</i></span>{ARR}</button></li>'
    f'<li><button type="button" data-hi="acervo"><span><b>Ver todo o acervo</b><i>Peças com filtros por tipo, material e cor</i></span>{ARR}</button></li>'
    '</ul>'
    '<button type="button" class="aurea-hi-skip" data-hi-close>Prefiro explorar sozinho</button>'
    '</div></div>\n'
    '<div class="float" id="float" inert>',
    'Áurea: convite')
HI_JS = r"""<script>
/* Convite da Áurea: 7 s depois da entrada e só com o botão da Áurea à vista (filme concluído ou pulado).
   Uma vez por sessão; não aparece se a conversa já foi aberta. */
(function(){
  var hi=document.getElementById('aureaHi'); if(!hi)return;
  var KEY='ca-aurea-hi',t0=Date.now(),done=false,since=0,timer=null,root=document.documentElement,prev=null;
  var ASK={pt:'Quero ajuda para encontrar a peça certa para o meu ambiente.',en:'I would like help finding the right piece for my space.',es:'Quiero ayuda para encontrar la pieza ideal para mi ambiente.'};
  function lang(){var l=(document.documentElement.lang||'pt').slice(0,2);return l==='en'||l==='es'?l:'pt'}
  function get(k){try{return sessionStorage.getItem(k)}catch(e){return null}}
  function mark(){try{sessionStorage.setItem(KEY,'1')}catch(e){}}
  function used(){if(get(KEY))return true;try{var c=JSON.parse(get('ca-conc')||'[]');if(c&&c.length)return true}catch(e){}return root.classList.contains('conc-on')}
  if(used())return;
  var fl=document.getElementById('float'),mb=document.getElementById('mbar');
  function ready(){var b=matchMedia('(max-width:767px)').matches?mb:fl;
    return !!b&&b.classList.contains('on')&&!document.querySelector('dialog[open]')&&!document.body.classList.contains('menu-open')&&!root.classList.contains('conc-on')}
  function hide(){if(hi.hidden)return;hi.classList.remove('on');root.classList.remove('hi-on');setTimeout(function(){hi.hidden=true},700);
    if(prev&&prev.focus&&document.activeElement&&hi.contains(document.activeElement))try{prev.focus({preventScroll:true})}catch(e){}}
  function show(){done=true;mark();prev=document.activeElement;hi.hidden=false;root.classList.add('hi-on');
    requestAnimationFrame(function(){requestAnimationFrame(function(){hi.classList.add('on');var f=hi.querySelector('[data-hi]');if(f&&!matchMedia('(pointer:coarse)').matches)try{f.focus({preventScroll:true})}catch(e){}})})}
  function check(){if(done)return;if(used()){done=true;return}
    if(Date.now()-t0<7000||!ready()){since=0;return} if(!since)since=Date.now(); if(Date.now()-since>=1200)show()}
  timer=setInterval(function(){check();if(done)clearInterval(timer)},400);
  hi.addEventListener('click',function(e){
    if(e.target.closest('[data-hi-close]')){hide();return}
    var b=e.target.closest('[data-hi]');if(!b)return;var k=b.getAttribute('data-hi'),C=window.__conc;hide();
    if(k==='natal'){location.hash='#/colecoes/natal';return}
    if(k==='acervo'){location.hash='#/acervo';return}
    if(!C)return;C.open();
    setTimeout(function(){
      if(k==='peca')C.ask(ASK[lang()]||ASK.pt);
      else{var cam=document.querySelector('#conc .conc-cam');if(cam)cam.click()}
    },k==='foto'?320:120);
  });
  document.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('[data-conc]')){mark();done=true;hide()}});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')hide();
    if(e.key==='Tab'&&hi.classList.contains('on')){var f=[].slice.call(hi.querySelectorAll('button')).filter(function(x){return x.offsetParent});if(!f.length)return;
      var a=f[0],z=f[f.length-1];if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}}});
})();
</script>
"""
s = replace_once(s, '</body>', HI_JS + '</body>', 'Áurea: script do convite')
HI_CSS = (
    '.aurea-hi{position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:var(--gutter)}.aurea-hi[hidden]{display:none}'
    '.aurea-hi-bg{position:absolute;inset:0;background:rgb(8 11 22/.58);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);opacity:0;transition:opacity .7s var(--ease-nav)}'
    '.aurea-hi.on .aurea-hi-bg{opacity:1}'
    '.aurea-hi-card{position:relative;width:min(560px,100%);max-height:calc(100dvh - 2*var(--gutter));overflow:auto;background:#0f1628;color:#efe8dd;'
    'border:1px solid rgb(207 174 130/.28);border-radius:4px;padding:clamp(2rem,4vw,3rem) clamp(1.5rem,4vw,3rem) clamp(1.5rem,3vw,2.25rem);'
    'box-shadow:0 40px 120px -30px rgb(0 0 0/.8);opacity:0;transform:translateY(24px) scale(.985);transition:opacity .8s var(--ease-nav),transform .9s var(--ease-editorial)}'
    '.aurea-hi.on .aurea-hi-card{opacity:1;transform:none}'
    '.aurea-hi-card::before{content:"";position:absolute;left:clamp(1.5rem,4vw,3rem);right:clamp(1.5rem,4vw,3rem);top:0;height:1px;background:linear-gradient(90deg,transparent,#cfae82,transparent);opacity:.7}'
    '.aurea-hi-x{position:absolute;top:10px;right:10px;width:44px;height:44px;display:grid;place-items:center;border-radius:50%;color:rgb(239 232 221/.6)}'
    '.aurea-hi-x:hover,.aurea-hi-x:focus-visible{background:rgb(239 232 221/.08);color:#fff}.aurea-hi-x svg{width:18px;height:18px}'
    '.aurea-hi-head{display:flex;align-items:center;gap:var(--s3)}.aurea-hi-head .conc-av{width:44px;height:44px}.aurea-hi-head .conc-av svg{width:16px;height:21px}'
    '.aurea-hi-eb{margin:0;font-size:.6875rem;letter-spacing:.28em;text-transform:uppercase;color:#cfae82}'
    '.aurea-hi-h{margin:var(--s5) 0 0;font-family:var(--serif);font-weight:400;font-size:clamp(2rem,5vw,2.75rem);line-height:1.05;letter-spacing:-.01em;color:#efe8dd}'
    '.aurea-hi-h em{font-style:italic;color:#cfae82}'
    '.aurea-hi-p{margin:var(--s4) 0 0;font-size:.9375rem;line-height:1.65;color:rgb(239 232 221/.74);max-width:34em}'
    '.aurea-hi-q{margin:var(--s6) 0 var(--s2);font-size:.6875rem;letter-spacing:.24em;text-transform:uppercase;color:rgb(239 232 221/.55)}'
    '.aurea-hi-ops{list-style:none;margin:0;padding:0;border-top:1px solid rgb(239 232 221/.12)}'
    '.aurea-hi-ops li{border-bottom:1px solid rgb(239 232 221/.12)}'
    '.aurea-hi-ops button{width:100%;display:flex;align-items:center;gap:var(--s4);padding:1rem .25rem;text-align:left;color:#efe8dd;transition:padding .45s var(--ease-editorial),color .3s}'
    '.aurea-hi-ops button span{flex:1;min-width:0}'
    '.aurea-hi-ops b{display:block;font-family:var(--serif);font-weight:400;font-size:1.25rem;line-height:1.25}'
    '.aurea-hi-ops i{display:block;font-style:normal;font-size:.8125rem;color:rgb(239 232 221/.55);margin-top:2px}'
    '.aurea-hi-ops svg{width:22px;height:12px;flex:none;color:#cfae82;transition:transform .45s var(--ease-editorial)}'
    '.aurea-hi-ops button:hover,.aurea-hi-ops button:focus-visible{padding-left:.75rem}.aurea-hi-ops button:hover b,.aurea-hi-ops button:focus-visible b{color:#cfae82}'
    '.aurea-hi-ops button:hover svg,.aurea-hi-ops button:focus-visible svg{transform:translateX(4px)}'
    '.aurea-hi-skip{display:block;margin:var(--s5) auto 0;padding:.5rem;font-size:.8125rem;color:rgb(239 232 221/.6);text-decoration:underline;text-underline-offset:4px;text-decoration-color:rgb(239 232 221/.25)}'
    '.aurea-hi-skip:hover{color:#efe8dd}'
    'html.conc-on .aurea-hi{display:none}html.hi-on{overflow:hidden}'
    '@media(max-width:767px){.aurea-hi{place-items:end stretch;padding:0}'
    '.aurea-hi-card{width:100%;max-height:92dvh;border-radius:18px 18px 0 0;border-bottom:0;padding:2rem 1.375rem calc(1.25rem + env(safe-area-inset-bottom,0px));transform:translateY(100%)}'
    '.aurea-hi-ops b{font-size:1.125rem}.aurea-hi-ops button{padding:.85rem .25rem}.aurea-hi-p{font-size:.875rem}}'
    '@media (prefers-reduced-motion:reduce){.aurea-hi-card,.aurea-hi-bg{transition:none}.aurea-hi-card{transform:none}}'
)

# 4e-3. cortinas e persianas: ateliê próprio (home, entre "Solução completa" e "Matéria") e na Curadoria
WA_CORT = 'Olá! Quero um orçamento de cortinas/persianas.'
s = replace_once(s,
    '  <!-- 04 MATÉRIA: pedra, madeira, bouclé -->',
    '  <!-- CORTINAS E PERSIANAS: ateliê próprio (reunião de 21/10/2026) -->\n'
    '  <section id="cortinas" class="dark sec cort" aria-labelledby="cort-t">\n'
    '    <div class="wrap g12">\n'
    f'      <figure class="cort-pic"><div class="ph rv-img"><img loading="lazy" data-img="mt_linho" src="{PIXEL}" alt="Linho em caimento natural, com a trama aparente"></div></figure>\n'
    '      <div class="cort-txt">\n'
    '        <p class="eyebrow rv-up">Cortinas e persianas · Ateliê próprio</p>\n'
    '        <h2 id="cort-t" class="h2 rv-up">A luz da casa, feita sob medida.</h2>\n'
    '        <p class="lead muted rv-up">Há mais de 20 anos, nosso ateliê desenha e confecciona cortinas e persianas para cada janela: tecidos, forros e blackout, persianas manuais ou motorizadas, com medição e instalação pela nossa equipe.</p>\n'
    '        <dl class="sol3-stats cort-stats rv-up"><div><dt>20<sup>+</sup></dt><dd>anos no mercado</dd></div><div><dt>Ateliê</dt><dd>próprio</dd></div><div><dt>Sob medida</dt><dd>medição e instalação</dd></div></dl>\n'
    f'        <p class="cort-cta rv-up"><button class="btn btn-primary" data-wa="{WA_CORT}">Pedir orçamento{ARROW}</button></p>\n'
    '      </div>\n'
    '    </div>\n'
    '  </section>\n\n'
    '  <!-- 04 MATÉRIA: pedra, madeira, bouclé -->',
    'cortinas: bloco da home')
s = replace_once(s,
    "[['Cortinas','Para desenhar a luz e o silêncio do ambiente.'],",
    "[['Cortinas e persianas','Ateliê próprio há mais de 20 anos: sob medida, com medição e instalação.'],",
    'cortinas: Curadoria')
s = replace_once(s,
    "'<figure class=\"pg-wide\"><div class=\"ph\"><img loading=\"lazy\" src=\"'+IMG.jardins+'\"",
    "'<p style=\"margin-top:var(--s6)\"><button class=\"tl\" data-wa=\"" + WA_CORT + "\">Orçamento de cortinas e persianas" + ARROW + "</button></p>'+\n"
    "      '<figure class=\"pg-wide\"><div class=\"ph\"><img loading=\"lazy\" src=\"'+IMG.jardins+'\"",
    'cortinas: CTA na Curadoria')
s = replace_once(s,
    "      if(/natal|christmas|navidad|arvore|guirland|locacao|aluguel|rental/.test(s))",
    "      if(/cortina|persiana|curtain|blind|blackout/.test(s))out.push(T3('Sim! A Casa Áurea tem ateliê próprio de cortinas e persianas, há mais de 20 anos no mercado: tudo sob medida, inclusive persianas motorizadas, com medição e instalação pela equipe. Para um orçamento, é só chamar no WhatsApp.',"
    "'Yes! Casa Áurea has its own curtain and blinds workshop, with over 20 years in the trade: everything made to measure, including motorised blinds, with measuring and installation by our team. For a quote, just message us on WhatsApp.',"
    "'¡Sí! Casa Áurea tiene taller propio de cortinas y persianas, con más de 20 años en el mercado: todo a medida, incluidas persianas motorizadas, con medición e instalación de nuestro equipo. Para un presupuesto, escríbenos por WhatsApp.')+' [[wa]]');\n"
    "      if(/natal|christmas|navidad|arvore|guirland|locacao|aluguel|rental/.test(s))",
    'cortinas: resposta local da Áurea')
CORT_CSS = (
    '.cort .cort-pic{grid-column:1/-1}.cort .cort-pic .ph{aspect-ratio:3/2}.cort .cort-pic img{object-position:50% 40%}'
    '.cort .cort-txt{grid-column:1/-1;margin-top:var(--s7)}'
    '.cort .h2{margin-top:var(--s5);max-width:11em}.cort .lead{margin-top:var(--s5)}'
    '.cort-stats{margin-top:var(--s7)}.cort-stats dt{color:var(--on-dark);font-size:clamp(1.375rem,5.6vw,2.25rem)}.cort-stats dd{color:var(--on-dark-muted)}'
    '.cort-cta{margin-top:var(--s7)}'
    '@media(min-width:1024px){.cort .cort-pic{grid-column:1/6}.cort .cort-pic .ph{aspect-ratio:4/5}'
    '.cort .cort-txt{grid-column:7/13;align-self:center;margin-top:0}}'
)

# 4e-4. "Avalie a Casa Áurea no Google": no cartão do mapa (rodapé) e na seção do showroom
s = replace_once(s,
    '>Traçar rota</a></p></div>',
    f'>Traçar rota</a></p><p class="f2-map-r"><a class="ul" target="_blank" rel="noopener" href="{GOOGLE_REVIEW_URL}">Avalie a Casa Áurea no Google</a></p></div>',
    'Google: rodapé')
s = replace_once(s,
    '<div class="s1-r rv-up"><p><button class="tl" data-wa="Olá, Casa Áurea. Gostaria de agendar uma visita ao showroom.">Agendar uma visita<svg aria-hidden="true"><use href="#arrow"/></svg></button></p></div>',
    '<div class="s1-r rv-up"><p><button class="tl" data-wa="Olá, Casa Áurea. Gostaria de agendar uma visita ao showroom.">Agendar uma visita<svg aria-hidden="true"><use href="#arrow"/></svg></button></p>'
    f'<p class="s1-rev"><a class="ul" target="_blank" rel="noopener" href="{GOOGLE_REVIEW_URL}">Avalie a Casa Áurea no Google</a></p></div>',
    'Google: showroom')
REV_CSS = (
    '.f2-map-r{margin-top:var(--s3);font-size:.8125rem;color:rgb(239 232 221/.72)}.f2-map-r a:hover{color:#efe8dd}'
    '@media(min-width:768px){.f2-map:has(.f2-map-r){height:320px}}'
    '#showroom .s1-rev{margin-top:var(--s4);font-size:.8125rem;color:rgb(244 239 232/.78)}'
)

# 4e-5. Meu projeto: uma mensagem com todas as peças, numeradas e com o código público (CA-XXX-0000)
s = replace_once(s,
    "    var pecas=state.items.filter(function(i){return i.t==='peca'}).map(function(i){return'— '+P(i.id).name});\n"
    "    var ambs=state.items.filter(function(i){return i.t==='ambiente'}).map(function(i){return'— '+A(i.id).name});\n",
    "    var pecas=state.items.filter(function(i){return i.t==='peca'&&P(i.id)}).map(function(i,n){var p=P(i.id);return (n+1)+'. '+p.name+(p.publicCode?' — cód. '+p.publicCode:'')});\n"
    "    var ambs=state.items.filter(function(i){return i.t==='ambiente'&&A(i.id)}).map(function(i){return'— '+A(i.id).name});\n",
    'Meu projeto: códigos')
s = replace_once(s,
    "    if(pecas.length)t.push('','Peças:',pecas.join('\\n'));\n",
    "    if(pecas.length)t.push('',pecas.length===1?'Peça (1):':'Peças ('+pecas.length+'):',pecas.join('\\n'));\n",
    'Meu projeto: total de peças')

# traduções (EN/ES) dos textos novos
I18N_NEW_D = {
    'Árvores, guirlandas e arranjos para residências, condomínios e empresas, com montagem da nossa equipe.':
        ['Trees, wreaths and arrangements for homes, residential buildings and companies, installed by our team.',
         'Árboles, guirnaldas y arreglos para residencias, condominios y empresas, con montaje de nuestro equipo.'],
    'Conhecer a coleção': ['Discover the collection', 'Conocer la colección'],
    'Destaques da abertura': ['Opening highlights', 'Destacados de la portada'],
    'Abertura': ['Opening', 'Portada'],
    'Coleção de Natal': ['Christmas Collection', 'Colección de Navidad'],
    'Convite da Áurea': ['Invitation from Áurea', 'Invitación de Áurea'],
    'Concierge Casa Áurea': ['Casa Áurea Concierge', 'Concierge Casa Áurea'],
    'Olá, sou a': ["Hello, I'm ", 'Hola, soy '],
    'Estou aqui para guiar a sua visita: indico peças para o seu ambiente, analiso uma foto do seu espaço e mostro o melhor do nosso acervo.':
        ["I'm here to guide your visit: I suggest pieces for your space, look at a photo of your room and show you the best of our collection.",
         'Estoy aquí para guiar tu visita: te indico piezas para tu ambiente, analizo una foto de tu espacio y te muestro lo mejor de nuestro acervo.'],
    'Por onde quer começar?': ['Where would you like to start?', '¿Por dónde quieres empezar?'],
    'Encontrar a peça certa': ['Find the right piece', 'Encontrar la pieza ideal'],
    'Conte o ambiente e eu indico as opções': ['Tell me about the room and I will suggest options', 'Cuéntame el ambiente y te indico opciones'],
    'Enviar uma foto do meu espaço': ['Send a photo of my space', 'Enviar una foto de mi espacio'],
    'Eu olho o ambiente e sugiro o que combina': ['I look at the room and suggest what fits', 'Miro el ambiente y sugiero lo que combina'],
    'Conhecer a Coleção de Natal': ['Discover the Christmas Collection', 'Conocer la Colección de Navidad'],
    'Árvores, guirlandas e ambientação': ['Trees, wreaths and seasonal styling', 'Árboles, guirnaldas y ambientación'],
    'Ver todo o acervo': ['See the full collection', 'Ver todo el acervo'],
    'Peças com filtros por tipo, material e cor': ['Pieces filtered by type, material and colour', 'Piezas con filtros por tipo, material y color'],
    'Prefiro explorar sozinho': ["I'd rather explore on my own", 'Prefiero explorar por mi cuenta'],
    'Cortinas e persianas · Ateliê próprio': ['Curtains and blinds · Our own workshop', 'Cortinas y persianas · Taller propio'],
    'A luz da casa, feita sob medida.': ["Your home's light, made to measure.", 'La luz de tu casa, hecha a medida.'],
    'Há mais de 20 anos, nosso ateliê desenha e confecciona cortinas e persianas para cada janela: tecidos, forros e blackout, persianas manuais ou motorizadas, com medição e instalação pela nossa equipe.':
        ['For over 20 years, our own workshop has designed and made curtains and blinds for every window: fabrics, linings and blackout, manual or motorised blinds, measured and installed by our team.',
         'Desde hace más de 20 años, nuestro taller diseña y confecciona cortinas y persianas para cada ventana: telas, forros y blackout, persianas manuales o motorizadas, con medición e instalación de nuestro equipo.'],
    'anos no mercado': ['years in the trade', 'años en el mercado'],
    'Ateliê': ['Workshop', 'Taller'],
    'próprio': ['of our own', 'propio'],
    'Sob medida': ['Made to measure', 'A medida'],
    'medição e instalação': ['measuring and installation', 'medición e instalación'],
    'Pedir orçamento': ['Request a quote', 'Pedir presupuesto'],
    'Cortinas e persianas': ['Curtains and blinds', 'Cortinas y persianas'],
    'Ateliê próprio há mais de 20 anos: sob medida, com medição e instalação.':
        ['Our own workshop for over 20 years: made to measure, with measuring and installation.',
         'Taller propio desde hace más de 20 años: a medida, con medición e instalación.'],
    'Orçamento de cortinas e persianas': ['Quote for curtains and blinds', 'Presupuesto de cortinas y persianas'],
    'Avalie a Casa Áurea no Google': ['Review Casa Áurea on Google', 'Califica a Casa Áurea en Google'],
}
I18N_NEW_H = {
    'O Natal,': ['Christmas,', 'La Navidad,'],
    'em cada detalhe.': ['in every *detail*.', 'en cada *detalle*.'],
}
s = replace_once(s,
    '  function _k(s){return String(s)',
    '  Object.assign(I18N.D,' + json.dumps(I18N_NEW_D, ensure_ascii=False) + ');\n'
    '  Object.assign(I18N.H,' + json.dumps(I18N_NEW_H, ensure_ascii=False) + ');\n'
    '  function _k(s){return String(s)',
    'traduções da reunião')
s = s.replace('</style>', HERO_CSS + HI_CSS + CORT_CSS + REV_CSS + '</style>', 1)

# 4d. tema azul-noite sempre (pedido do Gabriel, 20/10/2026): antes o site seguia o tema do computador
#     do visitante e ficava marfim/branco em quem usa o modo claro. Agora todos veem a versão azul.
s = replace_once(s, '<html lang="pt-BR">', '<html lang="pt-BR" data-theme="dark" style="color-scheme:dark">', 'tema azul')

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
