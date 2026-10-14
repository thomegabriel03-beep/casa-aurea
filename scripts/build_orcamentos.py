#!/usr/bin/env python3
"""Gera public/admin-orc/orcamentos.js a partir do módulo de orçamentos da prévia aprovada
(reference/orcamentos/orc.js), trocando o armazenamento local pelo banco (Supabase).

O motor de cálculo e as telas são os mesmos testados na prévia (fórmula da planilha da Camila).
A página /admin/orcamentos carrega os dados do banco, expõe window.__orcStore e roda este script.
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, 'reference', 'orcamentos', 'orc.js'), encoding='utf-8').read()


def rep(s, old, new, n=1):
    c = s.count(old)
    if c != n:
        sys.exit(f'esperado {n}x, achei {c}: {old[:70]}')
    return s.replace(old, new)


# 1. sem orçamento de exemplo em produção (tecidos e modelos de exemplo continuam, marcados)
s = rep(src, "tecidos:tec,persianas:per,quotes:[q]};", "tecidos:tec,persianas:per,quotes:[]};")

# 2. armazenamento: banco (window.__orcStore) em vez do navegador
s = re.sub(r"  function orcLoad\(\)\{.*?\n", "  function orcLoad(){if(!ORC)ORC=storeLoad();return ORC}\n", s, count=1)
s = re.sub(r"  function orcSave\(\)\{.*?\n", "  function orcSave(){scheduleSave()}\n", s, count=1)

# 3. sem botão de "restaurar exemplos" (apagaria orçamentos reais)
s = rep(s, "<button type=\"button\" class=\"adm-btn ghost\" data-orc=\"reset\">Restaurar dados de exemplo</button>", "")

# 4. rotas: o módulo vive em /admin/orcamentos, com sub-rotas no #
s = s.replace("#/admin/orcamentos", "#/orcamentos").replace("#\\/admin\\/orcamentos", "#\\/orcamentos")

# 5. a página não tem .adm-main própria dentro do módulo
s = s.replace("admRoot.querySelector('.adm-main')", "admRoot")

# 6. redesenho preservando a rolagem da janela
s = re.sub(r"  function orcRerender\(\)\{.*?\n",
           "  function orcRerender(){var y=window.scrollY;renderAdmin(location.hash);window.scrollTo(0,y)}\n", s, count=1)

head = r'''/* Orçamentos Casa Áurea — gerado por scripts/build_orcamentos.py. Não editar à mão. */
(function(){
  var STORE=window.__orcStore; var admRoot=document.getElementById('orcRoot');
  if(!STORE||!admRoot)return;
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function norm(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')}
  function slugify(s){return norm(s).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
  function opt(v,l,sel){return '<option value="'+esc(v)+'"'+(String(v)===String(sel)?' selected':'')+'>'+esc(l)+'</option>'}
  function head(t,d,act){return '<header class="adm-head"><div><h1>'+t+'</h1>'+(d?'<p>'+d+'</p>':'')+'</div>'+(act?'<div class="adm-actions" style="margin-top:0">'+act+'</div>':'')+'</header>'}
  function field(l,inner,hint){return '<label class="adm-field"><span>'+l+'</span>'+inner+(hint?'<small>'+hint+'</small>':'')+'</label>'}
  function acard(t,b){return '<section class="adm-card">'+(t?'<h2>'+t+'</h2>':'')+b+'</section>'}
  function bdg(map,v){var m=map[v]||[v,''];return '<span class="adm-badge '+m[1]+'">'+m[0]+'</span>'}
  function qs(h){var o={};(String(h).split('?')[1]||'').split('&').forEach(function(kv){if(!kv)return;var a=kv.split('=');o[a[0]]=decodeURIComponent(a[1]||'')});return o}
  function fd(form){var o={};new FormData(form).forEach(function(v,k){if(o[k]!==undefined){o[k]=[].concat(o[k],v)}else o[k]=v});return o}
  var flash='';
  function renderAdmin(h){
    var path=String(h||'').split('?')[0]; if(!/^#\/orcamentos/.test(path)){path='#/orcamentos';h=path}
    admRoot.innerHTML='<p class="orc-status" data-out="status" aria-live="polite"></p>'+(flash?'<div class="adm-alert ok orc-flash" role="status">'+esc(flash)+'</div>':'')+renderOrc(path,h);
    flash=''; paintStatus();
  }
  function go(h,msg){flash=msg||'';if(location.hash===h)renderAdmin(h);else location.hash=h}

  /* ---------- banco: um documento por tecido, modelo, orçamento e um de preços ---------- */
  var saved={}, timer=null, saving=false, lastErr='';
  function key(kind,id){return kind+':'+id}
  function docsOf(o){var d={};d[key('cfg','cfg')]=o.cfg;o.tecidos.forEach(function(t){d[key('tecido',t.id)]=t});o.persianas.forEach(function(p){d[key('persiana',p.id)]=p});o.quotes.forEach(function(q){d[key('orcamento',q.id)]=q});return d}
  function storeLoad(){
    var rows=STORE.rows||[], cfg=null, tec=[], per=[], qs2=[];
    rows.forEach(function(r){if(r.kind==='cfg')cfg=r.data;else if(r.kind==='tecido')tec.push(r.data);else if(r.kind==='persiana')per.push(r.data);else if(r.kind==='orcamento')qs2.push(r.data)});
    var o;
    if(!cfg){o=orcSeed();setTimeout(scheduleSave,0)}
    else{var seed=orcSeed();o={v:1,seq:0,cfg:Object.assign({},seed.cfg,cfg),tecidos:tec.sort(function(a,b){return (a.ord||0)-(b.ord||0)||String(a.nome).localeCompare(String(b.nome))}),persianas:per.sort(function(a,b){return String(a.nome).localeCompare(String(b.nome))}),
      quotes:qs2.sort(function(a,b){return String(b.num).localeCompare(String(a.num))})};
      rows.forEach(function(r){saved[key(r.kind,r.id)]=JSON.stringify(r.data)})}
    return o;
  }
  function scheduleSave(){clearTimeout(timer);timer=setTimeout(flush,500);paintStatus('pend')}
  function flush(){
    if(!ORC)return; if(saving){scheduleSave();return}
    var cur=docsOf(ORC), up=[], del=[];
    Object.keys(cur).forEach(function(k){var j=JSON.stringify(cur[k]);if(saved[k]!==j)up.push([k,j])});
    Object.keys(saved).forEach(function(k){if(!(k in cur))del.push(k)});
    if(!up.length&&!del.length){paintStatus('ok');return}
    saving=true; paintStatus('saving');
    STORE.sync(up.map(function(x){var i=x[0].indexOf(':');return {kind:x[0].slice(0,i),id:x[0].slice(i+1),data:JSON.parse(x[1])}}),
               del.map(function(k){var i=k.indexOf(':');return {kind:k.slice(0,i),id:k.slice(i+1)}}))
      .then(function(){up.forEach(function(x){saved[x[0]]=x[1]});del.forEach(function(k){delete saved[k]});lastErr='';saving=false;paintStatus('ok')})
      .catch(function(e){lastErr=(e&&e.message)||'erro';saving=false;paintStatus('err');setTimeout(scheduleSave,4000)});
  }
  var stState='ok';
  function paintStatus(st){if(st)stState=st;var el=admRoot.querySelector('[data-out="status"]');if(!el)return;
    el.className='orc-status '+stState;el.textContent=stState==='saving'?'Salvando…':stState==='pend'?'Alterações não salvas…':stState==='err'?'Sem conexão com o banco. Tentando de novo…':'Tudo salvo'}
  window.addEventListener('beforeunload',function(e){if(stState==='pend'||stState==='saving'||stState==='err'){flush();e.preventDefault();e.returnValue=''}});
'''

tail = r'''
  window.addEventListener('hashchange',function(){renderAdmin(location.hash)});
  if(!/^#\/orcamentos/.test(location.hash))history.replaceState(null,'',location.pathname+location.search+'#/orcamentos');
  renderAdmin(location.hash);
})();
'''

out = os.path.join(ROOT, 'public', 'admin-orc')
os.makedirs(out, exist_ok=True)
open(os.path.join(out, 'orcamentos.js'), 'w', encoding='utf-8').write(head + s + tail)
print('ok', len(head + s + tail))
