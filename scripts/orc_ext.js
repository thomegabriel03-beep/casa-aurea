  /* =====================================================================
     EXTENSÕES DO PAINEL DE ORÇAMENTOS (21/10/2026) — entram no orcamentos.js
     gerado por scripts/build_orcamentos.py, depois do módulo da prévia.
     1. Persianas completas: acionamento (cordinha, correntinha ou motor),
        lado do comando, guia lateral, caixa box e bandô, com valores na cfg.
     2. Documento do cliente no padrão da marca, SEM medidas (a versão interna,
        com medidas, fica disponível para a equipe).
     3. Orçamento de móveis por código: custo (só painel) + margem por orçamento,
        com duas opções por item ("esta ou esta").
     As funções da prévia que mudam foram renomeadas com sufixo 0 pelo build.
     ===================================================================== */

  /* ---------- configuração: valores novos começam em 0 (preencher) ---------- */
  var PCFG = [
    ['pMotor', 'Motor (R$ por persiana)', 'soma quando a persiana é motorizada'],
    ['pCordinha', 'Comando por cordinha (R$ por persiana)', 'acréscimo; 0 se já está no m²'],
    ['pCorrente', 'Comando por correntinha (R$ por persiana)', 'acréscimo sobre o m²'],
    ['pGuia', 'Guia lateral (R$ por metro de altura)', 'o par de guias, por metro'],
    ['pCaixa', 'Caixa box (R$ por metro de largura)', 'caixa que esconde o rolo'],
    ['pBando', 'Bandô (R$ por metro de largura)', 'tampa o rolo'],
    ['pInst', 'Instalação (R$ por persiana)', ''],
    ['pMargem', 'Porcentagem da loja (%)', 'persianas']
  ];
  function orcSeed() {
    var o = orcSeed0();
    Object.assign(o.cfg, { pCordinha: 0, pCorrente: 0, pGuia: 0, pCaixa: 0, mMargem: 0 });
    o.moveis = [];
    return o;
  }
  function O() { var o = orcLoad(); if (!o.moveis) o.moveis = []; return o; }
  var ACION = [['cordinha', 'Cordinha'], ['corrente', 'Correntinha'], ['motor', 'Motorizada']];
  var LADO = [['direito', 'Direito'], ['esquerdo', 'Esquerdo']];
  function acionOf(it) { return it.comando === 'motor' || it.comando === 'corrente' || it.comando === 'cordinha' ? it.comando : (it.motor ? 'motor' : 'cordinha'); }

  /* ---------- 1. PERSIANAS ---------- */
  function newItem(tipo) {
    var it = newItem0(tipo);
    if (tipo === 'persiana') { it.comando = 'cordinha'; it.lado = 'direito'; it.guia = false; it.caixa = false; it.motor = false; }
    return it;
  }
  function calcPersiana(it, q) {
    var c = orcLoad().cfg, m = perBy(it.mod), L = num(it.L), H = num(it.H), qtd = Math.max(1, num(it.qtd) || 1);
    var ac = acionOf(it), area = m ? Math.max(L * H, num(m.min)) : L * H;
    var p = {
      base: m ? area * num(m.preco) : 0,
      motor: ac === 'motor' ? num(c.pMotor) : 0,
      comando: ac === 'corrente' ? num(c.pCorrente) : ac === 'cordinha' ? num(c.pCordinha) : 0,
      guia: it.guia ? num(c.pGuia) * H : 0,
      caixa: it.caixa ? num(c.pCaixa) * L : 0,
      bando: it.bando ? num(c.pBando) * L : 0,
      inst: num(c.pInst)
    };
    var cost = p.base + p.motor + p.comando + p.guia + p.caixa + p.bando + p.inst;
    var zeros = [];
    if (ac === 'motor' && !num(c.pMotor)) zeros.push('motor');
    if (ac === 'corrente' && !num(c.pCorrente)) zeros.push('comando por correntinha');
    if (ac === 'cordinha' && !num(c.pCordinha) && !num(c.pCorrente)) zeros.push('comando por cordinha');
    if (it.guia && !num(c.pGuia)) zeros.push('guia lateral');
    if (it.caixa && !num(c.pCaixa)) zeros.push('caixa box');
    if (it.bando && !num(c.pBando)) zeros.push('bandô');
    var mult = (1 + num(c.pMargem) / 100) * (1 + num(q && q.rt != null ? q.rt : c.rt) / 100);
    return { m: m, area: area, real: L * H, qtd: qtd, parts: p, zeros: zeros, ac: ac, mult: mult,
      custo: cost * qtd, venda: roundUp(cost * mult * qtd, c.arred), ok: !!(m && L > 0 && H > 0) };
  }
  function perDesc(it) {
    var m = perBy(it.mod), ac = acionOf(it), lado = it.lado === 'esquerdo' ? 'à esquerda' : it.lado === 'direito' ? 'à direita' : '';
    var s = 'Persiana ' + (m ? m.nome : '(escolha o modelo)');
    s += ac === 'motor' ? ', motorizada' + (lado ? ' (motor ' + lado + ')' : '') : ', comando por ' + (ac === 'corrente' ? 'correntinha' : 'cordinha') + (lado ? ' ' + lado : '');
    var extra = [];
    if (it.guia) extra.push('com guia lateral');
    if (it.caixa) extra.push('com caixa box'); else if (it.caixa === false) extra.push('sem caixa box');
    if (it.bando) extra.push('com bandô');
    return s + (extra.length ? ', ' + extra.join(', ') : '');
  }
  function autoDesc(it, q) { return it.tipo === 'persiana' ? perDesc(it) : autoDesc0(it, q); }
  /* no documento do cliente nada de medida: tira a barra da descrição automática */
  function descClient(it, q) {
    if (it.desc && it.desc.trim()) return it.desc;
    return autoDesc(it, q).replace(/ com barra de [\d.,]+( ?m)?/i, '');
  }
  function perOpts(it) {
    var idx = ' data-it="' + it.id + '"', ac = acionOf(it);
    return '<div class="orc-row r4 orc-popts">' +
      field('Acionamento', '<select data-f="comando"' + idx + '>' + ACION.map(function (x) { return opt(x[0], x[1], ac) }).join('') + '</select>') +
      field(ac === 'motor' ? 'Lado do motor' : 'Lado do comando', '<select data-f="lado"' + idx + '>' + LADO.map(function (x) { return opt(x[0], x[1], it.lado || 'direito') }).join('') + '</select>') +
      '<div class="adm-field orc-pchecks" style="grid-column:span 2"><span>Acessórios</span><div class="adm-checks">' +
      '<label class="adm-check"><input type="checkbox" data-f="guia"' + idx + (it.guia ? ' checked' : '') + '> Guia lateral</label>' +
      '<label class="adm-check"><input type="checkbox" data-f="caixa"' + idx + (it.caixa ? ' checked' : '') + '> Com caixa box</label>' +
      '<label class="adm-check"><input type="checkbox" data-f="bando"' + idx + (it.bando ? ' checked' : '') + '> Bandô</label>' +
      '</div></div></div>';
  }
  function vItem(it, q, i) {
    var h = vItem0(it, q, i);
    if (it.tipo !== 'persiana') return h;
    return h.replace(/<div class="adm-checks orc-opts">[\s\S]*?<\/div>/, perOpts(it));
  }
  function resPersiana(it, q) {
    var p = calcPersiana(it, q), c = orcLoad().cfg;
    var warn = p.zeros.length ? '<p class="orc-zero-note">Preencha os valores de ' + esc(p.zeros.join(', ')) + ' em <a href="#/orcamentos/persianas">Persianas → Adicionais</a>. Por enquanto entram como R$ 0,00.</p>' : '';
    if (!p.ok) return '<p class="adm-note orc-wait">Escolha o modelo e informe largura e altura.</p>' + warn;
    var pr = p.parts, L = num(it.L), H = num(it.H), li = [];
    li.push('<li>Área ' + br(p.real) + ' m²' + (p.area > p.real ? ' → mínimo do modelo ' + br(p.area) + ' m²' : '') + ' × ' + rs(p.m.preco) + '/m² = <b>' + rs(pr.base) + '</b></li>');
    if (p.ac === 'motor') li.push('<li>Motor: <b>' + rs(pr.motor) + '</b></li>');
    else li.push('<li>Comando por ' + (p.ac === 'corrente' ? 'correntinha' : 'cordinha') + ': <b>' + rs(pr.comando) + '</b></li>');
    if (it.guia) li.push('<li>Guia lateral: ' + rs(c.pGuia) + '/m × ' + br(H) + ' m = <b>' + rs(pr.guia) + '</b></li>');
    if (it.caixa) li.push('<li>Caixa box: ' + rs(c.pCaixa) + '/m × ' + br(L) + ' m = <b>' + rs(pr.caixa) + '</b></li>');
    if (it.bando) li.push('<li>Bandô: ' + rs(c.pBando) + '/m × ' + br(L) + ' m = <b>' + rs(pr.bando) + '</b></li>');
    li.push('<li>Instalação: <b>' + rs(pr.inst) + '</b></li>');
    li.push('<li>Venda = custo × (1 + ' + br(c.pMargem, 0) + '%) × (1 + RT ' + br(num(q.rt), 0) + '%)' + (p.qtd > 1 ? ' × ' + p.qtd + ' persianas' : '') + ', arredondado para cima a cada ' + rs(c.arred) + '</li>');
    return '<div class="orc-pres"><div><p class="adm-note">Valor de venda</p><p class="orc-big">' + rs(p.venda) + '</p></div><p class="adm-note">custo ' + rs(p.custo) + ' · lucro ' + rs(p.venda - p.custo) + '</p></div>' + warn +
      '<details class="orc-calc"><summary>Ver cálculo</summary><ul>' + li.join('') + '</ul></details>';
  }
  function vOrcPer() {
    var c = orcLoad().cfg, zero = PCFG.filter(function (f) { return f[0] !== 'pMargem' && f[0] !== 'pInst' && !num(c[f[0]]) });
    var card = '<section class="adm-card"><h2>Adicionais de persiana</h2>' +
      (zero.length ? '<p class="orc-zero-note" style="margin:0 0 1rem">Preencha os valores: ' + esc(zero.map(function (f) { return f[1].replace(/ \(.*$/, '').toLowerCase() }).join(', ')) + '. Enquanto estiverem zerados, entram como R$ 0,00 no orçamento.</p>' : '') +
      '<form class="orc-row r4" data-form="perxcfg">' + PCFG.map(function (f) {
        var z = !num(c[f[0]]) && f[0] !== 'pMargem' && f[0] !== 'pInst';
        return field(f[1], '<input type="text" inputmode="decimal" name="' + f[0] + '" value="' + br(c[f[0]], f[0] === 'pMargem' ? 0 : 2) + '"' + (z ? ' class="orc-zero"' : '') + '>', z ? 'preencha o valor' : f[2]);
      }).join('') +
      '<div class="adm-actions" style="grid-column:1/-1;margin-top:0"><button class="adm-btn">Salvar adicionais</button></div></form></section>';
    return vOrcPer0().replace(/<section class="adm-card"><h2>Adicionais de persiana<\/h2>[\s\S]*?<\/form><\/section>/, card);
  }

  /* ---------- 2. DOCUMENTO DO CLIENTE (padrão Casa Áurea) ---------- */
  var CONTATO = { wa: '+55 48 98457-6227', end: 'Av. Valério Gomes, 42 · Centro, Tijucas — SC', ig: '@a.casaaurea' };
  var MARK = '<svg class="cad-mark" viewBox="-3 -3 240 311" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><rect x="0" y="0" width="234" height="305" vector-effect="non-scaling-stroke"/><path d="M116 305V129H234" vector-effect="non-scaling-stroke"/><path d="M0 252C4 184 52 129 130 129C190 129 232 170 232 214C232 262 198 290 162 290C134 290 116 272 116 250C116 229 131 217 146 217C161 217 171 229 169 242C167 254 155 257 147 250" vector-effect="non-scaling-stroke"/></svg>';
  function docLogo(cls) { return '<div class="cad-logo ' + (cls || '') + '">' + MARK + '<span>CASA ÁUREA</span></div>'; }
  function two(n) { return (n < 10 ? '0' : '') + n; }
  /* d = {num, data, titulo, cliente, consultora, itens:[{n, amb, html, qtd, valor}], total, avista, prazo, obs, interno} */
  function docHtml(d) {
    var c = orcLoad().cfg, cl = d.cliente || {};
    var meta = [cl.end, cl.tel].filter(Boolean).map(esc).join(' · ');
    var pay = 'À vista ' + rs(d.avista) + (num(c.parcelas) > 1 ? ' ou ' + rs(d.total) + ' em até ' + num(c.parcelas) + 'x no cartão' : '') + '.';
    return '<article class="cad' + (d.interno ? ' is-int' : '') + '" aria-label="Orçamento ' + esc(d.num) + '">' +
      (d.interno ? '<p class="cad-int">Versão interna · com medidas · não enviar ao cliente</p>' : '') +
      '<header class="cad-h">' + docLogo() + '<div class="cad-h-r"><p class="cad-eb">Orçamento</p><p class="cad-num">' + esc(d.num) + '</p><p class="cad-date">' + esc(c.cidade || 'Tijucas') + ', ' + dataExt(d.data) + '</p></div></header>' +
      '<section class="cad-intro"><div><p class="cad-eb">Preparado para</p><p class="cad-cli">' + esc(cl.nome || '—') + '</p>' + (meta ? '<p class="cad-mut">' + meta + '</p>' : '') + '</div>' +
      '<div class="cad-intro-r"><p class="cad-eb">Consultoria</p><p>' + esc(d.consultora || '') + ' · Casa Áurea</p>' + (cl.arq ? '<p class="cad-eb" style="margin-top:.9rem">Arquitetura</p><p>' + esc(cl.arq) + '</p>' : '') + '</div></section>' +
      '<h1 class="cad-title">' + esc(d.titulo) + '</h1>' +
      '<ol class="cad-items">' + d.itens.map(function (it, i) {
        return '<li class="cad-it"><span class="cad-n">' + two(i + 1) + '</span><div class="cad-it-b">' + (it.amb ? '<p class="cad-amb">' + esc(it.amb) + '</p>' : '') + it.html + '</div>' +
          '<p class="cad-q">' + (it.qtd > 1 ? it.qtd + ' un.' : '') + '</p><p class="cad-v">' + (it.valor == null ? 'a definir' : rs(it.valor)) + '</p></li>';
      }).join('') + '</ol>' +
      '<section class="cad-tot"><p class="cad-eb">Investimento total</p><div><p class="cad-big">' + rs(d.total) + '</p><p class="cad-pay">' + pay + '</p></div></section>' +
      '<section class="cad-cond">' +
      '<div><p class="cad-eb">Prazo de entrega</p><p>' + esc(d.prazo || c.prazo || 'a combinar') + '</p></div>' +
      '<div><p class="cad-eb">Validade da proposta</p><p>' + esc(String(num(c.validade) || 15)) + ' dias</p></div>' +
      '<div><p class="cad-eb">Pagamento</p><p>' + (c.pix ? 'Pix ' + esc(c.pix) + ' · ' : '') + 'cartão em até ' + esc(String(num(c.parcelas) || 1)) + 'x</p></div>' +
      '</section>' +
      (d.obs ? '<p class="cad-obs">' + esc(d.obs) + '</p>' : '') +
      (d.nota ? '<p class="cad-nota">' + esc(d.nota) + '</p>' : '') +
      '<footer class="cad-f">' + docLogo('sm') + '<p>WhatsApp ' + CONTATO.wa + '<span>·</span>' + CONTATO.end + '<span>·</span>' + CONTATO.ig + '</p></footer></article>';
  }
  function docToolbar(back, extra) {
    return '<div class="orc-toolbar"><a class="adm-btn ghost" href="' + back + '">← Voltar e editar</a><button type="button" class="adm-btn" data-orc="print">Imprimir ou salvar PDF</button>' + (extra || '') + '</div>';
  }
  function vOrcDoc(id, h) {
    var q = qBy(id); if (!q) return head('Orçamento não encontrado', '');
    var t = qTot(q), interno = qs(h).v === 'interna', base = '#/orcamentos/' + q.id + '/documento';
    var itens = q.itens.map(function (it) {
      var v = itemVal(it, q), med = '';
      if (interno) {
        var L = num(it.L), H = num(it.H);
        med = '<p class="cad-med">' + br(L) + ' × ' + br(H) + ' m · ' + br(L * H) + ' m²' + (it.tipo === 'cortina' ? ' · barra ' + br(it.barra === '' || it.barra == null ? orcLoad().cfg.barra : num(it.barra)) : '') + '</p>';
      }
      return { amb: it.amb, qtd: num(it.qtd), valor: v.ok ? v.venda : null, html: '<p class="cad-desc">' + esc(interno ? descOf(it, q) : descClient(it, q)) + '</p>' + med };
    });
    var seg = '<div class="orc-docv" role="group" aria-label="Versão do documento"><a href="' + base + '" aria-pressed="' + !interno + '">Versão do cliente</a><a href="' + base + '?v=interna" aria-pressed="' + interno + '">Versão interna (com medidas)</a></div>';
    return docToolbar('#/orcamentos/' + q.id, '<button type="button" class="adm-btn ghost" data-orc="wa" data-qid="' + q.id + '">Enviar no WhatsApp</button>' + seg + (t.ok ? '' : '<span class="adm-badge warn">Há itens incompletos</span>')) +
      docHtml({ num: q.num, data: q.data, titulo: 'Cortinas e persianas', cliente: q.cliente, consultora: q.consultora, itens: itens, total: t.total, avista: t.avista, prazo: q.prazo, obs: q.obs, interno: interno,
        nota: 'Medidas finais conferidas na visita técnica.' });
  }
  function waText(q) {
    var t = qTot(q), c = orcLoad().cfg;
    return 'Olá' + (q.cliente.nome ? ', ' + q.cliente.nome.split(' ')[0] : '') + '! Segue o orçamento da Casa Áurea (' + q.num + '):\n\n' + q.itens.map(function (it) { var v = itemVal(it, q); return '• ' + (it.amb || 'Item') + ': ' + descClient(it, q) + ' — ' + (v.ok ? rs(v.venda) : 'a definir') }).join('\n') +
      '\n\nTotal: ' + rs(t.total) + '\nÀ vista: ' + rs(t.avista) + (c.parcelas > 1 ? '\nOu em até ' + c.parcelas + 'x no cartão.' : '') + '\nPrazo de entrega: ' + (q.prazo || c.prazo) + '.\n\nQualquer dúvida, estou à disposição. ' + (q.consultora || '');
  }

  /* ---------- 3. MÓVEIS ---------- */
  var M9 = STORE.m9 !== false;
  function mvBy(id) { return O().moveis.filter(function (q) { return q.id === id })[0]; }
  function mvMarg(op, q) { return op.margem === '' || op.margem == null ? num(q.margem) : num(op.margem); }
  function mvOp(op, it, q) {
    var c = orcLoad().cfg, qtd = Math.max(1, num(it.qtd) || 1), custo = num(op.custo), mg = mvMarg(op, q);
    var unit = custo > 0 ? roundUp(custo * (1 + mg / 100) * (1 + num(q.rt) / 100), c.arred) : 0;
    return { unit: unit, total: unit * qtd, custo: custo * qtd, lucro: (unit - custo) * qtd, mg: mg, ok: custo > 0, qtd: qtd };
  }
  function mvSel(it) { return it.ops.length > 1 && it.sel === 1 ? 1 : 0; }
  function mvItem(it, q) { var op = it.ops[mvSel(it)]; if (!op) return { total: 0, custo: 0, lucro: 0, ok: false }; return mvOp(op, it, q); }
  function mvTot(q) {
    var t = 0, c = 0, ok = q.itens.length > 0;
    q.itens.forEach(function (it) { var v = mvItem(it, q); t += v.total; c += v.custo; if (!v.ok) ok = false });
    var cfg = orcLoad().cfg, desc = q.desc != null && q.desc !== '' ? num(q.desc) : num(cfg.desc);
    var av = q.avista != null && q.avista !== '' ? num(q.avista) : Math.floor(t * (1 - desc / 100) / 10) * 10;
    return { total: t, custo: c, lucro: t - c, avista: av, desc: desc, ok: ok };
  }
  function mvNewItem() { return { id: 'm' + Date.now().toString(36) + Math.floor(Math.random() * 99), amb: '', qtd: 1, sel: 0, ops: [] }; }
  function mvNewQuote() {
    var o = O(), c = o.cfg, y = new Date().getFullYear();
    var n = o.moveis.reduce(function (m, q) { var p = String(q.num).split('-'); return p[1] === String(y) ? Math.max(m, Number(p[2]) || 0) : m }, 0) + 1;
    var q = { id: 'mv' + Date.now().toString(36), num: 'MOV-' + y + '-' + ('00' + n).slice(-3), status: 'rascunho', data: today(), consultora: 'Camila',
      cliente: { nome: '', tel: '', end: '', email: '', arq: '' }, margem: num(c.mMargem), rt: c.rt, desc: c.desc, avista: null, prazo: c.prazo, obs: '', itens: [] };
    o.moveis.unshift(q); orcSave(); return q;
  }
  function mvM9Alert() {
    return '<div class="adm-alert bad" role="alert" style="margin-bottom:1rem">O orçamento de móveis precisa da migração <b>0009</b>. Rode <span class="adm-code">supabase/migrations/0009_orcamento_moveis.sql</span> no SQL Editor do Supabase e recarregue a página.</div>';
  }
  function vMovList(h) {
    var o = O(), f = qs(h), qq = norm(f.q || ''), st = f.st || '';
    var list = o.moveis.filter(function (q) { return (!st || q.status === st) && (!qq || norm(q.num + ' ' + q.cliente.nome + ' ' + q.itens.map(function (i) { return i.amb + ' ' + i.ops.map(function (p) { return p.code + ' ' + p.nome }).join(' ') }).join(' ')).indexOf(qq) > -1) });
    return head('Orçamentos de móveis', 'Digite o código da peça (ex.: CA-MES-0167) ou o nome: entra com foto, medidas e preço a partir do custo + margem.',
      (M9 ? '<a class="adm-btn" href="#/orcamentos/moveis/novo">Novo orçamento de móveis</a>' : '') + '<a class="adm-btn ghost" href="/admin/orcamentos/custos">Custos das peças</a>') + orcTabs('#/orcamentos/moveis') +
      (M9 ? '' : mvM9Alert()) +
      '<form class="orc-filter" data-form="mvfilter" role="search"><input type="search" name="q" value="' + esc(f.q || '') + '" placeholder="Cliente, número, ambiente ou peça" aria-label="Buscar orçamento de móveis"><select name="st" aria-label="Status"><option value="">Todos os status</option>' + Object.keys(OST).map(function (k) { return opt(k, OST[k][0], st) }).join('') + '</select><button class="adm-btn ghost">Filtrar</button></form>' +
      (list.length ? '<div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Número</th><th>Cliente</th><th>Data</th><th>Itens</th><th>Total</th><th>Margem</th><th>Status</th><th></th></tr></thead><tbody>' +
        list.map(function (q) { var t = mvTot(q); return '<tr><td class="adm-code"><a href="#/orcamentos/moveis/' + q.id + '">' + esc(q.num) + '</a></td><td>' + esc(q.cliente.nome || 'Sem nome') + '</td><td>' + esc(String(q.data).split('-').reverse().join('/')) + '</td><td>' + q.itens.length + '</td><td>' + rs(t.total) + '</td><td>' + br(num(q.margem), 0) + '%</td><td>' + bdg(OST, q.status) + '</td><td style="white-space:nowrap"><a class="adm-btn ghost sm" href="#/orcamentos/moveis/' + q.id + '">Abrir</a> <a class="adm-btn ghost sm" href="#/orcamentos/moveis/' + q.id + '/documento">Documento</a></td></tr>' }).join('') + '</tbody></table></div>' :
        '<div class="adm-card adm-empty">Nenhum orçamento de móveis' + (st || qq ? ' com esse filtro' : ' ainda') + '.' + (M9 ? ' <a href="#/orcamentos/moveis/novo">Criar o primeiro</a>' : '') + '</div>');
  }
  function mvSearch(key, ph) {
    return '<div class="mv-search"><input type="search" data-mvs="' + key + '" placeholder="' + esc(ph) + '" autocomplete="off" aria-label="' + esc(ph) + '"><div class="mv-sug" data-out="sug-' + key + '" role="listbox"></div></div>';
  }
  function mvOpCard(op, it, q, k) {
    var v = mvOp(op, it, q), a = ' data-it="' + it.id + '" data-k="' + k + '"', on = mvSel(it) === k;
    return '<div class="mv-op' + (it.ops.length > 1 && on ? ' on' : '') + '">' +
      (op.foto ? '<img src="' + esc(op.foto) + '" alt="" loading="lazy">' : '<span class="mv-nofoto" aria-hidden="true">sem foto</span>') +
      '<div class="mv-op-b"><div class="mv-op-h"><p class="mv-op-l">Opção ' + (k + 1) + '</p>' +
      (it.ops.length > 1 ? '<label class="adm-check mv-sel"><input type="radio" name="sel-' + it.id + '" data-mo="sel"' + a + (on ? ' checked' : '') + '> entra no total</label>' : '') +
      '<button type="button" class="orc-link" data-mov="delop"' + a + '>remover</button></div>' +
      '<p class="mv-op-n">' + esc(op.nome) + ' <span class="adm-code">' + esc(op.code) + '</span></p>' +
      '<div class="orc-row r3 mv-row3">' + field('Medidas', '<input type="text" data-mo="medidas"' + a + ' value="' + esc(op.medidas || '') + '" placeholder="L × P × A cm">') +
      field('Custo unitário (R$)', numIn('data-mo="custo"' + a, op.custo, ' placeholder="0,00"' + (num(op.custo) > 0 ? '' : ' class="orc-zero"')), num(op.custo) > 0 ? (op.custo0 != null && num(op.custo0) !== num(op.custo) ? 'cadastro: ' + rs(op.custo0) : 'do cadastro') : 'sem custo cadastrado') +
      field('Margem (%)', numIn('data-mo="margem"' + a, op.margem, ' placeholder="' + esc(br(num(q.margem), 0)) + '"'), 'vazio = margem do orçamento') + '</div>' +
      '<p class="mv-op-res" data-out="mvop-' + it.id + '-' + k + '">' + mvOpRes(op, it, q) + '</p></div></div>';
  }
  function mvOpRes(op, it, q) {
    var v = mvOp(op, it, q);
    if (!v.ok) return '<span class="orc-zero-note">Informe o custo para calcular o preço.</span>';
    return '<b>' + rs(v.unit) + '</b> cada' + (v.qtd > 1 ? ' · ' + rs(v.total) + ' (' + v.qtd + ' un.)' : '') + ' <span class="mv-int">custo ' + rs(v.custo) + ' · margem ' + br(v.mg, 0) + '% · lucro ' + rs(v.lucro) + '</span>' +
      (op.preco != null && num(op.preco) > 0 ? ' <span class="mv-int">· tabela ' + rs(op.preco) + '</span>' : '');
  }
  function mvItemCard(it, q, i) {
    var a = ' data-it="' + it.id + '"', v = mvItem(it, q);
    return '<article class="adm-card orc-item mv-item" id="it-' + it.id + '"><div class="orc-it-top"><span class="orc-it-n">' + (i + 1) + '</span>' +
      '<span class="orc-it-val" data-out="mvval' + it.id + '">' + (v.ok ? rs(v.total) : '') + '</span>' +
      '<button type="button" class="adm-btn ghost sm" data-mov="dupit"' + a + '>Duplicar</button><button type="button" class="adm-btn danger sm" data-mov="delit"' + a + ' aria-label="Remover item ' + (i + 1) + '">Remover</button></div>' +
      '<div class="orc-row r2 mv-row">' + field('Ambiente / grupo', '<input type="text" list="orcAmb" data-mi="amb"' + a + ' value="' + esc(it.amb || '') + '" placeholder="Sala de jantar, Varanda…">') + field('Quantidade', numIn('data-mi="qtd"' + a, it.qtd)) + '</div>' +
      '<div class="mv-ops">' + it.ops.map(function (op, k) { return (k ? '<p class="mv-ou">ou</p>' : '') + mvOpCard(op, it, q, k) }).join('') + '</div>' +
      (it.ops.length < 2 ? mvSearch(it.id, it.ops.length ? 'Opção 2 (esta ou esta): código ou nome da peça' : 'Código da peça (CA-MES-0167) ou nome') : '') + '</article>';
  }
  function mvSummary(q) {
    var t = mvTot(q);
    return '<div class="orc-sum-list">' + q.itens.map(function (it, i) { var v = mvItem(it, q), op = it.ops[mvSel(it)]; return '<a href="#it-' + it.id + '" data-mov="jump" data-it="' + it.id + '"><span>' + (i + 1) + '. ' + esc(it.amb || (op ? op.nome : 'Item')) + '</span><b>' + (v.ok ? rs(v.total) : '—') + '</b></a>' }).join('') + '</div>' +
      '<div class="orc-sum-tot"><span>Total</span><strong>' + rs(t.total) + '</strong></div>' +
      '<div class="orc-sum-av"><span>À vista</span><strong>' + rs(t.avista) + '</strong></div>' +
      '<p class="adm-note orc-int">Interno · custo ' + rs(t.custo) + ' · lucro ' + rs(t.lucro) + (t.total ? ' (' + Math.round(t.lucro / t.total * 100) + '% da venda)' : '') + '</p>' +
      (num(q.margem) === 0 ? '<p class="orc-zero-note">Margem do orçamento em 0%: o preço está igual ao custo.</p>' : '');
  }
  function vMovEdit(id) {
    var q = mvBy(id); if (!q) return head('Orçamento não encontrado', '') + '<a class="adm-btn" href="#/orcamentos/moveis">Voltar</a>';
    var cl = q.cliente, amb = ['Sala de estar', 'Sala de jantar', 'Varanda', 'Área externa', 'Suíte master', 'Quarto', 'Escritório', 'Home theater', 'Hall', 'Cozinha'];
    return head(esc(q.num), 'Orçamento de móveis · ' + bdg(OST, q.status), '<a class="adm-btn ghost" href="#/orcamentos/moveis">Todos</a><a class="adm-btn" href="#/orcamentos/moveis/' + q.id + '/documento">Ver orçamento do cliente</a>') + orcTabs('#/orcamentos/moveis') +
      (M9 ? '' : mvM9Alert()) +
      '<datalist id="orcAmb">' + amb.map(function (x) { return '<option value="' + x + '">' }).join('') + '</datalist>' +
      '<div class="orc-ed mov-ed" data-q-id="' + q.id + '"><div class="orc-main">' +
      acard('Cliente', '<div class="orc-row r3">' + field('Nome', '<input type="text" data-mc="nome" value="' + esc(cl.nome) + '" placeholder="Nome do cliente">') + field('Telefone / WhatsApp', '<input type="text" inputmode="tel" data-mc="tel" value="' + esc(cl.tel) + '" placeholder="(48) 9…">') + field('Consultora', '<select data-mq="consultora">' + ['Camila', 'Rafa'].map(function (x) { return opt(x, x, q.consultora) }).join('') + '</select>') + '</div>' +
        '<div class="orc-row r3">' + field('Endereço da obra', '<input type="text" data-mc="end" value="' + esc(cl.end) + '">') + field('Arquiteto(a) / indicação', '<input type="text" data-mc="arq" value="' + esc(cl.arq) + '" placeholder="Opcional">') + field('Status', '<select data-mq="status">' + Object.keys(OST).map(function (k) { return opt(k, OST[k][0], q.status) }).join('') + '</select>') + '</div>') +
      acard('Preço (interno)', '<div class="orc-row r4">' + field('Margem do orçamento (%)', numIn('data-mq="margem"', q.margem), 'sobre o custo; ajuste por item se quiser') + field('RT do arquiteto (%)', numIn('data-mq="rt"', q.rt)) + field('Desconto à vista (%)', numIn('data-mq="desc"', q.desc == null ? '' : q.desc)) + field('Valor à vista', numIn('data-mq="avista"', q.avista, ' placeholder="automático"'), 'em branco = automático') + '</div>' +
        '<div class="orc-row r2">' + field('Data', '<input type="date" data-mq="data" value="' + esc(q.data) + '">') + field('Prazo de entrega', '<input type="text" data-mq="prazo" value="' + esc(q.prazo || '') + '">') + '</div>') +
      '<div class="orc-items">' + q.itens.map(function (it, i) { return mvItemCard(it, q, i) }).join('') + '</div>' +
      (M9 ? '<section class="adm-card mv-add"><h2>Adicionar peça</h2>' + mvSearch('new', 'Código da peça (CA-MES-0167) ou nome') + '<p class="adm-note" style="margin-top:.5rem">Cada peça vira um item. Para dar duas opções ("esta ou esta"), adicione a opção 2 dentro do item.</p></section>' : '') +
      acard('Observações no orçamento', '<textarea data-mq="obs" rows="3" placeholder="Ex.: tecido G3 da linha …; entrega e montagem inclusas.">' + esc(q.obs || '') + '</textarea>') +
      '</div><aside class="orc-side"><section class="adm-card orc-sum"><h2>Resumo</h2><div data-out="mvsum">' + mvSummary(q) + '</div>' +
      '<div class="orc-side-act"><a class="adm-btn" href="#/orcamentos/moveis/' + q.id + '/documento">Ver orçamento do cliente</a><button type="button" class="adm-btn ghost" data-mov="wa">Enviar resumo no WhatsApp</button><button type="button" class="adm-btn ghost" data-mov="dupq">Duplicar orçamento</button><button type="button" class="adm-btn danger" data-mov="delq">Excluir</button></div></section></aside></div>' +
      WA_DLG;
  }
  function mvOpDoc(op, it, q, k, sel) {
    var v = mvOp(op, it, q);
    return '<div class="cad-op' + (sel ? ' on' : '') + '">' + (op.foto ? '<img src="' + esc(op.foto) + '" alt="">' : '<span class="cad-nofoto"></span>') +
      '<div><p class="cad-op-l">' + (it.ops.length > 1 ? 'Opção ' + (k + 1) + (sel ? ' · considerada no total' : '') : '') + '</p><p class="cad-op-n">' + esc(op.nome) + '</p>' +
      '<p class="cad-mut">' + [op.code, op.medidas].filter(Boolean).map(esc).join(' · ') + '</p>' +
      '<p class="cad-op-v">' + (v.ok ? rs(v.unit) + (v.qtd > 1 ? ' <small>cada</small>' : '') : 'a definir') + '</p></div></div>';
  }
  function vMovDoc(id) {
    var q = mvBy(id); if (!q) return head('Orçamento não encontrado', '');
    var t = mvTot(q);
    var itens = q.itens.map(function (it) {
      var v = mvItem(it, q), s = mvSel(it);
      return { amb: it.amb, qtd: num(it.qtd), valor: v.ok ? v.total : null,
        html: '<div class="cad-ops">' + it.ops.map(function (op, k) { return (k ? '<p class="cad-ou">ou</p>' : '') + mvOpDoc(op, it, q, k, it.ops.length > 1 && k === s) }).join('') + '</div>' };
    });
    var multi = q.itens.some(function (it) { return it.ops.length > 1 });
    return docToolbar('#/orcamentos/moveis/' + q.id, '<button type="button" class="adm-btn ghost" data-mov="wa">Enviar no WhatsApp</button>' + (t.ok ? '' : '<span class="adm-badge warn">Há itens sem preço</span>')) +
      docHtml({ num: q.num, data: q.data, titulo: 'Mobiliário', cliente: q.cliente, consultora: q.consultora, itens: itens, total: t.total, avista: t.avista, prazo: q.prazo, obs: q.obs,
        nota: multi ? 'Nos itens com duas opções, o total considera a opção indicada; a outra pode substituí-la, com o valor ajustado.' : '' });
  }
  function mvWaText(q) {
    var t = mvTot(q), c = orcLoad().cfg;
    return 'Olá' + (q.cliente.nome ? ', ' + q.cliente.nome.split(' ')[0] : '') + '! Segue o orçamento da Casa Áurea (' + q.num + '):\n\n' + q.itens.map(function (it) {
      var qtd = Math.max(1, num(it.qtd) || 1);
      return '• ' + (it.amb ? it.amb + ': ' : '') + it.ops.map(function (op, k) { var v = mvOp(op, it, q); return (it.ops.length > 1 ? 'opção ' + (k + 1) + ' ' : '') + op.nome + (op.code ? ' (' + op.code + ')' : '') + ' — ' + (v.ok ? rs(v.unit) + (qtd > 1 ? ' cada' : '') : 'a definir') }).join(' | ') + (qtd > 1 ? ' · ' + qtd + ' un.' : '');
    }).join('\n') + '\n\nTotal: ' + rs(t.total) + '\nÀ vista: ' + rs(t.avista) + (c.parcelas > 1 ? '\nOu em até ' + c.parcelas + 'x no cartão.' : '') + '\nPrazo de entrega: ' + (q.prazo || c.prazo) + '.\n\nQualquer dúvida, estou à disposição. ' + (q.consultora || '');
  }
  var WA_DLG = '<dialog id="orcWa" class="orc-dlg"><div class="adm-card"><h2>Enviar no WhatsApp</h2><p class="adm-note">Se o WhatsApp não abriu sozinho, use o link ou copie a mensagem.</p><textarea id="orcWaTxt" rows="9" readonly></textarea><div class="adm-actions"><a class="adm-btn" id="orcWaGo" target="_blank" rel="noopener">Abrir WhatsApp</a><button type="button" class="adm-btn ghost" data-orc="wacopy">Copiar mensagem</button><button type="button" class="adm-btn ghost" data-orc="waclose">Fechar</button></div></div></dialog>';
  function mvWA(q) {
    var tel = String(q.cliente.tel || '').replace(/\D/g, ''); if (tel && tel.length <= 11) tel = '55' + tel;
    var url = 'https://wa.me/' + (tel || '') + '?text=' + encodeURIComponent(mvWaText(q)), w = null, d = admRoot.querySelector('#orcWa');
    if (!d) { admRoot.insertAdjacentHTML('beforeend', WA_DLG); d = admRoot.querySelector('#orcWa'); }
    d.querySelector('#orcWaTxt').value = mvWaText(q); d.querySelector('#orcWaGo').href = url;
    try { w = window.open(url, '_blank') } catch (e) { w = null }
    if (w) { try { w.opener = null } catch (e) { } } else d.showModal();
  }

  /* ---------- abas e rotas ---------- */
  function orcTabs(path) {
    var tabs = [['#/orcamentos', 'Cortinas e persianas'], ['#/orcamentos/moveis', 'Móveis'], ['#/orcamentos/tecidos', 'Tecidos'], ['#/orcamentos/persianas', 'Persianas'], ['#/orcamentos/precos', 'Preços e regras']];
    return '<nav class="adm-tabs" aria-label="Orçamentos">' + tabs.map(function (t) {
      var a = t[0] === '#/orcamentos' ? (path === t[0] || /^#\/orcamentos\/q/.test(path)) : path.indexOf(t[0]) === 0;
      return '<a href="' + t[0] + '"' + (a ? ' aria-current="page"' : '') + '>' + t[1] + '</a>';
    }).join('') + '<a href="/admin/orcamentos/custos">Custos das peças</a></nav>';
  }
  function renderOrc(path, h) {
    var m;
    if (path === '#/orcamentos/moveis/novo') {
      if (!M9) return vMovList(h);
      var q = mvNewQuote(); setTimeout(function () { location.replace('#/orcamentos/moveis/' + q.id) }, 0); return vMovEdit(q.id);
    }
    if (path === '#/orcamentos/moveis') return vMovList(h);
    if ((m = path.match(/^#\/orcamentos\/moveis\/([\w-]+)\/documento$/))) return vMovDoc(m[1]);
    if ((m = path.match(/^#\/orcamentos\/moveis\/([\w-]+)$/))) return vMovEdit(m[1]);
    if ((m = path.match(/^#\/orcamentos\/([\w-]+)\/documento$/))) return vOrcDoc(m[1], h);
    return renderOrc0(path, h);
  }

  /* depois de cada tela: valores calculados já aparecem ao abrir o orçamento (antes só após editar) */
  function orcAfterRender() {
    var ed = admRoot.querySelector('.orc-ed'); if (!ed || ed.classList.contains('mov-ed')) return;
    var q = qBy(ed.getAttribute('data-q-id')); if (q) orcPaint(q);
  }

  /* ---------- eventos dos módulos novos ---------- */
  function curMQ() { var ed = admRoot.querySelector('.mov-ed'); return ed ? mvBy(ed.getAttribute('data-q-id')) : null; }
  function mvItBy(q, id) { return q.itens.filter(function (x) { return x.id === id })[0]; }
  function mvPaint(q) {
    q.itens.forEach(function (it) {
      it.ops.forEach(function (op, k) { var el = admRoot.querySelector('[data-out="mvop-' + it.id + '-' + k + '"]'); if (el) el.innerHTML = mvOpRes(op, it, q) });
      var v = mvItem(it, q), vv = admRoot.querySelector('[data-out="mvval' + it.id + '"]'); if (vv) vv.textContent = v.ok ? rs(v.total) : '';
    });
    var s = admRoot.querySelector('[data-out="mvsum"]'); if (s) s.innerHTML = mvSummary(q);
  }
  var hits = {}, sTimer = null, sSeq = 0;
  function sugHtml(key, list, msg) {
    if (msg) return '<p class="mv-sug-msg">' + esc(msg) + '</p>';
    return list.map(function (x, i) {
      return '<button type="button" class="mv-hit" role="option" data-mov="pick" data-key="' + esc(key) + '" data-i="' + i + '">' + (x.foto ? '<img src="' + esc(x.foto) + '" alt="">' : '<span class="mv-nofoto"></span>') +
        '<span><b>' + esc(x.nome) + '</b><small>' + esc([x.code, x.medidas].filter(Boolean).join(' · ')) + '</small></span><em>' + (x.custo != null ? 'custo ' + rs(x.custo) : 'sem custo') + '</em></button>';
    }).join('');
  }
  function runSearch(key, val) {
    var out = admRoot.querySelector('[data-out="sug-' + key + '"]'); if (!out) return;
    var term = String(val || '').trim();
    if (term.length < 2) { out.innerHTML = ''; hits[key] = []; return; }
    if (typeof STORE.findProducts !== 'function') { out.innerHTML = sugHtml(key, [], 'Busca indisponível.'); return; }
    var my = ++sSeq; out.innerHTML = sugHtml(key, [], 'Buscando…');
    STORE.findProducts(term).then(function (list) {
      if (my !== sSeq) return; hits[key] = list || [];
      out.innerHTML = hits[key].length ? sugHtml(key, hits[key]) : sugHtml(key, [], 'Nenhuma peça com “' + term + '”. Confira o código.');
    }).catch(function (e) { if (my === sSeq) out.innerHTML = sugHtml(key, [], 'Erro na busca: ' + ((e && e.message) || 'tente de novo')); });
  }
  function pickHit(q, key, x) {
    if (!x) return;
    var op = { pid: x.pid, vid: x.vid || null, code: x.code || '', nome: x.nome || '', foto: x.foto || '', medidas: x.medidas || '',
      custo: x.custo != null ? x.custo : '', custo0: x.custo != null ? x.custo : null, preco: x.preco != null ? x.preco : null, margem: null };
    var it;
    if (key === 'new') { it = mvNewItem(); q.itens.push(it); } else { it = mvItBy(q, key); if (!it) return; }
    if (it.ops.length >= 2) return;
    it.ops.push(op); hits[key] = [];
    orcSave(); orcRerender();
    var el = admRoot.querySelector('#it-' + it.id); if (el && key === 'new') el.scrollIntoView({ block: 'center' });
    var nx = admRoot.querySelector('[data-mvs="new"]'); if (nx && key === 'new') nx.focus({ preventScroll: true });
  }
  admRoot.addEventListener('input', function (e) {
    var el = e.target, q;
    if (el.matches('[data-mvs]')) { var key = el.getAttribute('data-mvs'), v = el.value; clearTimeout(sTimer); sTimer = setTimeout(function () { runSearch(key, v) }, 250); return; }
    if (!(q = curMQ())) return;
    if (el.matches('[data-mc]')) { q.cliente[el.dataset.mc] = el.value; orcSave(); return; }
    if (el.matches('[data-mq]') && el.tagName !== 'SELECT') {
      var k = el.dataset.mq; q[k] = (k === 'margem' || k === 'rt' || k === 'desc' || k === 'avista') ? (el.value === '' ? null : num(el.value)) : el.value;
      if ((k === 'margem' || k === 'rt') && q[k] == null) q[k] = 0;
      orcSave(); mvPaint(q); return;
    }
    if (el.matches('[data-mi]')) { var it = mvItBy(q, el.dataset.it); if (!it) return; it[el.dataset.mi] = el.dataset.mi === 'qtd' ? (el.value === '' ? '' : num(el.value)) : el.value; orcSave(); mvPaint(q); return; }
    if (el.matches('[data-mo]') && el.type !== 'radio') {
      var it2 = mvItBy(q, el.dataset.it), op = it2 && it2.ops[Number(el.dataset.k)]; if (!op) return; var f = el.dataset.mo;
      op[f] = f === 'custo' ? (el.value === '' ? '' : num(el.value)) : f === 'margem' ? (el.value === '' ? null : num(el.value)) : el.value;
      if (f === 'custo') el.classList.toggle('orc-zero', !(num(op.custo) > 0));
      orcSave(); mvPaint(q); return;
    }
  });
  admRoot.addEventListener('keydown', function (e) {
    var el = e.target; if (e.key !== 'Enter' || !el.matches || !el.matches('[data-mvs]')) return;
    e.preventDefault(); var key = el.getAttribute('data-mvs'), q = curMQ(), list = hits[key] || [];
    if (!q) return;
    var up = el.value.trim().toUpperCase(), exact = list.filter(function (x) { return x.code === up })[0];
    if (exact || list.length === 1) pickHit(q, key, exact || list[0]);
    else { clearTimeout(sTimer); runSearch(key, el.value); }
  });
  admRoot.addEventListener('change', function (e) {
    var el = e.target, q;
    /* persiana: trocar acionamento redesenha (o rótulo do lado muda) */
    if (el.matches('select[data-f="comando"][data-it]')) { var cq = curQ(), it0 = cq && cq.itens.filter(function (x) { return x.id === el.dataset.it })[0]; if (it0) { it0.motor = el.value === 'motor'; orcSave(); orcRerender(); } return; }
    if (!(q = curMQ())) return;
    if (el.matches('select[data-mq]')) { q[el.dataset.mq] = el.value; orcSave(); if (el.dataset.mq === 'status') orcRerender(); return; }
    if (el.matches('input[type=radio][data-mo="sel"]') && el.checked) { var it = mvItBy(q, el.dataset.it); if (it) { it.sel = Number(el.dataset.k) === 1 ? 1 : 0; orcSave(); orcRerender(); } return; }
  });
  admRoot.addEventListener('click', function (e) {
    var b = e.target.closest('[data-mov]'); if (!b) return;
    var a = b.getAttribute('data-mov'), o = O(), q = curMQ();
    if (!q) { var mm = location.hash.match(/^#\/orcamentos\/moveis\/([\w-]+)/); q = mm && mvBy(mm[1]); }
    if (!q) return;
    if (a === 'wa') { mvWA(q); return; }
    if (a === 'pick') { pickHit(q, b.dataset.key, (hits[b.dataset.key] || [])[Number(b.dataset.i)]); return; }
    if (a === 'jump') { e.preventDefault(); var tg = admRoot.querySelector('#it-' + b.dataset.it); if (tg) tg.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (a === 'dupq') { var c2 = JSON.parse(JSON.stringify(q)), nq = mvNewQuote(); c2.id = nq.id; c2.num = nq.num; c2.status = 'rascunho'; c2.data = today(); o.moveis[0] = c2; orcSave(); location.hash = '#/orcamentos/moveis/' + c2.id; return; }
    if (a === 'delq') { if (confirm('Excluir o orçamento ' + q.num + '?')) { o.moveis = o.moveis.filter(function (x) { return x !== q }); orcSave(); go('#/orcamentos/moveis', 'Orçamento excluído.'); } return; }
    var it = mvItBy(q, b.dataset.it); if (!it) return;
    if (a === 'delit') { if (confirm('Remover este item do orçamento?')) { q.itens.splice(q.itens.indexOf(it), 1); orcSave(); orcRerender(); } return; }
    if (a === 'dupit') { var cp = JSON.parse(JSON.stringify(it)); cp.id = mvNewItem().id; cp.amb = it.amb ? it.amb + ' (cópia)' : ''; q.itens.splice(q.itens.indexOf(it) + 1, 0, cp); orcSave(); orcRerender(); return; }
    if (a === 'delop') { var k = Number(b.dataset.k); it.ops.splice(k, 1); it.sel = 0; orcSave(); orcRerender(); return; }
  });
  admRoot.addEventListener('submit', function (e) {
    var f = e.target.closest('form[data-form="perxcfg"],form[data-form="mvfilter"]'); if (!f) return; e.preventDefault();
    var d = fd(f), c = orcLoad().cfg;
    if (f.getAttribute('data-form') === 'mvfilter') { var q2 = ['q', 'st'].filter(function (x) { return d[x] }).map(function (x) { return x + '=' + encodeURIComponent(d[x]) }).join('&'); go('#/orcamentos/moveis' + (q2 ? '?' + q2 : '')); return; }
    PCFG.forEach(function (x) { if (d[x[0]] !== undefined) c[x[0]] = num(d[x[0]]) });
    orcSave(); orcRerender(); admMsg('Adicionais de persiana salvos. Os orçamentos abertos já foram recalculados.');
  });
