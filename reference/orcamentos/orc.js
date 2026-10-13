  /* =====================================================================
     ORÇAMENTOS — cortinas e persianas (painel interno Casa Áurea)
     Cortinas: mesma fórmula da planilha da Camila (largura × altura total,
     blackout em panos de 2,80 com franzido 1,5, custos por metro de largura,
     porcentagem da loja e RT do arquiteto). Persianas: modelo × m² com área
     mínima, bandô e motor. Na prévia os dados ficam neste navegador; em
     produção, tabelas quote_* no Supabase.
     ===================================================================== */
  var ORK='ca-orc-v1', ORC=null;
  function orcSeed(){
    var tec=[
      ['t-linho-sint','Linho sintético','tecido',24.9,2.8,0],
      ['t-linho-rust','Linho rústico','tecido',32.9,2.8,1],
      ['t-voil-liso','Voil liso','tecido',18.9,2.8,1],
      ['t-voil-linhao','Voil linhão','tecido',22.5,2.8,1],
      ['t-gaze-linho','Gaze de linho','tecido',29.9,2.8,1],
      ['t-shantung','Shantung','tecido',27.9,2.8,1],
      ['t-veludo','Veludo','tecido',45,2.8,1],
      ['f-forro','Forro padrão','forro',20,2.8,0],
      ['f-forro-linho','Forro de linho','forro',26,2.8,1],
      ['b-bk','Blackout padrão','blackout',60,2.8,0],
      ['b-bk-linho','Blackout linho','blackout',72,2.8,1]
    ].map(function(r){return {id:r[0],nome:r[1],cat:r[2],preco:r[3],larg:r[4],ex:!!r[5]}});
    var per=[
      ['p-rolo-sc1','Rolô Screen 1%','Rolô',145,1.5],['p-rolo-sc3','Rolô Screen 3%','Rolô',120,1.5],['p-rolo-sc5','Rolô Screen 5%','Rolô',115,1.5],
      ['p-rolo-bk','Rolô Blackout','Rolô',135,1.5],['p-rom-sc3','Romana Screen 3%','Romana',165,1.5],['p-rom-linho','Romana Linho','Romana',190,1.5],
      ['p-dv','Double Vision','Double Vision',175,1.5],['p-cel','Celular (Honeycomb)','Celular',260,1.2],['p-mad50','Horizontal madeira 50 mm','Horizontal',320,1.2],['p-painel','Painel','Painel',150,2]
    ].map(function(r){return {id:r[0],nome:r[1],linha:r[2],preco:r[3],min:r[4],ex:true}});
    var q={id:'q1',num:'ORC-2026-001',status:'enviado',data:'2026-10-09',consultora:'Camila',
      cliente:{nome:'Cliente exemplo · Ana Ribeiro',tel:'(48) 99999-0000',end:'Rua Exemplo, 100 · Meia Praia, Itapema',email:'',arq:''},rt:0,desc:1.5,avista:null,prazo:'a combinar',obs:'',
      itens:[
        {id:'i1',tipo:'cortina',amb:'Sala',L:2.66,H:3.2,barra:0.3,qtd:1,tec:'t-linho-sint',forro:'f-forro',bk:'b-bk',conf:'prega macho',trilho:'reto',motor:'nao',comp:'forro',desc:''},
        {id:'i2',tipo:'cortina',amb:'Divisória',L:1.8,H:2.7,barra:0.3,qtd:1,tec:'t-linho-sint',forro:'f-forro',bk:'b-bk',conf:'prega macho',trilho:'reto',motor:'nao',comp:'cortina',desc:''},
        {id:'i3',tipo:'persiana',amb:'Cozinha',L:1.2,H:1.1,qtd:1,mod:'p-rolo-sc3',bando:false,motor:false,desc:''},
        {id:'i4',tipo:'cortina',amb:'Suíte 01',L:2.2,H:2.6,barra:0.3,qtd:1,tec:'t-linho-sint',forro:'f-forro',bk:'b-bk',conf:'prega macho',trilho:'reto',motor:'uma',comp:'bkcortina',desc:''}
      ]};
    return {v:1,seq:1,cfg:{mo:85,inst:35,presilha:0,sobra:0.22,barra:0.30,margem:70,rt:0,bkLarg:2.8,bkFranz:1.5,forro:'f-forro',bk:'b-bk',
        trilhos:[{id:'reto',nome:'Trilho suíço reto',preco:20},{id:'curvo',nome:'Trilho curvo / flexível',preco:32},{id:'tubo',nome:'Tubo Luiza',preco:38}],
        motKit:950,motTrilho:60,motInst:80,pMargem:70,pInst:35,pBando:45,pMotor:890,arred:10,desc:0,pix:'',prazo:'a combinar',validade:15,cidade:'Tijucas',parcelas:10},
      tecidos:tec,persianas:per,quotes:[q]};
  }
  function orcLoad(){if(ORC)return ORC;try{var r=localStorage.getItem(ORK);if(r){var o=JSON.parse(r);if(o&&o.v===1)ORC=o}}catch(e){}if(!ORC)ORC=orcSeed();return ORC}
  function orcSave(){try{localStorage.setItem(ORK,JSON.stringify(ORC))}catch(e){}}
  function num(v){if(v===''||v==null)return 0;var n=Number(String(v).replace(/\./g,function(m,i,s){return /,/.test(s)?'':m}).replace(',','.'));return isFinite(n)?n:0}
  function br(v,d){return Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:d==null?2:d,maximumFractionDigits:d==null?2:d})}
  function rs(v){return 'R$ '+br(v)}
  function tecBy(id){return orcLoad().tecidos.filter(function(t){return t.id===id})[0]}
  function perBy(id){return orcLoad().persianas.filter(function(t){return t.id===id})[0]}
  function trBy(id){var c=orcLoad().cfg;return c.trilhos.filter(function(t){return t.id===id})[0]||c.trilhos[0]}
  function qBy(id){return orcLoad().quotes.filter(function(q){return q.id===id})[0]}
  function roundUp(v,s){s=Number(s)||0;return s>0?Math.ceil(v/s-1e-9)*s:Math.round(v*100)/100}
  var COMP={cortina:['Só cortina',['c']],forro:['Cortina com forro',['c','f']],blackout:['Só blackout',['b']],bkcortina:['Blackout + cortina',['c','b']]};
  var CONF=['prega macho','prega americana','prega wave','franzida','ilhós'];
  var OST={rascunho:['Rascunho',''],enviado:['Enviado','warn'],aprovado:['Aprovado','ok'],perdido:['Não fechou','bad']};

  /* cálculo de uma cortina: devolve as 4 composições (custo e venda) */
  function calcCortina(it,q){
    var c=orcLoad().cfg, L=num(it.L), H=num(it.H), barra=it.barra===''||it.barra==null?c.barra:num(it.barra), qtd=Math.max(1,num(it.qtd)||1);
    var Ht=H+barra+num(c.sobra), tr=trBy(it.trilho), F=num(c.mo)+num(c.inst)+num(c.presilha)+num(tr.preco);
    var tc=tecBy(it.tec), fo=tecBy(it.forro||c.forro), bk=tecBy(it.bk||c.bk);
    var bkL=bk&&num(bk.larg)?num(bk.larg):num(c.bkLarg)||2.8, panos=L>0?Math.ceil(L*num(c.bkFranz||1.5)/bkL-1e-9):0;
    var qn={c:L*Ht,f:L*Ht,b:panos*Ht}, pr={c:tc?num(tc.preco):0,f:fo?num(fo.preco):0,b:bk?num(bk.preco):0};
    var lay={};['c','f','b'].forEach(function(k){lay[k]=pr[k]*qn[k]+F*L});
    var motUnit=num(c.motKit)+num(c.motInst)+Math.max(0,num(c.motTrilho)-num(tr.preco))*L;
    var mult=(1+num(c.margem)/100)*(1+num(q&&q.rt!=null?q.rt:c.rt)/100), out={};
    Object.keys(COMP).forEach(function(k){var ls=COMP[k][1],cost=ls.reduce(function(s,x){return s+lay[x]},0);
      var nm=it.motor==='duas'?Math.min(2,ls.length):it.motor==='uma'?1:0; cost+=nm*motUnit;
      var venda=cost*mult; out[k]={custo:cost*qtd,bruto:venda*qtd,venda:roundUp(venda*qtd,c.arred)}});
    return {o:out,Ht:Ht,qn:qn,panos:panos,F:F,tc:tc,fo:fo,bk:bk,tr:tr,qtd:qtd,ok:!!(L>0&&H>0&&tc),motUnit:motUnit};
  }
  function calcPersiana(it,q){
    var c=orcLoad().cfg, m=perBy(it.mod), L=num(it.L), H=num(it.H), qtd=Math.max(1,num(it.qtd)||1);
    var area=m?Math.max(L*H,num(m.min)):L*H, cost=(m?area*num(m.preco):0)+(it.bando?num(c.pBando)*L:0)+(it.motor?num(c.pMotor):0)+num(c.pInst);
    var mult=(1+num(c.pMargem)/100)*(1+num(q&&q.rt!=null?q.rt:c.rt)/100);
    return {m:m,area:area,real:L*H,qtd:qtd,custo:cost*qtd,venda:roundUp(cost*mult*qtd,c.arred),ok:!!(m&&L>0&&H>0)};
  }
  function itemVal(it,q){if(it.tipo==='persiana'){var p=calcPersiana(it,q);return {venda:p.ok?p.venda:0,custo:p.ok?p.custo:0,ok:p.ok}}
    var r=calcCortina(it,q),o=r.o[it.comp||'cortina'];return {venda:r.ok?o.venda:0,custo:r.ok?o.custo:0,ok:r.ok}}
  function autoDesc(it,q){
    var c=orcLoad().cfg;
    if(it.tipo==='persiana'){var m=perBy(it.mod);return 'Persiana '+(m?m.nome:'(escolha o modelo)')+(it.bando?' com bandô':' sem bandô')+(it.motor?', motorizada':'')}
    var t=tecBy(it.tec),bk=tecBy(it.bk||c.bk),tr=trBy(it.trilho),ls=COMP[it.comp||'cortina'][1],two=ls.length>1;
    var barra=it.barra===''||it.barra==null?c.barra:num(it.barra);
    var trl=tr.id==='reto'?(two?'trilho duplo':'trilho simples'):(tr.nome.replace(/^Trilho /i,'trilho ')+(two?' duplo':''));
    if(tr.id!=='reto'&&!/^trilho/i.test(trl))trl=trl;
    var base=it.comp==='blackout'?'Cortina blackout'+(bk?' ('+bk.nome.toLowerCase()+')':''):'Cortina em '+(t?t.nome:'(escolha o tecido)');
    var extra=it.comp==='forro'?' com forro costurado separado':it.comp==='bkcortina'?' com blackout separado':'';
    var mot=it.motor==='duas'?', motorizada nas duas camadas':it.motor==='uma'?', motorizada':'';
    return base+extra+' na '+(it.conf||'prega macho')+' e no '+trl+' com barra de '+br(barra)+mot;
  }
  function descOf(it,q){return it.desc&&it.desc.trim()?it.desc:autoDesc(it,q)}
  function qTot(q){var t=0,c=0,ok=true;q.itens.forEach(function(it){var v=itemVal(it,q);t+=v.venda;c+=v.custo;if(!v.ok)ok=false});
    var cfg=orcLoad().cfg,desc=q.desc!=null&&q.desc!==''?num(q.desc):num(cfg.desc);
    var av=q.avista!=null&&q.avista!==''?num(q.avista):Math.floor(t*(1-desc/100)/10)*10;
    return {total:t,custo:c,lucro:t-c,avista:av,desc:desc,ok:ok}}
  function dataExt(iso){var m=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'],d=String(iso||'').split('-');if(d.length<3)return '';return Number(d[2])+' de '+m[Number(d[1])-1]+' de '+d[0]}
  function today(){var d=new Date(),p=function(n){return(n<10?'0':'')+n};return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())}
  function newItem(tipo){var c=orcLoad().cfg,id='i'+Date.now().toString(36)+Math.floor(Math.random()*99);
    return tipo==='persiana'?{id:id,tipo:'persiana',amb:'',L:'',H:'',qtd:1,mod:'',bando:false,motor:false,desc:''}:
      {id:id,tipo:'cortina',amb:'',L:'',H:'',barra:c.barra,qtd:1,tec:'',forro:c.forro,bk:c.bk,conf:'prega macho',trilho:c.trilhos[0].id,motor:'nao',comp:'cortina',desc:''}}
  function newQuote(){var o=orcLoad();o.seq=(o.seq||0)+1;var n=o.quotes.reduce(function(m,q){return Math.max(m,Number(String(q.num).split('-')[2])||0)},0)+1;
    var q={id:'q'+Date.now().toString(36),num:'ORC-'+new Date().getFullYear()+'-'+('00'+n).slice(-3),status:'rascunho',data:today(),consultora:'Camila',
      cliente:{nome:'',tel:'',end:'',email:'',arq:''},rt:o.cfg.rt,desc:o.cfg.desc,avista:null,prazo:o.cfg.prazo,obs:'',itens:[newItem('cortina')]};
    o.quotes.unshift(q);orcSave();return q}

  /* ---------- telas ---------- */
  function orcTabs(path){return '<nav class="adm-tabs" aria-label="Orçamentos">'+[['#/admin/orcamentos','Orçamentos'],['#/admin/orcamentos/tecidos','Tecidos'],['#/admin/orcamentos/persianas','Persianas'],['#/admin/orcamentos/precos','Preços e regras']].map(function(t){var a=t[0]==='#/admin/orcamentos'?(path===t[0]||/^#\/admin\/orcamentos\/q/.test(path)):path.indexOf(t[0])===0;return '<a href="'+t[0]+'"'+(a?' aria-current="page"':'')+'>'+t[1]+'</a>'}).join('')+'</nav>'}
  function vOrcList(h){
    var o=orcLoad(),f=qs(h),st=f.st||'',qq=norm(f.q||''),list=o.quotes.filter(function(q){return(!st||q.status===st)&&(!qq||norm(q.num+' '+q.cliente.nome+' '+q.itens.map(function(i){return i.amb}).join(' ')).indexOf(qq)>-1)});
    var mes=today().slice(0,7),doMes=o.quotes.filter(function(q){return String(q.data).slice(0,7)===mes}),
      tot=function(a){return a.reduce(function(s,q){return s+qTot(q).total},0)},apr=o.quotes.filter(function(q){return q.status==='aprovado'});
    var conv=o.quotes.filter(function(q){return q.status==='aprovado'||q.status==='perdido'}).length;
    return head('Orçamentos','Cortinas e persianas calculadas na hora: escolha o tecido, informe as medidas e o sistema monta os valores.','<a class="adm-btn" href="#/admin/orcamentos/novo">Novo orçamento</a>')+orcTabs('#/admin/orcamentos')+
      '<div class="adm-grid c4 orc-kpis">'+[['Orçamentos no mês',doMes.length,''],['Valor orçado no mês',rs(tot(doMes)),''],['Aprovados',apr.length,rs(tot(apr))],['Taxa de fechamento',conv?Math.round(apr.length/conv*100)+'%':'—','aprovados ÷ decididos']].map(function(s){return '<div class="adm-card"><p class="adm-note">'+s[0]+'</p><p class="adm-stat">'+s[1]+'</p>'+(s[2]?'<p class="adm-note" style="margin-top:.35rem">'+s[2]+'</p>':'')+'</div>'}).join('')+'</div>'+
      '<form class="orc-filter" data-form="orcfilter" role="search"><input type="search" name="q" value="'+esc(f.q||'')+'" placeholder="Cliente, número ou ambiente" aria-label="Buscar orçamento"><select name="st" aria-label="Status"><option value="">Todos os status</option>'+Object.keys(OST).map(function(k){return opt(k,OST[k][0],st)}).join('')+'</select><button class="adm-btn ghost">Filtrar</button></form>'+
      (list.length?'<div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Número</th><th>Cliente</th><th>Data</th><th>Itens</th><th>Total</th><th>À vista</th><th>Status</th><th></th></tr></thead><tbody>'+
        list.map(function(q){var t=qTot(q);return '<tr><td class="adm-code"><a href="#/admin/orcamentos/'+q.id+'">'+esc(q.num)+'</a></td><td>'+esc(q.cliente.nome||'Sem nome')+'</td><td>'+esc(String(q.data).split('-').reverse().join('/'))+'</td><td>'+q.itens.length+'</td><td>'+rs(t.total)+'</td><td>'+rs(t.avista)+'</td><td>'+bdg(OST,q.status)+'</td><td style="white-space:nowrap"><a class="adm-btn ghost sm" href="#/admin/orcamentos/'+q.id+'">Abrir</a> <a class="adm-btn ghost sm" href="#/admin/orcamentos/'+q.id+'/documento">Documento</a></td></tr>'}).join('')+'</tbody></table></div>':
        '<div class="adm-card adm-empty">Nenhum orçamento'+(st||qq?' com esse filtro':' ainda')+'. <a href="#/admin/orcamentos/novo">Criar o primeiro</a></div>');
  }
  function numIn(name,val,attrs){return '<input type="text" inputmode="decimal" '+name+' value="'+(val===''||val==null?'':esc(br(val,String(val).split('.')[1]&&String(val).split('.')[1].length>2?3:2)).replace(/,00$/,'').replace(/(,\d)0$/,'$1'))+'"'+(attrs||'')+'>'}
  function vItem(it,q,i){
    var c=orcLoad().cfg, idx=' data-it="'+it.id+'"';
    var top='<div class="orc-it-top"><span class="orc-it-n">'+(i+1)+'</span><div class="adm-seg" role="group" aria-label="Tipo do item"><button type="button" data-orc="tipo" data-it="'+it.id+'" data-v="cortina" aria-pressed="'+(it.tipo==='cortina')+'">Cortina</button><button type="button" data-orc="tipo" data-it="'+it.id+'" data-v="persiana" aria-pressed="'+(it.tipo==='persiana')+'">Persiana</button></div>'+
      '<span class="orc-it-val" data-out="val'+it.id+'"></span><button type="button" class="adm-btn ghost sm" data-orc="dupit" data-it="'+it.id+'">Duplicar</button><button type="button" class="adm-btn danger sm" data-orc="delit" data-it="'+it.id+'" aria-label="Remover item '+(i+1)+'">Remover</button></div>';
    var amb=field('Ambiente','<input type="text" list="orcAmb" data-f="amb"'+idx+' value="'+esc(it.amb||'')+'" placeholder="Sala, Suíte 01…">');
    var body;
    if(it.tipo==='persiana'){
      body='<div class="orc-row r5">'+amb+field('Modelo','<select data-f="mod"'+idx+'><option value="">Escolha…</option>'+orcLoad().persianas.map(function(m){return opt(m.id,m.nome,it.mod)}).join('')+'</select>')+
        field('Largura (m)',numIn('data-f="L"'+idx,it.L,' placeholder="0,00"'))+field('Altura (m)',numIn('data-f="H"'+idx,it.H,' placeholder="0,00"'))+field('Qtd.',numIn('data-f="qtd"'+idx,it.qtd))+'</div>'+
        '<div class="adm-checks orc-opts"><label class="adm-check"><input type="checkbox" data-f="bando"'+idx+(it.bando?' checked':'')+'> Com bandô <small class="adm-note">(cobre o rolo)</small></label><label class="adm-check"><input type="checkbox" data-f="motor"'+idx+(it.motor?' checked':'')+'> Motorizada</label></div>'+
        '<div class="orc-res" data-out="res'+it.id+'"></div>';
    }else{
      body='<div class="orc-row r5">'+amb+field('Largura (m)',numIn('data-f="L"'+idx,it.L,' placeholder="0,00"'))+field('Altura (m)',numIn('data-f="H"'+idx,it.H,' placeholder="0,00"'))+field('Barra (m)',numIn('data-f="barra"'+idx,it.barra))+field('Qtd.',numIn('data-f="qtd"'+idx,it.qtd),'janelas iguais')+'</div>'+
        '<div class="orc-row r4">'+field('Tecido','<input type="text" list="orcTec" data-f="tecname"'+idx+' value="'+esc((tecBy(it.tec)||{}).nome||'')+'" placeholder="Digite o nome do tecido" autocomplete="off">')+
        field('Confecção','<select data-f="conf"'+idx+'>'+CONF.map(function(x){return opt(x,x.charAt(0).toUpperCase()+x.slice(1),it.conf)}).join('')+'</select>')+
        field('Trilho','<select data-f="trilho"'+idx+'>'+c.trilhos.map(function(t){return opt(t.id,t.nome,it.trilho)}).join('')+'</select>')+
        field('Motorização','<select data-f="motor"'+idx+'>'+[['nao','Sem motor'],['uma','Motor em uma camada'],['duas','Motor nas duas camadas']].map(function(x){return opt(x[0],x[1],it.motor)}).join('')+'</select>')+'</div>'+
        '<details class="orc-more"><summary>Forro e blackout deste item</summary><div class="orc-row r2">'+field('Forro','<select data-f="forro"'+idx+'>'+orcLoad().tecidos.filter(function(t){return t.cat==='forro'}).map(function(t){return opt(t.id,t.nome+' · '+rs(t.preco)+'/m',it.forro||c.forro)}).join('')+'</select>')+
        field('Blackout','<select data-f="bk"'+idx+'>'+orcLoad().tecidos.filter(function(t){return t.cat==='blackout'}).map(function(t){return opt(t.id,t.nome+' · '+rs(t.preco)+'/m',it.bk||c.bk)}).join('')+'</select>')+'</div></details>'+
        '<fieldset class="orc-comp"><legend>Composição que vai no orçamento</legend><div class="orc-tiles" data-out="res'+it.id+'"></div></fieldset>';
    }
    var auto=!(it.desc&&it.desc.trim());
    body+='<label class="adm-field orc-desc"><span>Descrição no orçamento <em class="adm-badge'+(auto?' ok':'')+'" data-out="dbadge'+it.id+'">'+(auto?'automática':'editada')+'</em>'+(auto?'':' <button type="button" class="orc-link" data-orc="autodesc" data-it="'+it.id+'">voltar à automática</button>')+'</span><textarea rows="2" data-f="desc"'+idx+'>'+esc(descOf(it,q))+'</textarea></label>';
    return '<article class="adm-card orc-item" id="it-'+it.id+'">'+top+body+'</article>';
  }
  function resCortina(it,q){
    var r=calcCortina(it,q);
    if(!r.ok)return '<p class="adm-note orc-wait">'+(!r.tc&&it.tecname?'Tecido “'+esc(it.tecname)+'” não está cadastrado. <a href="#/admin/orcamentos/tecidos">Cadastrar</a>':'Informe largura, altura e tecido para ver os valores.')+'</p>';
    return Object.keys(COMP).map(function(k){var o=r.o[k],on=(it.comp||'cortina')===k;
      return '<label class="orc-tile'+(on?' on':'')+'"><input type="radio" name="comp-'+it.id+'" value="'+k+'" data-f="comp" data-it="'+it.id+'"'+(on?' checked':'')+'><span class="t">'+COMP[k][0]+'</span><strong>'+rs(o.venda)+'</strong><small>custo '+rs(o.custo)+' · lucro '+rs(o.venda-o.custo)+'</small></label>'}).join('')+
      '<details class="orc-calc"><summary>Ver cálculo</summary><ul>'+
      '<li>Altura total: '+br(num(it.H))+' + barra '+br(it.barra===''||it.barra==null?orcLoad().cfg.barra:num(it.barra))+' + entretela e sobra '+br(orcLoad().cfg.sobra)+' = <b>'+br(r.Ht)+' m</b></li>'+
      '<li>Tecido ('+esc(r.tc.nome)+', '+rs(r.tc.preco)+'/m): '+br(num(it.L))+' × '+br(r.Ht)+' = <b>'+br(r.qn.c)+' m</b></li>'+
      '<li>Forro ('+esc(r.fo?r.fo.nome:'—')+'): <b>'+br(r.qn.f)+' m</b> · Blackout ('+esc(r.bk?r.bk.nome:'—')+'): '+r.panos+' pano(s) de '+br(r.bk&&r.bk.larg||orcLoad().cfg.bkLarg)+' m × '+br(r.Ht)+' = <b>'+br(r.qn.b)+' m</b></li>'+
      '<li>Por metro de largura e camada: mão de obra + instalação + presilhas + '+esc(r.tr.nome.toLowerCase())+' = <b>'+rs(r.F)+'</b></li>'+
      (it.motor!=='nao'?'<li>Motor por camada: kit + instalação + diferença do trilho motorizado = <b>'+rs(r.motUnit)+'</b></li>':'')+
      '<li>Venda = custo × (1 + '+br(orcLoad().cfg.margem,0)+'%) × (1 + RT '+br(num(q.rt),0)+'%)'+(r.qtd>1?' × '+r.qtd+' janelas':'')+', arredondado para cima a cada '+rs(orcLoad().cfg.arred)+'</li></ul></details>';
  }
  function resPersiana(it,q){var p=calcPersiana(it,q);
    if(!p.ok)return '<p class="adm-note orc-wait">Escolha o modelo e informe largura e altura.</p>';
    return '<div class="orc-pres"><div><p class="adm-note">Valor de venda</p><p class="orc-big">'+rs(p.venda)+'</p></div><p class="adm-note">Área '+br(p.real)+' m²'+(p.area>p.real?' → mínimo do modelo '+br(p.area)+' m²':'')+' × '+rs(p.m.preco)+'/m² · custo '+rs(p.custo)+' · lucro '+rs(p.venda-p.custo)+'</p></div>'}
  function vSummary(q){var t=qTot(q);
    return '<div class="orc-sum-list">'+q.itens.map(function(it,i){var v=itemVal(it,q);return '<a href="#it-'+it.id+'" data-orc="jump" data-it="'+it.id+'"><span>'+(i+1)+'. '+esc(it.amb||(it.tipo==='persiana'?'Persiana':'Cortina'))+'</span><b>'+(v.ok?rs(v.venda):'—')+'</b></a>'}).join('')+'</div>'+
      '<div class="orc-sum-tot"><span>Total</span><strong>'+rs(t.total)+'</strong></div>'+
      '<div class="orc-row r2">'+field('Desconto à vista (%)',numIn('data-q="desc"',q.desc==null?'':q.desc))+field('Valor à vista',numIn('data-q="avista"',q.avista,' placeholder="'+esc(br(t.avista))+'"'),'em branco = automático')+'</div>'+
      '<div class="orc-sum-av"><span>À vista</span><strong>'+rs(t.avista)+'</strong></div>'+
      '<p class="adm-note orc-int">Interno · custo '+rs(t.custo)+' · lucro '+rs(t.lucro)+(t.total?' ('+Math.round(t.lucro/t.total*100)+'%)':'')+'</p>';
  }
  function vOrcEdit(id){
    var q=qBy(id);if(!q)return head('Orçamento não encontrado','')+'<a class="adm-btn" href="#/admin/orcamentos">Voltar</a>';
    var o=orcLoad(),cl=q.cliente;
    var amb=['Sala','Sala de jantar','Sacada','Varanda','Divisória','Cozinha','Lavanderia','Escritório','Home office','Suíte 01','Suíte 02','Suíte 03','Quarto','Banheiro','Hall'];
    return head(esc(q.num),'Orçamento de cortinas e persianas · '+bdg(OST,q.status),'<a class="adm-btn ghost" href="#/admin/orcamentos">Todos</a><a class="adm-btn" href="#/admin/orcamentos/'+q.id+'/documento">Ver orçamento do cliente</a>')+orcTabs('#/admin/orcamentos/q')+
      '<datalist id="orcAmb">'+amb.map(function(a){return '<option value="'+a+'">'}).join('')+'</datalist><datalist id="orcTec">'+o.tecidos.filter(function(t){return t.cat==='tecido'}).map(function(t){return '<option value="'+esc(t.nome)+'">'+rs(t.preco)+'/m</option>'}).join('')+'</datalist>'+
      '<div class="orc-ed" data-q-id="'+q.id+'"><div class="orc-main">'+
      acard('Cliente','<div class="orc-row r3">'+field('Nome','<input type="text" data-c="nome" value="'+esc(cl.nome)+'" placeholder="Nome do cliente">')+field('Telefone / WhatsApp','<input type="text" inputmode="tel" data-c="tel" value="'+esc(cl.tel)+'" placeholder="(48) 9…">')+field('Consultora','<select data-q="consultora">'+['Camila','Rafa'].map(function(x){return opt(x,x,q.consultora)}).join('')+'</select>')+'</div>'+
        '<div class="orc-row r3">'+field('Endereço da obra','<input type="text" data-c="end" value="'+esc(cl.end)+'">')+field('Arquiteto(a) / indicação','<input type="text" data-c="arq" value="'+esc(cl.arq)+'" placeholder="Opcional">')+field('RT do arquiteto (%)',numIn('data-q="rt"',q.rt),'entra no preço de venda')+'</div>'+
        '<div class="orc-row r3">'+field('Data','<input type="date" data-q="data" value="'+esc(q.data)+'">')+field('Prazo de entrega','<input type="text" data-q="prazo" value="'+esc(q.prazo||'')+'">')+field('Status','<select data-q="status">'+Object.keys(OST).map(function(k){return opt(k,OST[k][0],q.status)}).join('')+'</select>')+'</div>')+
      '<div class="orc-items">'+q.itens.map(function(it,i){return vItem(it,q,i)}).join('')+'</div>'+
      '<div class="orc-add"><button type="button" class="adm-btn" data-orc="add" data-v="cortina">+ Cortina</button><button type="button" class="adm-btn ghost" data-orc="add" data-v="persiana">+ Persiana</button></div>'+
      acard('Observações no orçamento','<textarea data-q="obs" rows="3" placeholder="Ex.: medidas conferidas na visita técnica; instalação inclusa.">'+esc(q.obs||'')+'</textarea>')+
      '</div><aside class="orc-side"><section class="adm-card orc-sum"><h2>Resumo</h2><div data-out="sum">'+vSummary(q)+'</div>'+
      '<div class="orc-side-act"><a class="adm-btn" href="#/admin/orcamentos/'+q.id+'/documento">Ver orçamento do cliente</a><button type="button" class="adm-btn ghost" data-orc="wa">Enviar resumo no WhatsApp</button><button type="button" class="adm-btn ghost" data-orc="dupq">Duplicar orçamento</button><button type="button" class="adm-btn danger" data-orc="delq">Excluir</button></div></section></aside></div>'+
      '<dialog id="orcWa" class="orc-dlg"><div class="adm-card"><h2>Enviar no WhatsApp</h2><p class="adm-note">Se o WhatsApp não abriu sozinho, use o link ou copie a mensagem.</p><textarea id="orcWaTxt" rows="9" readonly></textarea><div class="adm-actions"><a class="adm-btn" id="orcWaGo" target="_blank" rel="noopener">Abrir WhatsApp</a><button type="button" class="adm-btn ghost" data-orc="wacopy">Copiar mensagem</button><button type="button" class="adm-btn ghost" data-orc="waclose">Fechar</button></div></div></dialog>';
  }
  function vOrcDoc(id){
    var q=qBy(id);if(!q)return head('Orçamento não encontrado','');
    var c=orcLoad().cfg,t=qTot(q),cl=q.cliente;
    return '<div class="orc-toolbar"><a class="adm-btn ghost" href="#/admin/orcamentos/'+q.id+'">← Voltar e editar</a><button type="button" class="adm-btn" data-orc="print">Imprimir ou salvar PDF</button><button type="button" class="adm-btn ghost" data-orc="wa" data-qid="'+q.id+'">Enviar no WhatsApp</button>'+(t.ok?'':'<span class="adm-badge warn">Há itens incompletos</span>')+'</div>'+
      '<article class="orc-doc" aria-label="Orçamento '+esc(q.num)+'"><div class="orc-doc-h"><div class="orc-doc-logo"><svg aria-hidden="true"><use href="#mark"/></svg><span>CASA ÁUREA</span></div><p class="adm-code">'+esc(q.num)+'</p></div>'+
      '<div class="orc-doc-cli"><p><b>Cliente:</b> '+esc(cl.nome||'—')+'</p>'+(cl.tel?'<p><b>Telefone:</b> '+esc(cl.tel)+'</p>':'')+(cl.end?'<p><b>Endereço:</b> '+esc(cl.end)+'</p>':'')+(cl.arq?'<p><b>Arquitetura:</b> '+esc(cl.arq)+'</p>':'')+'<p><b>Consultora:</b> '+esc(q.consultora||'')+'</p><p class="orc-doc-date">'+esc(c.cidade)+', '+dataExt(q.data)+'</p></div>'+
      '<h1>Orçamento descritivo</h1><table class="orc-doc-t"><thead><tr><th>Ambiente</th><th>Modelo</th><th>Qtd.</th><th>Valor</th></tr></thead><tbody>'+
      q.itens.map(function(it){var v=itemVal(it,q);return '<tr><td>'+esc(it.amb||'—')+'</td><td>'+esc(descOf(it,q))+'</td><td>'+(num(it.qtd)>1?num(it.qtd):'—')+'</td><td>'+(v.ok?br(v.venda):'a definir')+'</td></tr>'}).join('')+
      '</tbody><tfoot><tr><td colspan="3">Total</td><td>'+rs(t.total)+'</td></tr></tfoot></table>'+
      (q.obs?'<p class="orc-doc-obs">'+esc(q.obs)+'</p>':'')+'<p class="orc-doc-p">Prazo de entrega: '+esc(q.prazo||c.prazo)+'.</p>'+
      '<div class="orc-doc-pay"><p><b>Informações de pagamento:</b> à vista '+rs(t.avista)+(c.parcelas>1?' · ou '+rs(t.total)+' em até '+c.parcelas+'x':'')+'</p>'+(c.pix?'<p><b>PIX:</b> '+esc(c.pix)+'</p>':'')+'<p class="adm-note">Proposta válida por '+c.validade+' dias. Medidas finais conferidas na visita técnica.</p></div>'+
      '<div class="orc-doc-f"><div class="orc-doc-logo sm"><svg aria-hidden="true"><use href="#mark"/></svg><span>CASA ÁUREA</span></div><p>@a.casaaurea · Av. Valério Gomes, 42, Sala 01 · Centro, Tijucas, SC</p></div></article>';
  }
  function vOrcTec(){
    var o=orcLoad(),cats={tecido:'Tecido',forro:'Forro',blackout:'Blackout'};
    return head('Tecidos','Cadastre uma vez e, no orçamento, é só digitar o nome. Preço de custo por metro.','<a class="adm-btn" href="#/admin/orcamentos/novo">Novo orçamento</a>')+orcTabs('#/admin/orcamentos/tecidos')+
      (o.tecidos.some(function(t){return t.ex})?'<div class="adm-alert" style="margin-bottom:1rem">Os preços marcados como <b>exemplo</b> são provisórios. Quando a tabela de preços dos fornecedores chegar, a Vetra importa todos os tecidos de uma vez (ou use “Importar planilha” abaixo).</div>':'')+
      acard('Adicionar tecido','<form class="orc-row r5 orc-addform" data-form="orctec">'+field('Nome','<input type="text" name="nome" required placeholder="Ex.: Linho Toscana">')+field('Tipo','<select name="cat">'+Object.keys(cats).map(function(k){return opt(k,cats[k],'tecido')}).join('')+'</select>')+field('Preço por metro (R$)','<input type="text" inputmode="decimal" name="preco" required placeholder="0,00">')+field('Largura do rolo (m)','<input type="text" inputmode="decimal" name="larg" value="2,80">')+'<div class="adm-field"><span>&nbsp;</span><button class="adm-btn">Adicionar</button></div></form>'+
        '<p class="adm-note" style="margin-top:.75rem">Importar planilha (CSV com colunas <span class="adm-code">nome; tipo; preco; largura</span>): <input type="file" accept=".csv,text/csv" data-orc-file="tec" aria-label="Importar planilha de tecidos"></p>')+
      '<div class="adm-table-wrap" style="margin-top:1rem"><table class="adm-table orc-tt"><thead><tr><th>Nome</th><th>Tipo</th><th>Preço/m</th><th>Largura do rolo</th><th></th></tr></thead><tbody>'+
      o.tecidos.map(function(t){return '<tr><td><input type="text" data-tf="nome" data-tid="'+t.id+'" value="'+esc(t.nome)+'" aria-label="Nome">'+(t.ex?' <span class="adm-badge">exemplo</span>':'')+'</td><td><select data-tf="cat" data-tid="'+t.id+'" aria-label="Tipo">'+Object.keys(cats).map(function(k){return opt(k,cats[k],t.cat)}).join('')+'</select></td><td>'+numIn('data-tf="preco" data-tid="'+t.id+'" aria-label="Preço por metro"',t.preco)+'</td><td>'+numIn('data-tf="larg" data-tid="'+t.id+'" aria-label="Largura do rolo"',t.larg)+'</td><td><button type="button" class="adm-btn danger sm" data-orc="deltec" data-tid="'+t.id+'">Excluir</button></td></tr>'}).join('')+'</tbody></table></div>';
  }
  function vOrcPer(){
    var o=orcLoad(),c=o.cfg;
    return head('Persianas','Modelos com preço de custo por m² e área mínima cobrada.','<a class="adm-btn" href="#/admin/orcamentos/novo">Novo orçamento</a>')+orcTabs('#/admin/orcamentos/persianas')+
      '<div class="adm-alert" style="margin-bottom:1rem">Os valores abaixo são de exemplo. A tabela de preço do fornecedor vem separada por modelo; quando chegar, ela entra aqui inteira.</div>'+
      acard('Adicionais de persiana','<form class="orc-row r4" data-form="orcpcfg">'+field('Bandô (R$ por metro)','<input type="text" inputmode="decimal" name="pBando" value="'+br(c.pBando)+'">','tampa o rolo')+field('Motor (R$ por unidade)','<input type="text" inputmode="decimal" name="pMotor" value="'+br(c.pMotor)+'">')+field('Instalação (R$ por unidade)','<input type="text" inputmode="decimal" name="pInst" value="'+br(c.pInst)+'">')+field('Porcentagem da loja (%)','<input type="text" inputmode="decimal" name="pMargem" value="'+br(c.pMargem,0)+'">')+'<div class="adm-actions" style="grid-column:1/-1;margin-top:0"><button class="adm-btn">Salvar adicionais</button></div></form>')+
      acard('Adicionar modelo','<form class="orc-row r5 orc-addform" data-form="orcper">'+field('Modelo','<input type="text" name="nome" required placeholder="Ex.: Rolô Screen 3%">')+field('Linha','<input type="text" name="linha" placeholder="Rolô, Romana…">')+field('Preço por m² (R$)','<input type="text" inputmode="decimal" name="preco" required placeholder="0,00">')+field('Área mínima (m²)','<input type="text" inputmode="decimal" name="min" value="1,50">')+'<div class="adm-field"><span>&nbsp;</span><button class="adm-btn">Adicionar</button></div></form>'+
        '<p class="adm-note" style="margin-top:.75rem">Importar planilha (CSV com colunas <span class="adm-code">modelo; linha; preco_m2; area_minima</span>): <input type="file" accept=".csv,text/csv" data-orc-file="per" aria-label="Importar planilha de persianas"></p>')+
      '<div class="adm-table-wrap" style="margin-top:1rem"><table class="adm-table orc-tt"><thead><tr><th>Modelo</th><th>Linha</th><th>Preço/m²</th><th>Área mínima</th><th></th></tr></thead><tbody>'+
      o.persianas.map(function(m){return '<tr><td><input type="text" data-pf="nome" data-pid="'+m.id+'" value="'+esc(m.nome)+'" aria-label="Modelo"></td><td><input type="text" data-pf="linha" data-pid="'+m.id+'" value="'+esc(m.linha||'')+'" aria-label="Linha"></td><td>'+numIn('data-pf="preco" data-pid="'+m.id+'" aria-label="Preço por metro quadrado"',m.preco)+'</td><td>'+numIn('data-pf="min" data-pid="'+m.id+'" aria-label="Área mínima"',m.min)+'</td><td><button type="button" class="adm-btn danger sm" data-orc="delper" data-pid="'+m.id+'">Excluir</button></td></tr>'}).join('')+'</tbody></table></div>';
  }
  function vOrcPrecos(){
    var o=orcLoad(),c=o.cfg,f=function(n,l,h,d){return field(l,'<input type="text" inputmode="decimal" name="'+n+'" value="'+br(c[n],d)+'">',h)};
    var sel=function(n,cat){return '<select name="'+n+'">'+o.tecidos.filter(function(t){return t.cat===cat}).map(function(t){return opt(t.id,t.nome+' · '+rs(t.preco)+'/m',c[n])}).join('')+'</select>'};
    return head('Preços e regras','Os valores que a planilha usava. Mudou aqui, todo orçamento novo já sai com o valor certo.')+orcTabs('#/admin/orcamentos/precos')+
      '<form data-form="orccfg">'+
      acard('Cortina · custos por metro de largura (por camada)','<div class="orc-row r4">'+f('mo','Mão de obra (R$/m)')+f('inst','Instalação (R$/m)')+f('presilha','Presilhas (R$/m)','informe o valor')+f('sobra','Entretela e sobra (m)','soma na altura')+'</div>')+
      acard('Trilhos (R$/m)','<div class="orc-row r4">'+c.trilhos.map(function(t,i){return '<div class="adm-field"><input type="text" name="trn'+i+'" value="'+esc(t.nome)+'" aria-label="Nome do trilho '+(i+1)+'" class="orc-inlabel"><input type="text" inputmode="decimal" name="trp'+i+'" value="'+br(t.preco)+'" aria-label="Preço por metro do '+esc(t.nome)+'"></div>'}).join('')+field('Novo trilho','<input type="text" name="trnNovo" placeholder="Nome · deixe vazio se não houver">')+'</div><p class="adm-note" style="margin-top:.5rem">Trilho duplo = duas camadas: o sistema já conta o trilho de cada camada.</p>')+
      acard('Forro, blackout e motor','<div class="orc-row r4">'+field('Forro padrão',sel('forro','forro'))+field('Blackout padrão',sel('bk','blackout'))+f('bkLarg','Largura do pano de blackout (m)')+f('bkFranz','Franzido do blackout (×)')+'</div><div class="orc-row r4">'+f('motKit','Motor de cortina (R$ por camada)')+f('motInst','Instalação do motor (R$)')+f('motTrilho','Trilho motorizado (R$/m)','substitui o trilho comum')+f('barra','Barra padrão (m)')+'</div>')+
      acard('Venda','<div class="orc-row r4">'+f('margem','Porcentagem da loja (%)','cortinas',0)+f('rt','RT padrão (%)','arquiteto',0)+f('arred','Arredondar para cima a cada (R$)','0 = centavos',0)+f('desc','Desconto à vista padrão (%)')+'</div><div class="orc-row r4">'+f('parcelas','Parcelas no cartão','',0)+f('validade','Validade da proposta (dias)','',0)+field('Prazo padrão','<input type="text" name="prazo" value="'+esc(c.prazo)+'">')+field('Chave Pix no orçamento','<input type="text" name="pix" value="'+esc(c.pix)+'" placeholder="CNPJ, e-mail ou telefone">')+'</div>')+
      '<div class="adm-actions"><button class="adm-btn">Salvar preços e regras</button><button type="button" class="adm-btn ghost" data-orc="reset">Restaurar dados de exemplo</button></div></form>';
  }
  function renderOrc(path,h){
    var m;
    if(path==='#/admin/orcamentos/novo'){var q=newQuote();setTimeout(function(){location.replace('#/admin/orcamentos/'+q.id)},0);return vOrcEdit(q.id)}
    if(path==='#/admin/orcamentos/tecidos')return vOrcTec();
    if(path==='#/admin/orcamentos/persianas')return vOrcPer();
    if(path==='#/admin/orcamentos/precos')return vOrcPrecos();
    if((m=path.match(/^#\/admin\/orcamentos\/([\w-]+)\/documento$/)))return vOrcDoc(m[1]);
    if((m=path.match(/^#\/admin\/orcamentos\/([\w-]+)$/)))return vOrcEdit(m[1]);
    return vOrcList(h);
  }
  /* atualização ao vivo: sem redesenhar a tela (o cursor não sai do campo) */
  function orcPaint(q,only){
    var ed=admRoot.querySelector('.orc-ed');if(!ed)return;
    q.itens.forEach(function(it){if(only&&only!==it.id)return;
      var r=admRoot.querySelector('[data-out="res'+it.id+'"]'),op=r&&r.querySelector('details[open]');if(r)r.innerHTML=it.tipo==='persiana'?resPersiana(it,q):resCortina(it,q);if(op&&r.querySelector('details'))r.querySelector('details').open=true;
      var v=itemVal(it,q),vv=admRoot.querySelector('[data-out="val'+it.id+'"]');if(vv)vv.textContent=v.ok?rs(v.venda):'';
      var ta=admRoot.querySelector('textarea[data-f="desc"][data-it="'+it.id+'"]');if(ta&&!(it.desc&&it.desc.trim())&&document.activeElement!==ta)ta.value=autoDesc(it,q);});
    var s=admRoot.querySelector('[data-out="sum"]');if(s){var act=document.activeElement,k=act&&act.getAttribute('data-q'),ss=act&&act.selectionStart;
      s.innerHTML=vSummary(q);if(k){var n=s.querySelector('[data-q="'+k+'"]');if(n){n.focus();try{n.setSelectionRange(ss,ss)}catch(e){}}}}
  }
  function orcRerender(){var mn=admRoot.querySelector('.adm-main'),y=mn?mn.scrollTop:0;renderAdmin(location.hash);var m2=admRoot.querySelector('.adm-main');if(m2)m2.scrollTop=y}
  function curQ(){var ed=admRoot.querySelector('.orc-ed'),id=ed&&ed.getAttribute('data-q-id');if(!id){var m=location.hash.match(/^#\/admin\/orcamentos\/([\w-]+)/);id=m&&m[1]}return qBy(id)}
  function waText(q){var t=qTot(q),c=orcLoad().cfg;
    return 'Olá'+(q.cliente.nome?', '+q.cliente.nome.split(' ')[0]:'')+'! Segue o orçamento da Casa Áurea ('+q.num+'):\n\n'+q.itens.map(function(it){var v=itemVal(it,q);return '• '+(it.amb||'Item')+': '+descOf(it,q)+' — '+(v.ok?rs(v.venda):'a definir')}).join('\n')+
      '\n\nTotal: '+rs(t.total)+'\nÀ vista: '+rs(t.avista)+(c.parcelas>1?'\nOu em até '+c.parcelas+'x no cartão.':'')+'\nPrazo de entrega: '+(q.prazo||c.prazo)+'.\n\nQualquer dúvida, estou à disposição. '+(q.consultora||'')}
  function orcWA(q){var tel=String(q.cliente.tel||'').replace(/\D/g,'');if(tel&&tel.length<=11)tel='55'+tel;
    var url='https://wa.me/'+(tel||'')+'?text='+encodeURIComponent(waText(q)),w=null;
    var d=admRoot.querySelector('#orcWa');
    if(!d){admRoot.querySelector('.adm-main').insertAdjacentHTML('beforeend','<dialog id="orcWa" class="orc-dlg"><div class="adm-card"><h2>Enviar no WhatsApp</h2><p class="adm-note">Se o WhatsApp não abriu sozinho, use o link ou copie a mensagem.</p><textarea id="orcWaTxt" rows="9" readonly></textarea><div class="adm-actions"><a class="adm-btn" id="orcWaGo" target="_blank" rel="noopener">Abrir WhatsApp</a><button type="button" class="adm-btn ghost" data-orc="wacopy">Copiar mensagem</button><button type="button" class="adm-btn ghost" data-orc="waclose">Fechar</button></div></div></dialog>');d=admRoot.querySelector('#orcWa')}
    d.querySelector('#orcWaTxt').value=waText(q);d.querySelector('#orcWaGo').href=url;
    try{w=window.open(url,'_blank')}catch(e){w=null}
    if(w){try{w.opener=null}catch(e){}}else d.showModal();
  }
  function parseCsv(text){var ls=String(text).replace(/^﻿/,'').split(/\r?\n/).filter(function(l){return l.trim()});if(!ls.length)return [];var sep=(ls[0].match(/;/g)||[]).length>=(ls[0].match(/,/g)||[]).length?';':',';
    var hd=ls[0].split(sep).map(function(x){return norm(x.trim()).replace(/[^a-z0-9]+/g,'_')});return ls.slice(1).map(function(l){var c=l.split(sep),o={};hd.forEach(function(k,i){o[k]=(c[i]||'').trim()});return o})}
  function admMsg(m){var mn=admRoot.querySelector('.adm-main');if(!mn)return;var old=mn.querySelector('.orc-flash');if(old)old.remove();mn.insertAdjacentHTML('afterbegin','<div class="adm-alert ok orc-flash" role="status">'+esc(m)+'</div>');setTimeout(function(){var x=mn.querySelector('.orc-flash');if(x)x.remove()},3500)}

  admRoot.addEventListener('input',function(e){
    var el=e.target,q;
    if(el.matches('[data-f][data-it]')&&el.type!=='radio'&&el.tagName!=='SELECT'&&(q=curQ())){var it=q.itens.filter(function(x){return x.id===el.dataset.it})[0];if(!it)return;var k=el.dataset.f;
      if(k==='tecname'){var tt=orcLoad().tecidos.filter(function(t){return t.cat==='tecido'&&norm(t.nome)===norm(el.value)})[0];it.tec=tt?tt.id:'';it.tecname=el.value;el.classList.toggle('orc-bad',!!el.value&&!tt)}
      else if(k==='desc'){it.desc=el.value===autoDesc(it,q)?'':el.value;var b=admRoot.querySelector('[data-out="dbadge'+it.id+'"]');if(b){b.textContent=it.desc?'editada':'automática';b.classList.toggle('ok',!it.desc)}}
      else if(el.type==='checkbox')it[k]=el.checked;
      else if(k==='L'||k==='H'||k==='barra'||k==='qtd')it[k]=el.value===''?'':num(el.value);
      else it[k]=el.value;
      orcSave();orcPaint(q,k==='desc'?null:null);return}
    if(el.matches('[data-c]')&&(q=curQ())){q.cliente[el.dataset.c]=el.value;orcSave();return}
    if(el.matches('[data-q]')&&(q=curQ())){var kq=el.dataset.q;q[kq]=(kq==='rt'||kq==='desc'||kq==='avista')?(el.value===''?null:num(el.value)):el.value;if(kq==='rt'&&q[kq]==null)q[kq]=0;orcSave();orcPaint(q);return}
    if(el.matches('[data-tf]')){var t=tecBy(el.dataset.tid);if(t){var f=el.dataset.tf;t[f]=(f==='preco'||f==='larg')?num(el.value):el.value;t.ex=false;orcSave()}return}
    if(el.matches('[data-pf]')){var p=perBy(el.dataset.pid);if(p){var g=el.dataset.pf;p[g]=(g==='preco'||g==='min')?num(el.value):el.value;p.ex=false;orcSave()}return}
  });
  admRoot.addEventListener('change',function(e){
    var el=e.target,q;
    if(el.matches('select[data-f][data-it],input[type=radio][data-f],input[type=checkbox][data-f]')&&(q=curQ())){var it=q.itens.filter(function(x){return x.id===el.dataset.it})[0];if(!it)return;
      if(el.type==='checkbox')it[el.dataset.f]=el.checked;else if(el.type==='radio'){if(!el.checked)return;it.comp=el.value}else it[el.dataset.f]=el.value;
      orcSave();orcPaint(q);if(el.type==='radio'){var tl=admRoot.querySelector('[data-out="res'+it.id+'"] input[value="'+el.value+'"]');if(tl)tl.focus()}return}
    if(el.matches('[data-q="status"]')&&(q=curQ())){orcRerender();return}
    if(el.matches('[data-orc-file]')){var file=el.files[0],kind=el.dataset.orcFile;if(!file)return;var rd=new FileReader();rd.onload=function(){var rows=parseCsv(rd.result),o=orcLoad(),n=0;
      rows.forEach(function(r){if(kind==='tec'){var nm=r.nome||r.tecido;if(!nm)return;var cat=norm(r.tipo||'tecido');cat=cat.indexOf('forro')>-1?'forro':cat.indexOf('black')>-1?'blackout':'tecido';
          var ex=o.tecidos.filter(function(t){return norm(t.nome)===norm(nm)})[0];if(ex){ex.preco=num(r.preco);ex.cat=cat;ex.ex=false}else o.tecidos.push({id:'t'+Date.now().toString(36)+n,nome:nm,cat:cat,preco:num(r.preco||r.preco_m),larg:num(r.largura)||2.8});n++}
        else{var mn=r.modelo||r.nome;if(!mn)return;var pe=o.persianas.filter(function(t){return norm(t.nome)===norm(mn)})[0],pr=num(r.preco_m2||r.preco),mi=num(r.area_minima||r.minimo)||1.5;
          if(pe){pe.preco=pr;pe.min=mi;pe.linha=r.linha||pe.linha;pe.ex=false}else o.persianas.push({id:'p'+Date.now().toString(36)+n,nome:mn,linha:r.linha||'',preco:pr,min:mi});n++}});
      orcSave();orcRerender();admMsg(n+' linha(s) importada(s).')};rd.readAsText(file);return}
  });
  admRoot.addEventListener('click',function(e){
    var b=e.target.closest('[data-orc]');if(!b)return;var a=b.getAttribute('data-orc'),q=curQ(),o=orcLoad();
    if(a==='print'){window.print();return}
    if(a==='reset'){if(confirm('Restaurar tecidos, persianas, preços e orçamentos de exemplo? O que foi digitado nesta prévia será apagado.')){ORC=orcSeed();orcSave();orcRerender();admMsg('Dados de exemplo restaurados.')}return}
    if(a==='deltec'){if(confirm('Excluir este tecido do cadastro?')){o.tecidos=o.tecidos.filter(function(t){return t.id!==b.dataset.tid});orcSave();orcRerender()}return}
    if(a==='delper'){if(confirm('Excluir este modelo de persiana?')){o.persianas=o.persianas.filter(function(t){return t.id!==b.dataset.pid});orcSave();orcRerender()}return}
    if(a==='wacopy'){var ta=admRoot.querySelector('#orcWaTxt');ta.select();try{navigator.clipboard.writeText(ta.value)}catch(err){try{document.execCommand('copy')}catch(e2){}}b.textContent='Mensagem copiada';return}
    if(a==='waclose'){admRoot.querySelector('#orcWa').close();return}
    if(!q)return;
    if(a==='wa'){orcWA(q);return}
    if(a==='jump'){e.preventDefault();var tg=admRoot.querySelector('#it-'+b.dataset.it);if(tg)tg.scrollIntoView({behavior:'smooth',block:'start'});return}
    if(a==='add'){var ni=newItem(b.dataset.v);q.itens.push(ni);orcSave();orcRerender();var el=admRoot.querySelector('#it-'+ni.id);if(el){el.scrollIntoView({block:'start'});var f=el.querySelector('input');if(f)f.focus({preventScroll:true})}return}
    var it=q.itens.filter(function(x){return x.id===b.dataset.it})[0];
    if(a==='tipo'&&it){if(it.tipo!==b.dataset.v){var n2=newItem(b.dataset.v);n2.id=it.id;n2.amb=it.amb;n2.L=it.L;n2.H=it.H;n2.qtd=it.qtd;q.itens[q.itens.indexOf(it)]=n2;orcSave();orcRerender()}return}
    if(a==='dupit'&&it){var cp=JSON.parse(JSON.stringify(it));cp.id='i'+Date.now().toString(36);cp.amb=it.amb?it.amb+' (cópia)':'';q.itens.splice(q.itens.indexOf(it)+1,0,cp);orcSave();orcRerender();return}
    if(a==='delit'&&it){if(q.itens.length===1&&!confirm('Remover o único item do orçamento?'))return;q.itens.splice(q.itens.indexOf(it),1);orcSave();orcRerender();return}
    if(a==='autodesc'&&it){it.desc='';orcSave();orcRerender();return}
    if(a==='dupq'){var c2=JSON.parse(JSON.stringify(q)),nq=newQuote();c2.id=nq.id;c2.num=nq.num;c2.status='rascunho';c2.data=today();o.quotes[0]=c2;orcSave();location.hash='#/admin/orcamentos/'+c2.id;return}
    if(a==='delq'){if(confirm('Excluir o orçamento '+q.num+'?')){o.quotes=o.quotes.filter(function(x){return x!==q});orcSave();go('#/admin/orcamentos','Orçamento excluído.')}return}
  });
  admRoot.addEventListener('submit',function(e){
    var f=e.target.closest('form[data-form^="orc"]');if(!f)return;e.preventDefault();var k=f.getAttribute('data-form'),d=fd(f),o=orcLoad(),c=o.cfg;
    if(k==='orcfilter'){var qs2=['q','st'].filter(function(x){return d[x]}).map(function(x){return x+'='+encodeURIComponent(d[x])}).join('&');go('#/admin/orcamentos'+(qs2?'?'+qs2:''));return}
    if(k==='orctec'){if(!d.nome)return;o.tecidos.push({id:'t'+Date.now().toString(36),nome:d.nome.trim(),cat:d.cat,preco:num(d.preco),larg:num(d.larg)||2.8});orcSave();orcRerender();admMsg('Tecido “'+d.nome+'” cadastrado.');return}
    if(k==='orcper'){if(!d.nome)return;o.persianas.push({id:'p'+Date.now().toString(36),nome:d.nome.trim(),linha:d.linha||'',preco:num(d.preco),min:num(d.min)||1.5});orcSave();orcRerender();admMsg('Modelo “'+d.nome+'” cadastrado.');return}
    if(k==='orcpcfg'){['pBando','pMotor','pInst','pMargem'].forEach(function(n){c[n]=num(d[n])});orcSave();orcRerender();admMsg('Adicionais de persiana salvos.');return}
    if(k==='orccfg'){['mo','inst','presilha','sobra','bkLarg','bkFranz','motKit','motInst','motTrilho','barra','margem','rt','arred','desc','parcelas','validade'].forEach(function(n){if(d[n]!==undefined)c[n]=num(d[n])});
      c.forro=d.forro||c.forro;c.bk=d.bk||c.bk;c.prazo=d.prazo||c.prazo;c.pix=d.pix||'';
      c.trilhos.forEach(function(t,i){if(d['trn'+i])t.nome=d['trn'+i];if(d['trp'+i]!==undefined)t.preco=num(d['trp'+i])});
      if(d.trnNovo&&d.trnNovo.trim())c.trilhos.push({id:slugify(d.trnNovo)+'-'+Date.now().toString(36),nome:d.trnNovo.trim(),preco:0});
      orcSave();orcRerender();admMsg('Preços e regras salvos. Os orçamentos abertos já foram recalculados.');return}
  });
