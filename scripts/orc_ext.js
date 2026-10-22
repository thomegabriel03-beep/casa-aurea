  /* =====================================================================
     EXTENSÕES DO PAINEL DE ORÇAMENTOS — entram no orcamentos.js gerado por
     scripts/build_orcamentos.py, depois do módulo da prévia.
     (21/10/2026) ORÇAMENTO ÚNICO: um orçamento só, com itens de quatro tipos
       · Cortina e Persiana (motor de cálculo da prévia / planilha da Camila)
       · Móvel do catálogo (foto, código CA, medidas, custo, até duas opções)
       · Outro (item livre: tapete, jardim vertical por m², papel de parede, serviço…)
     Margem por orçamento, sempre à vista no topo, valendo para todos os tipos
     (cada item pode ter a sua). "Quanto a loja ganha" soma tudo.
     Documento do cliente no padrão da marca, SEM medidas e sem custo/margem/RT.
     As funções da prévia que mudam foram renomeadas pelo build (sufixo 0 ou _previa).
     ===================================================================== */

  /* ---------- configuração ---------- */
  var PCFG = [
    ['pMotor', 'Motor (R$ por persiana)', 'soma quando a persiana é motorizada'],
    ['pCordinha', 'Comando por cordinha (R$ por persiana)', 'acréscimo; 0 se já está no m²'],
    ['pCorrente', 'Comando por correntinha (R$ por persiana)', 'acréscimo sobre o m²'],
    ['pGuia', 'Guia lateral (R$ por metro de altura)', 'o par de guias, por metro'],
    ['pCaixa', 'Caixa box (R$ por metro de largura)', 'caixa que esconde o rolo'],
    ['pBando', 'Bandô (R$ por metro de largura)', 'tampa o rolo'],
    ['pInst', 'Instalação (R$ por persiana)', '']
  ];
  var TIPOS = [['cortina', 'Cortina'], ['persiana', 'Persiana'], ['movel', 'Móvel'], ['outro', 'Outro']];
  var TIPO_L = { cortina: 'Cortina', persiana: 'Persiana', movel: 'Móvel', outro: 'Outro' };
  var UN = [['un', 'un.'], ['m2', 'm²'], ['m', 'm']];
  var SECOES = [['cp', 'Cortinas e persianas'], ['mv', 'Mobiliário'], ['ou', 'Outros itens']];
  var MG_OPTS = [20, 30, 40, 50, 60, 70, 80, 100];
  function catOf(it) { return it.tipo === 'movel' ? 'mv' : it.tipo === 'outro' ? 'ou' : 'cp'; }
  function unTxt(u) { return u === 'm2' ? 'm²' : u === 'm' ? 'm' : 'un.'; }
  function qn(v) { var n = num(v); return br(n, Math.round(n) === n ? 0 : 2); }
  function nid() { return 'i' + Date.now().toString(36) + Math.floor(Math.random() * 999); }

  function orcSeed() {
    var o = orcSeed0();
    Object.assign(o.cfg, { pCordinha: 0, pCorrente: 0, pGuia: 0, pCaixa: 0, mMargem: 0 });
    o.moveis = [];
    return o;
  }

  /* Ao abrir: margem padrão única, orçamentos antigos com a margem que usavam (o preço não muda)
     e orçamentos antigos de móveis (kind 'moveis') convertidos para o orçamento único. */
  function orcUpgrade(o) {
    var c = o.cfg, ch = false;
    if (c.mPadrao == null || c.mPadrao === '') { c.mPadrao = num(c.mMargem) > 0 ? num(c.mMargem) : (c.margem != null ? num(c.margem) : 70); ch = true; }
    var mc = c.margem != null ? num(c.margem) : num(c.mPadrao), mp = c.pMargem != null ? num(c.pMargem) : mc;
    o.quotes.forEach(function (q) {
      if (!Array.isArray(q.itens)) { q.itens = []; ch = true; }
      if (q.margem == null || q.margem === '') {
        var temC = q.itens.some(function (it) { return it.tipo !== 'persiana' }), temP = q.itens.some(function (it) { return it.tipo === 'persiana' });
        q.margem = temC || !temP ? mc : mp;
        q.itens.forEach(function (it) {
          if (it.margem != null && it.margem !== '') return;
          var g = it.tipo === 'persiana' ? mp : mc;
          it.margem = g !== num(q.margem) ? g : null;
        });
        ch = true;
      }
    });
    (o.moveis || []).forEach(function (m) {
      if (o.quotes.some(function (q) { return q.id === m.id })) return;
      var n = JSON.parse(JSON.stringify(m));
      n.cliente = Object.assign({ nome: '', tel: '', end: '', email: '', arq: '' }, n.cliente || {});
      n.itens = (n.itens || []).map(function (it) { it.tipo = 'movel'; it.ops = it.ops || []; return it; });
      if (n.margem == null || n.margem === '') n.margem = num(c.mMargem);
      n.origem = 'moveis';
      o.quotes.push(n); ch = true;
    });
    o.moveis = [];
    o.quotes.sort(function (a, b) { return String(b.data).localeCompare(String(a.data)) || String(b.num).localeCompare(String(a.num)) });
    if (ch) setTimeout(scheduleSave, 0);
  }

  /* ---------- margem (uma regra para todos os tipos) ---------- */
  function cfgPad() { return num(orcLoad().cfg.mPadrao); }
  function qMarg(q) { return q && q.margem != null && q.margem !== '' ? num(q.margem) : cfgPad(); }
  function itMarg(it, q) { return it && it.margem != null && it.margem !== '' ? num(it.margem) : qMarg(q); }
  function rtOf(q) { return num(q && q.rt != null ? q.rt : orcLoad().cfg.rt); }
  function multOf(mg, q) { return (1 + mg / 100) * (1 + rtOf(q) / 100); }

  /* ---------- cortina (fórmula da planilha; margem do orçamento ou do item) ---------- */
  function calcCortina(it, q) {
    var c = orcLoad().cfg, L = num(it.L), H = num(it.H), barra = it.barra === '' || it.barra == null ? c.barra : num(it.barra), qtd = Math.max(1, num(it.qtd) || 1);
    var Ht = H + barra + num(c.sobra), tr = trBy(it.trilho), F = num(c.mo) + num(c.inst) + num(c.presilha) + num(tr.preco);
    var tc = tecBy(it.tec), fo = tecBy(it.forro || c.forro), bk = tecBy(it.bk || c.bk);
    var bkL = bk && num(bk.larg) ? num(bk.larg) : num(c.bkLarg) || 2.8, panos = L > 0 ? Math.ceil(L * num(c.bkFranz || 1.5) / bkL - 1e-9) : 0;
    var qn2 = { c: L * Ht, f: L * Ht, b: panos * Ht }, pr = { c: tc ? num(tc.preco) : 0, f: fo ? num(fo.preco) : 0, b: bk ? num(bk.preco) : 0 };
    var lay = {}; ['c', 'f', 'b'].forEach(function (k) { lay[k] = pr[k] * qn2[k] + F * L });
    var motUnit = num(c.motKit) + num(c.motInst) + Math.max(0, num(c.motTrilho) - num(tr.preco)) * L;
    var mg = itMarg(it, q), mult = multOf(mg, q), out = {};
    Object.keys(COMP).forEach(function (k) {
      var ls = COMP[k][1], cost = ls.reduce(function (s, x) { return s + lay[x] }, 0);
      var nm = it.motor === 'duas' ? Math.min(2, ls.length) : it.motor === 'uma' ? 1 : 0; cost += nm * motUnit;
      var venda = cost * mult; out[k] = { custo: cost * qtd, bruto: venda * qtd, venda: roundUp(venda * qtd, c.arred) };
    });
    return { o: out, Ht: Ht, qn: qn2, panos: panos, F: F, tc: tc, fo: fo, bk: bk, tr: tr, qtd: qtd, ok: !!(L > 0 && H > 0 && tc), motUnit: motUnit, mg: mg };
  }
  function lucroDe(venda, custo, q) { return venda / (1 + rtOf(q) / 100) - custo; }
  function resCortina(it, q) {
    var r = calcCortina(it, q), c = orcLoad().cfg;
    if (!r.ok) return '<p class="adm-note orc-wait">' + (!r.tc && it.tecname ? 'Tecido “' + esc(it.tecname) + '” não está cadastrado. <a href="#/orcamentos/tecidos">Cadastrar</a>' : 'Informe largura, altura e tecido para ver os valores.') + '</p>';
    return Object.keys(COMP).map(function (k) {
      var o = r.o[k], on = (it.comp || 'cortina') === k;
      return '<label class="orc-tile' + (on ? ' on' : '') + '"><input type="radio" name="comp-' + it.id + '" value="' + k + '" data-f="comp" data-it="' + it.id + '"' + (on ? ' checked' : '') + '><span class="t">' + COMP[k][0] + '</span><strong>' + rs(o.venda) + '</strong><small>custo ' + rs(o.custo) + ' · lucro ' + rs(lucroDe(o.venda, o.custo, q)) + '</small></label>';
    }).join('') +
      '<details class="orc-calc"><summary>Ver cálculo</summary><ul>' +
      '<li>Altura total: ' + br(num(it.H)) + ' + barra ' + br(it.barra === '' || it.barra == null ? c.barra : num(it.barra)) + ' + entretela e sobra ' + br(c.sobra) + ' = <b>' + br(r.Ht) + ' m</b></li>' +
      '<li>Tecido (' + esc(r.tc.nome) + ', ' + rs(r.tc.preco) + '/m): ' + br(num(it.L)) + ' × ' + br(r.Ht) + ' = <b>' + br(r.qn.c) + ' m</b></li>' +
      '<li>Forro (' + esc(r.fo ? r.fo.nome : '—') + '): <b>' + br(r.qn.f) + ' m</b> · Blackout (' + esc(r.bk ? r.bk.nome : '—') + '): ' + r.panos + ' pano(s) de ' + br(r.bk && r.bk.larg || c.bkLarg) + ' m × ' + br(r.Ht) + ' = <b>' + br(r.qn.b) + ' m</b></li>' +
      '<li>Por metro de largura e camada: mão de obra + instalação + presilhas + ' + esc(r.tr.nome.toLowerCase()) + ' = <b>' + rs(r.F) + '</b></li>' +
      (it.motor !== 'nao' ? '<li>Motor por camada: kit + instalação + diferença do trilho motorizado = <b>' + rs(r.motUnit) + '</b></li>' : '') +
      '<li>Venda = custo × (1 + margem ' + br(r.mg, 0) + '%' + (it.margem != null && it.margem !== '' ? ' deste item' : ' do orçamento') + ') × (1 + RT ' + br(rtOf(q), 0) + '%)' + (r.qtd > 1 ? ' × ' + r.qtd + ' janelas' : '') + ', arredondado para cima a cada ' + rs(c.arred) + '</li></ul></details>';
  }

  /* ---------- persiana ---------- */
  var ACION = [['cordinha', 'Cordinha'], ['corrente', 'Correntinha'], ['motor', 'Motorizada']];
  var LADO = [['direito', 'Direito'], ['esquerdo', 'Esquerdo']];
  function acionOf(it) { return it.comando === 'motor' || it.comando === 'corrente' || it.comando === 'cordinha' ? it.comando : (it.motor ? 'motor' : 'cordinha'); }
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
    var mg = itMarg(it, q), mult = multOf(mg, q);
    return { m: m, area: area, real: L * H, qtd: qtd, parts: p, zeros: zeros, ac: ac, mult: mult, mg: mg,
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
    li.push('<li>Venda = custo × (1 + margem ' + br(p.mg, 0) + '%' + (it.margem != null && it.margem !== '' ? ' deste item' : ' do orçamento') + ') × (1 + RT ' + br(rtOf(q), 0) + '%)' + (p.qtd > 1 ? ' × ' + p.qtd + ' persianas' : '') + ', arredondado para cima a cada ' + rs(c.arred) + '</li>');
    return '<div class="orc-pres"><div><p class="adm-note">Valor de venda</p><p class="orc-big">' + rs(p.venda) + '</p></div><p class="adm-note">custo ' + rs(p.custo) + ' · lucro ' + rs(lucroDe(p.venda, p.custo, q)) + '</p></div>' + warn +
      '<details class="orc-calc"><summary>Ver cálculo</summary><ul>' + li.join('') + '</ul></details>';
  }

  /* ---------- móvel do catálogo (até duas opções "esta ou esta") ---------- */
  var M9 = STORE.m9 !== false;
  function mvMarg(op, q) { return op.margem === '' || op.margem == null ? qMarg(q) : num(op.margem); }
  function mvOp(op, it, q) {
    var c = orcLoad().cfg, qtd = Math.max(1, num(it.qtd) || 1), custo = num(op.custo), mg = mvMarg(op, q), rt = 1 + rtOf(q) / 100;
    var unit = custo > 0 ? roundUp(custo * (1 + mg / 100) * rt, c.arred) : 0;
    return { unit: unit, total: unit * qtd, custo: custo * qtd, lucro: (unit / rt - custo) * qtd, mg: mg, ok: custo > 0, qtd: qtd };
  }
  function mvSel(it) { return it.ops && it.ops.length > 1 && it.sel === 1 ? 1 : 0; }
  function mvItem(it, q) { var op = (it.ops || [])[mvSel(it)]; if (!op) return { total: 0, custo: 0, lucro: 0, ok: false }; return mvOp(op, it, q); }

  /* ---------- outro (item livre) ---------- */
  function calcOutro(it, q) {
    var c = orcLoad().cfg, qtd = num(it.qtd) > 0 ? num(it.qtd) : 1, custo = num(it.custo), mg = itMarg(it, q), rt = 1 + rtOf(q) / 100;
    var unit = custo > 0 ? roundUp(custo * (1 + mg / 100) * rt, c.arred) : 0;
    return { unit: unit, total: unit * qtd, custo: custo * qtd, lucro: (unit / rt - custo) * qtd, mg: mg, qtd: qtd, ok: custo > 0 };
  }

  /* ---------- valores: um item e o orçamento inteiro ---------- */
  function itemVal(it, q) {
    var v;
    if (it.tipo === 'movel') { var a = mvItem(it, q); v = { venda: a.ok ? a.total : 0, custo: a.ok ? a.custo : 0, ok: a.ok }; }
    else if (it.tipo === 'outro') { var b = calcOutro(it, q); v = { venda: b.ok ? b.total : 0, custo: b.ok ? b.custo : 0, ok: b.ok }; }
    else if (it.tipo === 'persiana') { var p = calcPersiana(it, q); v = { venda: p.ok ? p.venda : 0, custo: p.ok ? p.custo : 0, ok: p.ok }; }
    else { var r = calcCortina(it, q), o = r.o[it.comp || 'cortina']; v = { venda: r.ok ? o.venda : 0, custo: r.ok ? o.custo : 0, ok: r.ok }; }
    var rtm = 1 + rtOf(q) / 100;
    v.rtv = v.venda - v.venda / rtm; v.lucro = v.venda / rtm - v.custo;
    return v;
  }
  function qTot(q) {
    var t = 0, c = 0, l = 0, r = 0, ok = q.itens.length > 0, cat = { cp: 0, mv: 0, ou: 0 };
    q.itens.forEach(function (it) { var v = itemVal(it, q); t += v.venda; c += v.custo; l += v.lucro; r += v.rtv; cat[catOf(it)] += v.venda; if (!v.ok) ok = false; });
    var cfg = orcLoad().cfg, desc = q.desc != null && q.desc !== '' ? num(q.desc) : num(cfg.desc);
    var av = q.avista != null && q.avista !== '' ? num(q.avista) : Math.floor(t * (1 - desc / 100) / 10) * 10;
    return { total: t, custo: c, lucro: l, rt: r, lucroAv: av - r * (t ? av / t : 0) - c, avista: av, desc: desc, ok: ok, cat: cat };
  }

  /* ---------- novos itens e orçamentos ---------- */
  function newItem(tipo) {
    if (tipo === 'movel') return { id: nid(), tipo: 'movel', amb: '', qtd: 1, sel: 0, ops: [] };
    if (tipo === 'outro') return { id: nid(), tipo: 'outro', amb: '', desc: '', qtd: 1, un: 'un', custo: '', margem: null };
    var it = newItem0(tipo);
    it.margem = null;
    if (tipo === 'persiana') { it.comando = 'cordinha'; it.lado = 'direito'; it.guia = false; it.caixa = false; it.motor = false; }
    return it;
  }
  function newQuote() {
    var o = orcLoad(), c = o.cfg, y = String(new Date().getFullYear());
    var n = o.quotes.reduce(function (m, q) { var p = String(q.num).split('-'); return p[0] === 'ORC' && p[1] === y ? Math.max(m, Number(p[2]) || 0) : m }, 0) + 1;
    var q = { id: 'q' + Date.now().toString(36), num: 'ORC-' + y + '-' + ('00' + n).slice(-3), status: 'rascunho', data: today(), consultora: 'Camila',
      cliente: { nome: '', tel: '', end: '', email: '', arq: '' }, margem: num(c.mPadrao), rt: c.rt, desc: c.desc, avista: null, prazo: c.prazo, obs: '', itens: [] };
    o.quotes.unshift(q); orcSave(); return q;
  }
  function autoDesc(it, q) {
    if (it.tipo === 'persiana') return perDesc(it);
    if (it.tipo === 'movel') { var op = (it.ops || [])[mvSel(it)]; return op ? op.nome + (op.code ? ' (' + op.code + ')' : '') : 'Móvel (escolha a peça)'; }
    if (it.tipo === 'outro') return 'Item';
    return autoDesc0(it, q);
  }
  /* no documento do cliente nada de medida: tira a barra da descrição automática */
  function descClient(it, q) {
    if (it.desc && it.desc.trim()) return it.desc;
    return autoDesc(it, q).replace(/ com barra de [\d.,]+( ?m)?/i, '');
  }
  function itName(it, q) {
    if (it.tipo === 'outro') return String(it.desc || '').trim() || 'Outro item';
    if (it.tipo === 'movel') { var op = (it.ops || [])[mvSel(it)]; return op ? op.nome : 'Móvel'; }
    return TIPO_L[it.tipo] || 'Item';
  }
  function plural(n, s, p) { return n + ' ' + (n === 1 ? s : p); }
  function mixTxt(q) {
    var c = { cortina: 0, persiana: 0, movel: 0, outro: 0 };
    q.itens.forEach(function (it) { c[it.tipo in c ? it.tipo : 'cortina']++ });
    var a = [];
    if (c.cortina) a.push(plural(c.cortina, 'cortina', 'cortinas'));
    if (c.persiana) a.push(plural(c.persiana, 'persiana', 'persianas'));
    if (c.movel) a.push(plural(c.movel, 'móvel', 'móveis'));
    if (c.outro) a.push(plural(c.outro, 'outro', 'outros'));
    return a.join(' · ') || 'sem itens';
  }

  /* ---------- telas: abas, lista ---------- */
  function orcTabs(path) {
    var tabs = [['#/orcamentos', 'Orçamentos'], ['#/orcamentos/tecidos', 'Tecidos'], ['#/orcamentos/persianas', 'Persianas'], ['#/orcamentos/precos', 'Preços e regras']];
    return '<nav class="adm-tabs" aria-label="Orçamentos">' + tabs.map(function (t) {
      var a = t[0] === '#/orcamentos' ? !/^#\/orcamentos\/(tecidos|persianas|precos)/.test(path) : path.indexOf(t[0]) === 0;
      return '<a href="' + t[0] + '"' + (a ? ' aria-current="page"' : '') + '>' + t[1] + '</a>';
    }).join('') + '<a href="/admin/orcamentos/custos">Custos das peças</a></nav>';
  }
  function vOrcList(h) {
    var o = orcLoad(), f = qs(h), st = f.st || '', qq = norm(f.q || '');
    var list = o.quotes.filter(function (q) {
      return (!st || q.status === st) && (!qq || norm(q.num + ' ' + q.cliente.nome + ' ' + q.itens.map(function (i) { return (i.amb || '') + ' ' + (i.desc || '') + ' ' + (i.ops || []).map(function (p) { return p.code + ' ' + p.nome }).join(' ') }).join(' ')).indexOf(qq) > -1);
    });
    var mes = today().slice(0, 7), doMes = o.quotes.filter(function (q) { return String(q.data).slice(0, 7) === mes }),
      tot = function (a) { return a.reduce(function (s, q) { return s + qTot(q).total }, 0) }, apr = o.quotes.filter(function (q) { return q.status === 'aprovado' });
    var conv = o.quotes.filter(function (q) { return q.status === 'aprovado' || q.status === 'perdido' }).length;
    return head('Orçamentos', 'Cortinas, persianas, móveis do catálogo e outros itens no mesmo orçamento, com a margem à vista.', '<a class="adm-btn" href="#/orcamentos/novo">Novo orçamento</a>') + orcTabs('#/orcamentos') +
      '<div class="adm-grid c4 orc-kpis">' + [['Orçamentos no mês', doMes.length, ''], ['Valor orçado no mês', rs(tot(doMes)), ''], ['Aprovados', apr.length, rs(tot(apr))], ['Taxa de fechamento', conv ? Math.round(apr.length / conv * 100) + '%' : '—', 'aprovados ÷ decididos']].map(function (s) { return '<div class="adm-card"><p class="adm-note">' + s[0] + '</p><p class="adm-stat">' + s[1] + '</p>' + (s[2] ? '<p class="adm-note" style="margin-top:.35rem">' + s[2] + '</p>' : '') + '</div>' }).join('') + '</div>' +
      '<form class="orc-filter" data-form="orcfilter" role="search"><input type="search" name="q" value="' + esc(f.q || '') + '" placeholder="Cliente, número, ambiente ou peça" aria-label="Buscar orçamento"><select name="st" aria-label="Status"><option value="">Todos os status</option>' + Object.keys(OST).map(function (k) { return opt(k, OST[k][0], st) }).join('') + '</select><button class="adm-btn ghost">Filtrar</button></form>' +
      (list.length ? '<div class="adm-table-wrap"><table class="adm-table orc-list"><thead><tr><th>Número</th><th>Cliente</th><th>Data</th><th>Itens</th><th>Total</th><th>Margem</th><th>Status</th><th></th></tr></thead><tbody>' +
        list.map(function (q) {
          var t = qTot(q);
          return '<tr><td class="adm-code"><a href="#/orcamentos/' + q.id + '">' + esc(q.num) + '</a></td><td>' + esc(q.cliente.nome || 'Sem nome') + '</td><td>' + esc(String(q.data).split('-').reverse().join('/')) + '</td><td class="orc-mix">' + esc(mixTxt(q)) + '</td><td>' + rs(t.total) + '</td><td>' + br(qMarg(q), 0) + '%</td><td>' + bdg(OST, q.status) + '</td><td style="white-space:nowrap"><a class="adm-btn ghost sm" href="#/orcamentos/' + q.id + '">Abrir</a> <a class="adm-btn ghost sm" href="#/orcamentos/' + q.id + '/documento">Documento</a></td></tr>';
        }).join('') + '</tbody></table></div>' :
        '<div class="adm-card adm-empty">Nenhum orçamento' + (st || qq ? ' com esse filtro' : ' ainda') + '. <a href="#/orcamentos/novo">Criar o primeiro</a></div>');
  }

  /* ---------- editor: itens ---------- */
  function itTop(it, q, i) {
    var a = ' data-it="' + it.id + '"', own = it.margem != null && it.margem !== '';
    return '<div class="orc-it-top"><span class="orc-it-n">' + (i + 1) + '</span>' +
      '<div class="adm-seg orc-tipo" role="group" aria-label="Tipo do item ' + (i + 1) + '">' + TIPOS.map(function (t) { return '<button type="button" data-orc="tipo2"' + a + ' data-v="' + t[0] + '" aria-pressed="' + (it.tipo === t[0]) + '">' + t[1] + '</button>' }).join('') + '</div>' +
      (it.tipo !== 'movel' ? '<label class="orc-itmg' + (own ? ' own' : '') + '" title="Margem deste item. Vazio = margem do orçamento."><span>Margem</span>' + numIn('data-x="margem"' + a, it.margem, ' placeholder="' + esc(br(qMarg(q), 0)) + '" aria-label="Margem deste item (%), vazio = margem do orçamento"') + '<span>%</span></label>' : '') +
      '<span class="orc-it-val" data-out="val' + it.id + '"></span><button type="button" class="adm-btn ghost sm" data-orc="dupit"' + a + '>Duplicar</button><button type="button" class="adm-btn danger sm" data-orc="delit"' + a + ' aria-label="Remover item ' + (i + 1) + '">Remover</button></div>';
  }
  function vItem(it, q, i) {
    if (it.tipo === 'movel') return vMovItem(it, q, i);
    if (it.tipo === 'outro') return vOutroItem(it, q, i);
    var h = vItem0(it, q, i).replace(/<div class="orc-it-top">[\s\S]*?>Remover<\/button><\/div>/, function () { return itTop(it, q, i) })
      .replace('class="adm-card orc-item"', 'class="adm-card orc-item" data-tipo="' + it.tipo + '"');
    if (it.tipo === 'persiana') h = h.replace(/<div class="adm-checks orc-opts">[\s\S]*?<\/div>/, function () { return perOpts(it) });
    return h;
  }
  function vOutroItem(it, q, i) {
    var a = ' data-it="' + it.id + '"', u = it.un || 'un';
    return '<article class="adm-card orc-item" data-tipo="outro" id="it-' + it.id + '">' + itTop(it, q, i) +
      '<div class="orc-row ou-r1">' + field('Ambiente', '<input type="text" list="orcAmb" data-f="amb"' + a + ' value="' + esc(it.amb || '') + '" placeholder="Varanda, Sala…">') +
      field('Descrição no orçamento', '<input type="text" list="orcOutros" data-x="desc"' + a + ' value="' + esc(it.desc || '') + '" placeholder="Ex.: Jardim vertical natural com irrigação">') + '</div>' +
      '<div class="orc-row r3">' + field('Quantidade', numIn('data-x="qtd"' + a, it.qtd, ' placeholder="1"')) +
      field('Unidade', '<select data-x="un"' + a + '>' + UN.map(function (x) { return opt(x[0], x[1], u) }).join('') + '</select>') +
      field('Custo por ' + unTxt(u).replace('.', '') + ' (R$)', numIn('data-x="custo"' + a, it.custo, ' placeholder="0,00"' + (num(it.custo) > 0 ? '' : ' class="orc-zero"')), 'só no painel') + '</div>' +
      '<p class="mv-op-res" data-out="res' + it.id + '">' + resOutro(it, q) + '</p></article>';
  }
  function resOutro(it, q) {
    var v = calcOutro(it, q), u = unTxt(it.un);
    if (!v.ok) return '<span class="orc-zero-note">Informe o custo para calcular o preço.</span>';
    return '<b>' + rs(v.unit) + '</b> por ' + u + (v.qtd !== 1 || it.un !== 'un' ? ' · ' + rs(v.total) + ' (' + qn(v.qtd) + ' ' + u + ')' : '') +
      ' <span class="mv-int">custo ' + rs(v.custo) + ' · margem ' + br(v.mg, 0) + '% · lucro ' + rs(v.lucro) + '</span>';
  }
  function mvSearch(key, ph) {
    return '<div class="mv-search"><input type="search" data-mvs="' + key + '" placeholder="' + esc(ph) + '" autocomplete="off" aria-label="' + esc(ph) + '"><div class="mv-sug" data-out="sug-' + key + '" role="listbox"></div></div>';
  }
  function mvFind(key, ph) {
    return '<div class="mv-find">' + mvSearch(key, ph) + '<button type="button" class="adm-btn ghost" data-mov="lista" data-key="' + key + '">Ver lista de móveis</button></div>' +
      (M9 ? '' : '<p class="orc-zero-note">Custos das peças indisponíveis até rodar a migração 0009; informe o custo à mão.</p>');
  }
  function mvOpCard(op, it, q, k) {
    var a = ' data-it="' + it.id + '" data-k="' + k + '"', on = mvSel(it) === k;
    return '<div class="mv-op' + (it.ops.length > 1 && on ? ' on' : '') + '">' +
      (op.foto ? '<img src="' + esc(op.foto) + '" alt="" loading="lazy">' : '<span class="mv-nofoto" aria-hidden="true">sem foto</span>') +
      '<div class="mv-op-b"><div class="mv-op-h"><p class="mv-op-l">Opção ' + (k + 1) + '</p>' +
      (it.ops.length > 1 ? '<label class="adm-check mv-sel"><input type="radio" name="sel-' + it.id + '" data-mo="sel"' + a + (on ? ' checked' : '') + '> entra no total</label>' : '') +
      '<button type="button" class="orc-link" data-mov="delop"' + a + '>remover</button></div>' +
      '<p class="mv-op-n">' + esc(op.nome) + ' <span class="adm-code">' + esc(op.code) + '</span></p>' +
      '<div class="orc-row r3 mv-row3">' + field('Medidas', '<input type="text" data-mo="medidas"' + a + ' value="' + esc(op.medidas || '') + '" placeholder="L × P × A cm">') +
      field('Custo unitário (R$)', numIn('data-mo="custo"' + a, op.custo, ' placeholder="0,00"' + (num(op.custo) > 0 ? '' : ' class="orc-zero"')), num(op.custo) > 0 ? (op.custo0 != null && num(op.custo0) !== num(op.custo) ? 'cadastro: ' + rs(op.custo0) : 'do cadastro') : 'sem custo cadastrado') +
      field('Margem (%)', numIn('data-mo="margem"' + a, op.margem, ' placeholder="' + esc(br(qMarg(q), 0)) + '"'), 'vazio = margem do orçamento') + '</div>' +
      '<p class="mv-op-res" data-out="mvop-' + it.id + '-' + k + '">' + mvOpRes(op, it, q) + '</p></div></div>';
  }
  function mvOpRes(op, it, q) {
    var v = mvOp(op, it, q);
    if (!v.ok) return '<span class="orc-zero-note">Informe o custo para calcular o preço.</span>';
    return '<b>' + rs(v.unit) + '</b> cada' + (v.qtd > 1 ? ' · ' + rs(v.total) + ' (' + v.qtd + ' un.)' : '') + ' <span class="mv-int">custo ' + rs(v.custo) + ' · margem ' + br(v.mg, 0) + '% · lucro ' + rs(v.lucro) + '</span>' +
      (op.preco != null && num(op.preco) > 0 ? ' <span class="mv-int">· tabela ' + rs(op.preco) + '</span>' : '');
  }
  function vMovItem(it, q, i) {
    var a = ' data-it="' + it.id + '"';
    return '<article class="adm-card orc-item mv-item" data-tipo="movel" id="it-' + it.id + '">' + itTop(it, q, i) +
      '<div class="orc-row r2 mv-row">' + field('Ambiente / grupo', '<input type="text" list="orcAmb" data-f="amb"' + a + ' value="' + esc(it.amb || '') + '" placeholder="Sala de jantar, Varanda…">') + field('Quantidade', numIn('data-f="qtd"' + a, it.qtd)) + '</div>' +
      (it.ops.length ? '<div class="mv-ops">' + it.ops.map(function (op, k) { return (k ? '<p class="mv-ou">ou</p>' : '') + mvOpCard(op, it, q, k) }).join('') + '</div>' : '') +
      (it.ops.length < 2 ? mvFind(it.id, it.ops.length ? 'Opção 2 (esta ou esta): código ou nome da peça' : 'Código da peça (CA-MES-0167) ou nome') : '') + '</article>';
  }

  /* ---------- editor: margem no topo, resumo, tela ---------- */
  function mgPadTxt(q) {
    var m = qMarg(q), pad = cfgPad();
    return 'Vale para cortinas, persianas, móveis e outros itens; item com margem própria mantém a dele. ' +
      (m !== pad ? '<button type="button" class="orc-link" data-mov="mgpad">Usar ' + br(m, 0) + '% como padrão nos próximos orçamentos</button>' : '<span>Padrão dos novos orçamentos: ' + br(pad, 0) + '%.</span>');
  }
  function vMgBar(q) {
    var m = qMarg(q);
    return '<section class="adm-card orc-mgbar" aria-label="Margem e condições do orçamento"><div class="orc-mgbar-r">' +
      '<div class="orc-mg-main"><p class="mv-mg-l">Margem do orçamento</p><div class="mv-mg-chips" role="group" aria-label="Margem do orçamento">' +
      MG_OPTS.map(function (v) { return '<button type="button" class="mv-chip' + (m === v ? ' on' : '') + '" data-mov="mg" data-v="' + v + '" aria-pressed="' + (m === v) + '">' + v + '%</button>' }).join('') +
      '<label class="orc-mg-free"><span class="sr">Outra margem (%)</span>' + numIn('data-qm="margem"', q.margem, ' aria-label="Margem do orçamento (%)"') + '<span aria-hidden="true">%</span></label></div></div>' +
      '<div class="orc-mg-f">' + field('RT arquiteto (%)', numIn('data-q="rt"', q.rt)) + field('Desc. à vista (%)', numIn('data-q="desc"', q.desc == null ? '' : q.desc)) + '</div></div>' +
      '<p class="mv-mg-n" data-out="mgpad">' + mgPadTxt(q) + '</p></section>';
  }
  function vSummary(q) {
    var t = qTot(q), nc = SECOES.filter(function (s) { return q.itens.some(function (it) { return catOf(it) === s[0] }) });
    return (q.itens.length ? '<div class="orc-sum-list">' + q.itens.map(function (it, i) {
      var v = itemVal(it, q);
      return '<a href="#it-' + it.id + '" data-orc="jump" data-it="' + it.id + '"><span><i class="orc-tag">' + TIPO_L[it.tipo] + '</i>' + (i + 1) + '. ' + esc(it.amb || itName(it, q)) + '</span><b>' + (v.ok ? rs(v.venda) : '—') + '</b></a>';
    }).join('') + '</div>' : '<p class="adm-note" style="margin-bottom:.75rem">Nenhum item ainda.</p>') +
      (nc.length > 1 ? '<dl class="orc-sum-cat">' + nc.map(function (s) { return '<div><dt>' + s[1] + '</dt><dd>' + rs(t.cat[s[0]]) + '</dd></div>' }).join('') + '</dl>' : '') +
      '<div class="orc-sum-tot"><span>Total</span><strong>' + rs(t.total) + '</strong></div>' +
      field('Valor à vista', numIn('data-q="avista"', q.avista, ' placeholder="' + esc(br(t.avista)) + '"'), 'em branco = total − ' + br(t.desc, t.desc % 1 ? 1 : 0) + '%, arredondado') +
      '<div class="orc-sum-av"><span>À vista</span><strong>' + rs(t.avista) + '</strong></div>' +
      '<div class="mv-gain"><p class="mv-gain-l">Quanto a loja ganha <span>interno</span></p>' +
      '<p class="mv-gain-v' + (t.lucro < 0 ? ' neg' : '') + '">' + rs(t.lucro) + '</p>' +
      '<p class="mv-gain-s">' + (t.total ? Math.round(t.lucro / t.total * 100) + '% do valor de venda · ' : '') + 'sem a RT · margem ' + br(qMarg(q), 0) + '%</p>' +
      '<dl><div><dt>Custo total</dt><dd>' + rs(t.custo) + '</dd></div>' +
      '<div><dt>RT do arquiteto (' + br(rtOf(q), 0) + '%)</dt><dd>' + rs(t.rt) + '</dd></div>' +
      '<div><dt>Ganho se pagar à vista</dt><dd>' + rs(t.lucroAv) + '</dd></div></dl></div>' +
      (qMarg(q) === 0 ? '<p class="orc-zero-note">Margem do orçamento em 0%: o preço está igual ao custo.</p>' : '');
  }
  var AMB = ['Sala', 'Sala de estar', 'Sala de jantar', 'Sacada', 'Varanda', 'Área externa', 'Divisória', 'Cozinha', 'Lavanderia', 'Escritório', 'Home office', 'Home theater', 'Suíte master', 'Suíte 01', 'Suíte 02', 'Suíte 03', 'Quarto', 'Banheiro', 'Hall', 'Jardim'];
  var OUTROS = ['Tapete sob medida', 'Jardim vertical', 'Papel de parede', 'Instalação', 'Frete e montagem', 'Iluminação', 'Almofadas e mantas', 'Serviço de decoração'];
  function vOrcEdit(id) {
    var q = qBy(id); if (!q) return head('Orçamento não encontrado', '') + '<a class="adm-btn" href="#/orcamentos">Voltar</a>';
    var o = orcLoad(), cl = q.cliente;
    return head(esc(q.num), 'Orçamento · ' + bdg(OST, q.status) + ' · <span data-out="mix">' + esc(mixTxt(q)) + '</span>', '<a class="adm-btn ghost" href="#/orcamentos">Todos</a><a class="adm-btn" href="#/orcamentos/' + q.id + '/documento">Ver orçamento do cliente</a>') + orcTabs('#/orcamentos') +
      '<datalist id="orcAmb">' + AMB.map(function (a) { return '<option value="' + a + '">' }).join('') + '</datalist>' +
      '<datalist id="orcTec">' + o.tecidos.filter(function (t) { return t.cat === 'tecido' }).map(function (t) { return '<option value="' + esc(t.nome) + '">' + rs(t.preco) + '/m</option>' }).join('') + '</datalist>' +
      '<datalist id="orcOutros">' + OUTROS.map(function (a) { return '<option value="' + a + '">' }).join('') + '</datalist>' +
      '<div class="orc-ed" data-q-id="' + q.id + '"><div class="orc-main">' + vMgBar(q) +
      acard('Cliente', '<div class="orc-row r3">' + field('Nome', '<input type="text" data-c="nome" value="' + esc(cl.nome) + '" placeholder="Nome do cliente">') + field('Telefone / WhatsApp', '<input type="text" inputmode="tel" data-c="tel" value="' + esc(cl.tel) + '" placeholder="(48) 9…">') + field('Consultora', '<select data-q="consultora">' + ['Camila', 'Rafa'].map(function (x) { return opt(x, x, q.consultora) }).join('') + '</select>') + '</div>' +
        '<div class="orc-row r3">' + field('Endereço da obra', '<input type="text" data-c="end" value="' + esc(cl.end) + '">') + field('Arquiteto(a) / indicação', '<input type="text" data-c="arq" value="' + esc(cl.arq) + '" placeholder="Opcional">') + field('Status', '<select data-q="status">' + Object.keys(OST).map(function (k) { return opt(k, OST[k][0], q.status) }).join('') + '</select>') + '</div>' +
        '<div class="orc-row r3">' + field('Data', '<input type="date" data-q="data" value="' + esc(q.data) + '">') + field('Prazo de entrega', '<input type="text" data-q="prazo" value="' + esc(q.prazo || '') + '">') + '<div></div></div>') +
      '<div class="orc-items">' + q.itens.map(function (it, i) { return vItem(it, q, i) }).join('') + '</div>' +
      '<section class="adm-card orc-addbox"><h2>Adicionar item</h2><div class="orc-add" role="group" aria-label="Tipo do novo item">' +
      '<button type="button" class="adm-btn" data-orc="add" data-v="cortina">+ Cortina</button><button type="button" class="adm-btn" data-orc="add" data-v="persiana">+ Persiana</button>' +
      '<button type="button" class="adm-btn" data-orc="add" data-v="movel">+ Móvel do catálogo</button><button type="button" class="adm-btn" data-orc="add" data-v="outro">+ Outro item</button></div>' +
      '<p class="adm-note orc-add-l">Ou adicione um móvel direto pelo código ou nome (Enter adiciona quando só uma peça aparece):</p>' + mvFind('new', 'Código da peça (CA-MES-0167) ou nome') +
      '<p class="adm-note orc-add-h">“Outro item” serve para tapete, jardim vertical (por m²), papel de parede, instalação ou serviço.</p></section>' +
      acard('Observações no orçamento', '<textarea data-q="obs" rows="3" placeholder="Ex.: medidas conferidas na visita técnica; entrega e montagem inclusas.">' + esc(q.obs || '') + '</textarea>') +
      '</div><aside class="orc-side"><section class="adm-card orc-sum"><h2>Resumo</h2><div data-out="sum">' + vSummary(q) + '</div>' +
      '<div class="orc-side-act"><a class="adm-btn" href="#/orcamentos/' + q.id + '/documento">Ver orçamento do cliente</a><button type="button" class="adm-btn ghost" data-orc="wa">Enviar resumo no WhatsApp</button><button type="button" class="adm-btn ghost" data-orc="dupq">Duplicar orçamento</button><button type="button" class="adm-btn danger" data-orc="delq">Excluir</button></div></section></aside></div>' +
      WA_DLG;
  }
  var WA_DLG = '<dialog id="orcWa" class="orc-dlg"><div class="adm-card"><h2>Enviar no WhatsApp</h2><p class="adm-note">Se o WhatsApp não abriu sozinho, use o link ou copie a mensagem.</p><textarea id="orcWaTxt" rows="9" readonly></textarea><div class="adm-actions"><a class="adm-btn" id="orcWaGo" target="_blank" rel="noopener">Abrir WhatsApp</a><button type="button" class="adm-btn ghost" data-orc="wacopy">Copiar mensagem</button><button type="button" class="adm-btn ghost" data-orc="waclose">Fechar</button></div></div></dialog>';

  /* atualização ao vivo, sem redesenhar a tela (o cursor não sai do campo) */
  function orcPaint(q) {
    if (!admRoot.querySelector('.orc-ed')) return;
    var qm = qMarg(q);
    q.itens.forEach(function (it) {
      if (it.tipo === 'movel') {
        (it.ops || []).forEach(function (op, k) { var el = admRoot.querySelector('[data-out="mvop-' + it.id + '-' + k + '"]'); if (el) el.innerHTML = mvOpRes(op, it, q); });
        admRoot.querySelectorAll('[data-mo="margem"][data-it="' + it.id + '"]').forEach(function (el) { el.placeholder = br(qm, 0) });
      } else {
        var r = admRoot.querySelector('[data-out="res' + it.id + '"]'), op = r && r.querySelector('details[open]');
        if (r) { r.innerHTML = it.tipo === 'persiana' ? resPersiana(it, q) : it.tipo === 'outro' ? resOutro(it, q) : resCortina(it, q); if (op && r.querySelector('details')) r.querySelector('details').open = true; }
        var mi = admRoot.querySelector('[data-x="margem"][data-it="' + it.id + '"]'); if (mi) mi.placeholder = br(qm, 0);
      }
      var v = itemVal(it, q), vv = admRoot.querySelector('[data-out="val' + it.id + '"]'); if (vv) vv.textContent = v.ok ? rs(v.venda) : '';
      if (it.tipo === 'cortina' || it.tipo === 'persiana') { var ta = admRoot.querySelector('textarea[data-f="desc"][data-it="' + it.id + '"]'); if (ta && !(it.desc && it.desc.trim()) && document.activeElement !== ta) ta.value = autoDesc(it, q); }
    });
    var s = admRoot.querySelector('[data-out="sum"]');
    if (s) {
      var act = document.activeElement, k = act && s.contains(act) && act.getAttribute('data-q'), ss = act && act.selectionStart;
      s.innerHTML = vSummary(q);
      if (k) { var n = s.querySelector('[data-q="' + k + '"]'); if (n) { n.focus(); try { n.setSelectionRange(ss, ss) } catch (e) { } } }
    }
    admRoot.querySelectorAll('.mv-chip[data-mov="mg"]').forEach(function (b) { var on = num(b.getAttribute('data-v')) === qm; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)) });
    var mp = admRoot.querySelector('[data-out="mgpad"]'); if (mp) mp.innerHTML = mgPadTxt(q);
    var mx = admRoot.querySelector('[data-out="mix"]'); if (mx) mx.textContent = mixTxt(q);
  }
  function orcAfterRender() {
    var ed = admRoot.querySelector('.orc-ed'); if (!ed) return;
    var q = qBy(ed.getAttribute('data-q-id')); if (q) orcPaint(q);
  }

  /* ---------- configuração: margem padrão única ---------- */
  function vOrcPer() {
    var c = orcLoad().cfg, zero = PCFG.filter(function (f) { return f[0] !== 'pInst' && !num(c[f[0]]) });
    var card = '<section class="adm-card"><h2>Adicionais de persiana</h2>' +
      (zero.length ? '<p class="orc-zero-note" style="margin:0 0 1rem">Preencha os valores: ' + esc(zero.map(function (f) { return f[1].replace(/ \(.*$/, '').toLowerCase() }).join(', ')) + '. Enquanto estiverem zerados, entram como R$ 0,00 no orçamento.</p>' : '') +
      '<form class="orc-row r4" data-form="perxcfg">' + PCFG.map(function (f) {
        var z = !num(c[f[0]]) && f[0] !== 'pInst';
        return field(f[1], '<input type="text" inputmode="decimal" name="' + f[0] + '" value="' + br(c[f[0]]) + '"' + (z ? ' class="orc-zero"' : '') + '>', z ? 'preencha o valor' : f[2]);
      }).join('') +
      '<p class="adm-note" style="grid-column:1/-1;margin:0">A margem da loja não fica mais aqui: vem do orçamento (padrão em <a href="#/orcamentos/precos">Preços e regras</a>).</p>' +
      '<div class="adm-actions" style="grid-column:1/-1;margin-top:0"><button class="adm-btn">Salvar adicionais</button></div></form></section>';
    return vOrcPer0().replace(/<section class="adm-card"><h2>Adicionais de persiana<\/h2>[\s\S]*?<\/form><\/section>/, function () { return card });
  }
  function vOrcPrecos() {
    return vOrcPrecos0().replace(/<label class="adm-field"><span>Porcentagem da loja \(%\)<\/span><input [^>]*name="margem"[^>]*><small>cortinas<\/small><\/label>/, function () {
      return field('Margem padrão (%)', '<input type="text" inputmode="decimal" name="mPadrao" value="' + br(cfgPad(), 0) + '">', 'novos orçamentos, todos os tipos');
    }).replace(/<button type="button" class="adm-btn ghost" data-orc="reset">Restaurar dados de exemplo<\/button>/, '');
  }

  /* ---------- documento do cliente (padrão Casa Áurea) ---------- */
  var CONTATO = { wa: '+55 48 98457-6227', end: 'Av. Valério Gomes, 42 · Centro, Tijucas — SC', ig: '@a.casaaurea' };
  var MARK = '<svg class="cad-mark" viewBox="-3 -3 240 311" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><rect x="0" y="0" width="234" height="305" vector-effect="non-scaling-stroke"/><path d="M116 305V129H234" vector-effect="non-scaling-stroke"/><path d="M0 252C4 184 52 129 130 129C190 129 232 170 232 214C232 262 198 290 162 290C134 290 116 272 116 250C116 229 131 217 146 217C161 217 171 229 169 242C167 254 155 257 147 250" vector-effect="non-scaling-stroke"/></svg>';
  function docLogo(cls) { return '<div class="cad-logo ' + (cls || '') + '">' + MARK + '<span>CASA ÁUREA</span></div>'; }
  function two(n) { return (n < 10 ? '0' : '') + n; }
  /* d = {num, data, titulo, cliente, consultora, secoes:[{titulo, itens:[{amb, html, qtd, valor}]}], total, avista, prazo, obs, nota, interno} */
  function docHtml(d) {
    var c = orcLoad().cfg, cl = d.cliente || {}, n = 0, multi = d.secoes.length > 1;
    var meta = [cl.end, cl.tel].filter(Boolean).map(esc).join(' · ');
    var pay = 'À vista ' + rs(d.avista) + (num(c.parcelas) > 1 ? ' ou ' + rs(d.total) + ' em até ' + num(c.parcelas) + 'x no cartão' : '') + '.';
    return '<article class="cad' + (d.interno ? ' is-int' : '') + '" aria-label="Orçamento ' + esc(d.num) + '">' +
      (d.interno ? '<p class="cad-int">Versão interna · com medidas · não enviar ao cliente</p>' : '') +
      '<header class="cad-h">' + docLogo() + '<div class="cad-h-r"><p class="cad-eb">Orçamento</p><p class="cad-num">' + esc(d.num) + '</p><p class="cad-date">' + esc(c.cidade || 'Tijucas') + ', ' + dataExt(d.data) + '</p></div></header>' +
      '<section class="cad-intro"><div><p class="cad-eb">Preparado para</p><p class="cad-cli">' + esc(cl.nome || '—') + '</p>' + (meta ? '<p class="cad-mut">' + meta + '</p>' : '') + '</div>' +
      '<div class="cad-intro-r"><p class="cad-eb">Consultoria</p><p>' + esc(d.consultora || '') + ' · Casa Áurea</p>' + (cl.arq ? '<p class="cad-eb" style="margin-top:.9rem">Arquitetura</p><p>' + esc(cl.arq) + '</p>' : '') + '</div></section>' +
      '<h1 class="cad-title">' + esc(d.titulo) + '</h1>' +
      (d.secoes.length ? d.secoes.map(function (s) {
        var sub = s.itens.reduce(function (a, it) { return a + (it.valor || 0) }, 0);
        return '<section class="cad-sec">' + (multi ? '<div class="cad-sec-h"><h2>' + esc(s.titulo) + '</h2><p>' + rs(sub) + '</p></div>' : '') +
          '<ol class="cad-items">' + s.itens.map(function (it) {
            n++;
            return '<li class="cad-it"><span class="cad-n">' + two(n) + '</span><div class="cad-it-b">' + (it.amb ? '<p class="cad-amb">' + esc(it.amb) + '</p>' : '') + it.html + '</div>' +
              '<p class="cad-q">' + esc(it.qtdTxt || '') + '</p><p class="cad-v">' + (it.valor == null ? 'a definir' : rs(it.valor)) + '</p></li>';
          }).join('') + '</ol></section>';
      }).join('') : '<p class="cad-mut" style="padding:1rem 0">Nenhum item neste orçamento.</p>') +
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
  function mvOpDoc(op, it, q, k, sel) {
    var v = mvOp(op, it, q);
    return '<div class="cad-op' + (sel ? ' on' : '') + '">' + (op.foto ? '<img src="' + esc(op.foto) + '" alt="">' : '<span class="cad-nofoto"></span>') +
      '<div><p class="cad-op-l">' + (it.ops.length > 1 ? 'Opção ' + (k + 1) + (sel ? ' · considerada no total' : '') : '') + '</p><p class="cad-op-n">' + esc(op.nome) + '</p>' +
      '<p class="cad-mut">' + [op.code, op.medidas].filter(Boolean).map(esc).join(' · ') + '</p>' +
      '<p class="cad-op-v">' + (v.ok ? rs(v.unit) + (v.qtd > 1 ? ' <small>cada</small>' : '') : 'a definir') + '</p></div></div>';
  }
  /* itens de uma categoria, juntando os do mesmo ambiente (na ordem em que o ambiente aparece) */
  function byAmb(list) {
    var ord = [];
    list.forEach(function (it) { var a = norm(it.amb || ''); if (ord.indexOf(a) < 0) ord.push(a) });
    return list.map(function (it, i) { return [ord.indexOf(norm(it.amb || '')), i, it] }).sort(function (a, b) { return a[0] - b[0] || a[1] - b[1] }).map(function (x) { return x[2] });
  }
  function docItem(it, q, interno) {
    var v = itemVal(it, q), qtd = num(it.qtd);
    if (it.tipo === 'movel') {
      var s = mvSel(it);
      return { amb: it.amb, qtdTxt: qtd > 1 ? qtd + ' un.' : '', valor: v.ok ? v.venda : null,
        html: it.ops.length ? '<div class="cad-ops">' + it.ops.map(function (op, k) { return (k ? '<p class="cad-ou">ou</p>' : '') + mvOpDoc(op, it, q, k, it.ops.length > 1 && k === s) }).join('') + '</div>' : '<p class="cad-desc">Peça a definir</p>' };
    }
    if (it.tipo === 'outro') {
      var o = calcOutro(it, q), u = unTxt(it.un), varias = it.un !== 'un' || o.qtd !== 1;
      return { amb: it.amb, qtdTxt: varias ? qn(o.qtd) + ' ' + u : '', valor: v.ok ? v.venda : null,
        html: '<p class="cad-desc">' + esc(itName(it, q)) + '</p>' + (varias && o.ok ? '<p class="cad-mut">' + rs(o.unit) + ' por ' + u + '</p>' : '') };
    }
    var med = '';
    if (interno) {
      var L = num(it.L), H = num(it.H);
      med = '<p class="cad-med">' + br(L) + ' × ' + br(H) + ' m · ' + br(L * H) + ' m²' + (it.tipo === 'cortina' ? ' · barra ' + br(it.barra === '' || it.barra == null ? orcLoad().cfg.barra : num(it.barra)) : '') + '</p>';
    }
    return { amb: it.amb, qtdTxt: qtd > 1 ? qtd + ' un.' : '', valor: v.ok ? v.venda : null, html: '<p class="cad-desc">' + esc(interno ? descOf(it, q) : descClient(it, q)) + '</p>' + med };
  }
  function secoesOf(q) {
    return SECOES.map(function (s) { return { k: s[0], titulo: s[1], list: byAmb(q.itens.filter(function (it) { return catOf(it) === s[0] })) } }).filter(function (s) { return s.list.length });
  }
  function vOrcDoc(id, h) {
    var q = qBy(id); if (!q) return head('Orçamento não encontrado', '') + '<a class="adm-btn" href="#/orcamentos">Voltar</a>';
    var t = qTot(q), interno = qs(h).v === 'interna', base = '#/orcamentos/' + q.id + '/documento', secs = secoesOf(q);
    var secoes = secs.map(function (s) { return { titulo: s.titulo, itens: s.list.map(function (it) { return docItem(it, q, interno) }) } });
    var temCP = secs.some(function (s) { return s.k === 'cp' }), multi = q.itens.some(function (it) { return it.tipo === 'movel' && it.ops && it.ops.length > 1 });
    var nota = [temCP ? 'Medidas finais conferidas na visita técnica.' : '', multi ? 'Nos itens com duas opções, o total considera a opção indicada; a outra pode substituí-la, com o valor ajustado.' : ''].filter(Boolean).join(' ');
    var seg = '<div class="orc-docv" role="group" aria-label="Versão do documento"><a href="' + base + '" aria-pressed="' + !interno + '">Versão do cliente</a><a href="' + base + '?v=interna" aria-pressed="' + interno + '">Versão interna (com medidas)</a></div>';
    return docToolbar('#/orcamentos/' + q.id, '<button type="button" class="adm-btn ghost" data-orc="wa" data-qid="' + q.id + '">Enviar no WhatsApp</button>' + seg + (t.ok ? '' : '<span class="adm-badge warn">Há itens incompletos</span>')) +
      docHtml({ num: q.num, data: q.data, titulo: secs.length === 1 ? secs[0].titulo : 'Orçamento descritivo', cliente: q.cliente, consultora: q.consultora, secoes: secoes, total: t.total, avista: t.avista, prazo: q.prazo, obs: q.obs, interno: interno, nota: nota }) + WA_DLG;
  }
  function waLine(it, q) {
    var v = itemVal(it, q), amb = it.amb ? it.amb + ': ' : '';
    if (it.tipo === 'movel') {
      var qtd = Math.max(1, num(it.qtd) || 1);
      return '• ' + amb + (it.ops.length ? it.ops.map(function (op, k) { var w = mvOp(op, it, q); return (it.ops.length > 1 ? 'opção ' + (k + 1) + ' ' : '') + op.nome + (op.code ? ' (' + op.code + ')' : '') + ' — ' + (w.ok ? rs(w.unit) + (qtd > 1 ? ' cada' : '') : 'a definir') }).join(' | ') : 'peça a definir') + (qtd > 1 ? ' · ' + qtd + ' un.' : '');
    }
    if (it.tipo === 'outro') { var o = calcOutro(it, q), u = unTxt(it.un); return '• ' + amb + itName(it, q) + (it.un !== 'un' || o.qtd !== 1 ? ' · ' + qn(o.qtd) + ' ' + u : '') + ' — ' + (v.ok ? rs(v.venda) : 'a definir'); }
    return '• ' + amb + descClient(it, q) + ' — ' + (v.ok ? rs(v.venda) : 'a definir');
  }
  function waText(q) {
    var t = qTot(q), c = orcLoad().cfg, secs = secoesOf(q);
    return 'Olá' + (q.cliente.nome ? ', ' + q.cliente.nome.split(' ')[0] : '') + '! Segue o orçamento da Casa Áurea (' + q.num + '):\n\n' +
      secs.map(function (s) { return (secs.length > 1 ? '*' + s.titulo + '*\n' : '') + s.list.map(function (it) { return waLine(it, q) }).join('\n') }).join('\n\n') +
      '\n\nTotal: ' + rs(t.total) + '\nÀ vista: ' + rs(t.avista) + (c.parcelas > 1 ? '\nOu em até ' + c.parcelas + 'x no cartão.' : '') + '\nPrazo de entrega: ' + (q.prazo || c.prazo) + '.\n\nQualquer dúvida, estou à disposição. ' + (q.consultora || '');
  }

  /* ---------- rotas (as antigas de móveis levam ao orçamento único) ---------- */
  function renderOrc(path, h) {
    var m;
    if (path === '#/orcamentos/novo') { var q = newQuote(); flush(); setTimeout(function () { location.replace('#/orcamentos/' + q.id) }, 0); return vOrcEdit(q.id); }
    if (path === '#/orcamentos/moveis' || path === '#/orcamentos/moveis/novo') { setTimeout(function () { location.replace(path === '#/orcamentos/moveis' ? '#/orcamentos' : '#/orcamentos/novo') }, 0); return ''; }
    if ((m = path.match(/^#\/orcamentos\/moveis\/([\w-]+)(\/documento)?$/))) { var to = '#/orcamentos/' + m[1] + (m[2] || ''); setTimeout(function () { location.replace(to) }, 0); return ''; }
    if ((m = path.match(/^#\/orcamentos\/([\w-]+)\/documento$/))) return vOrcDoc(m[1], h);
    return renderOrc0(path, h);
  }

  /* ---------- busca rápida de móveis ---------- */
  function itBy(q, id) { return q.itens.filter(function (x) { return x.id === id })[0]; }
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
      out.innerHTML = hits[key].length ? sugHtml(key, hits[key]) : sugHtml(key, [], 'Nenhuma peça com “' + term + '”. Confira o código ou abra a lista de móveis.');
    }).catch(function (e) { if (my === sSeq) out.innerHTML = sugHtml(key, [], 'Erro na busca: ' + ((e && e.message) || 'tente de novo')); });
  }
  function opFrom(x) {
    return { pid: x.pid, vid: x.vid || null, code: x.code || '', nome: x.nome || '', foto: x.foto || '', medidas: x.medidas || '',
      custo: x.custo != null ? x.custo : '', custo0: x.custo != null ? x.custo : null, preco: x.preco != null ? x.preco : null, margem: null };
  }
  /* key 'new' = novo item de móvel; senão, id do item que recebe a peça (opção 1 ou 2) */
  function pickHit(q, key, x, quiet) {
    if (!x) return null;
    var it;
    if (key === 'new') { it = newItem('movel'); q.itens.push(it); } else { it = itBy(q, key); if (!it || it.tipo !== 'movel') return null; }
    if (it.ops.length >= 2) return null;
    it.ops.push(opFrom(x)); hits[key] = [];
    orcSave(); orcRerender();
    if (!quiet) {
      var el = admRoot.querySelector('#it-' + it.id); if (el && key === 'new') el.scrollIntoView({ block: 'center' });
      var nx = admRoot.querySelector('[data-mvs="new"]'); if (nx && key === 'new') nx.focus({ preventScroll: true });
    }
    return it;
  }

  /* ---------- lista de móveis (catálogo inteiro, paginado) ---------- */
  var ML = { key: 'new', q: '', type: '', page: 0, items: [], total: 0, size: 40, types: null, seq: 0, added: 0 }, mlDlg = null, mlTimer = null;
  function mlEl(k) { return mlDlg && mlDlg.querySelector('[data-ml="' + k + '"]'); }
  function mlBuild() {
    if (mlDlg && document.body.contains(mlDlg)) return mlDlg;
    var old = document.getElementById('mvLista'); if (old) old.remove();
    var d = document.createElement('dialog');
    d.id = 'mvLista'; d.className = 'adm orc-app mvl'; d.setAttribute('aria-labelledby', 'mvListaT');
    d.innerHTML = '<div class="mvl-box"><header class="mvl-h"><div><h2 id="mvListaT">Lista de móveis</h2><p class="adm-note" data-ml="sub"></p></div><button type="button" class="adm-btn ghost sm" data-ml="close">Fechar</button></header>' +
      '<form class="mvl-f" data-ml="form" role="search"><input type="search" name="q" placeholder="Buscar por nome ou código (CA-…)" aria-label="Buscar móvel por nome ou código" autocomplete="off"><select name="type" aria-label="Tipo de peça"><option value="">Todos os tipos</option></select></form>' +
      '<div class="mvl-list" data-ml="list" aria-live="polite"></div><footer class="mvl-pg" data-ml="pg"></footer></div>';
    document.body.appendChild(d); mlDlg = d;
    d.addEventListener('click', function (e) {
      if (e.target === d) { d.close(); return; }
      var b = e.target.closest('[data-ml]'); if (!b) return; var a = b.getAttribute('data-ml');
      if (a === 'close') { d.close(); return; }
      if (a === 'prev' && ML.page > 0) { ML.page--; mlLoad(); return; }
      if (a === 'next' && (ML.page + 1) * ML.size < ML.total) { ML.page++; mlLoad(); return; }
      if (a === 'add') {
        var x = ML.items[Number(b.getAttribute('data-i'))], q = curQ(); if (!x || !q) return;
        var it = pickHit(q, ML.key, x, true); if (!it) return;
        if (ML.key === 'new') { ML.added++; b.textContent = 'Adicionado ✓'; b.classList.add('ghost'); mlSub(); }
        else d.close();
      }
    });
    d.addEventListener('input', function (e) {
      if (e.target.name !== 'q') return; clearTimeout(mlTimer);
      var v = e.target.value; mlTimer = setTimeout(function () { ML.q = v; ML.page = 0; mlLoad(); }, 300);
    });
    d.addEventListener('change', function (e) { if (e.target.name === 'type') { ML.type = e.target.value; ML.page = 0; mlLoad(); } });
    d.addEventListener('submit', function (e) { e.preventDefault(); clearTimeout(mlTimer); var f = mlEl('form'); ML.q = f.q.value; ML.page = 0; mlLoad(); });
    return d;
  }
  function mlSub() {
    var s = mlEl('sub'); if (!s) return; var q = curQ(), it = q && ML.key !== 'new' ? itBy(q, ML.key) : null;
    s.textContent = it ? (it.ops.length ? 'Escolha a opção 2 (“esta ou esta”) do item ' + (q.itens.indexOf(it) + 1) + '.' : 'Escolha a peça do item ' + (q.itens.indexOf(it) + 1) + '.') :
      'Clique em Adicionar: cada peça vira um item do orçamento.' + (ML.added ? ' ' + plural(ML.added, 'peça adicionada', 'peças adicionadas') + '.' : '');
  }
  function mlRow(x, i) {
    return '<div class="mvl-row">' + (x.foto ? '<img src="' + esc(x.foto) + '" alt="" loading="lazy">' : '<span class="mv-nofoto" aria-hidden="true"></span>') +
      '<div class="mvl-n"><b>' + esc(x.nome) + '</b><small><span class="adm-code">' + esc(x.code || 'sem código') + '</span>' + (x.tipo ? ' · ' + esc(x.tipo) : '') + '</small></div>' +
      '<span class="mvl-med">' + esc(x.medidas || '—') + '</span><span class="mvl-c' + (x.custo != null ? '' : ' none') + '">' + (x.custo != null ? 'custo ' + rs(x.custo) : 'sem custo') + '</span>' +
      '<button type="button" class="adm-btn sm" data-ml="add" data-i="' + i + '" aria-label="Adicionar ' + esc(x.nome) + '">' + (ML.key === 'new' ? 'Adicionar' : 'Escolher') + '</button></div>';
  }
  function mlLoad() {
    var list = mlEl('list'), pg = mlEl('pg'); if (!list) return;
    if (typeof STORE.listProducts !== 'function') { list.innerHTML = '<p class="mv-sug-msg">Lista indisponível.</p>'; return; }
    var my = ++ML.seq; list.innerHTML = '<p class="mv-sug-msg">Carregando…</p>';
    STORE.listProducts({ q: ML.q, type: ML.type, page: ML.page }).then(function (r) {
      if (my !== ML.seq) return;
      ML.items = (r && r.items) || []; ML.total = (r && r.total) || 0; if (r && r.pageSize) ML.size = r.pageSize;
      if (!ML.types && r && r.types) {
        ML.types = r.types; var sel = mlEl('form').type;
        sel.insertAdjacentHTML('beforeend', ML.types.map(function (t) { return opt(t.id, t.name, ML.type) }).join(''));
      }
      list.innerHTML = ML.items.length ? ML.items.map(mlRow).join('') : '<p class="mv-sug-msg">Nenhuma peça' + (ML.q ? ' com “' + esc(ML.q) + '”' : '') + (ML.type ? ' neste tipo' : '') + '.</p>';
      list.scrollTop = 0;
      var pages = Math.max(1, Math.ceil(ML.total / ML.size));
      pg.innerHTML = '<span>' + plural(ML.total, 'peça', 'peças') + ' · página ' + (ML.page + 1) + ' de ' + pages + '</span><span class="mvl-pgb"><button type="button" class="adm-btn ghost sm" data-ml="prev"' + (ML.page > 0 ? '' : ' disabled') + '>← Anterior</button><button type="button" class="adm-btn ghost sm" data-ml="next"' + ((ML.page + 1) * ML.size < ML.total ? '' : ' disabled') + '>Próxima →</button></span>';
    }).catch(function (e) { if (my === ML.seq) list.innerHTML = '<p class="mv-sug-msg">Erro ao carregar: ' + esc((e && e.message) || 'tente de novo') + '</p>'; });
  }
  function mlOpen(key) {
    var d = mlBuild(), f0 = mlEl('form');
    ML.key = key || 'new'; ML.added = 0; ML.q = ''; ML.type = ''; ML.page = 0;
    if (f0) { f0.q.value = ''; f0.type.value = ''; }
    mlSub(); mlLoad();
    if (!d.open) d.showModal();
    var f = mlEl('form'); if (f) f.q.focus();
  }

  /* ---------- eventos ---------- */
  admRoot.addEventListener('input', function (e) {
    var el = e.target, q;
    if (el.matches('[data-mvs]')) { var key = el.getAttribute('data-mvs'), v = el.value; clearTimeout(sTimer); sTimer = setTimeout(function () { runSearch(key, v) }, 250); return; }
    if (!(q = curQ())) return;
    if (el.matches('[data-qm="margem"]')) { if (el.value.trim() === '') return; q.margem = num(el.value); orcSave(); orcPaint(q); return; }
    if (el.matches('[data-x][data-it]') && el.tagName !== 'SELECT') {
      var it = itBy(q, el.dataset.it); if (!it) return; var f = el.dataset.x;
      if (f === 'margem') { it.margem = el.value.trim() === '' ? null : num(el.value); var lb = el.closest('.orc-itmg'); if (lb) lb.classList.toggle('own', it.margem != null); }
      else if (f === 'custo') { it.custo = el.value === '' ? '' : num(el.value); el.classList.toggle('orc-zero', !(num(it.custo) > 0)); }
      else if (f === 'qtd') it.qtd = el.value === '' ? '' : num(el.value);
      else it[f] = el.value;
      orcSave(); orcPaint(q); return;
    }
    if (el.matches('[data-mo]') && el.type !== 'radio') {
      var it2 = itBy(q, el.dataset.it), op = it2 && it2.ops && it2.ops[Number(el.dataset.k)]; if (!op) return; var g = el.dataset.mo;
      op[g] = g === 'custo' ? (el.value === '' ? '' : num(el.value)) : g === 'margem' ? (el.value === '' ? null : num(el.value)) : el.value;
      if (g === 'custo') el.classList.toggle('orc-zero', !(num(op.custo) > 0));
      orcSave(); orcPaint(q); return;
    }
  });
  admRoot.addEventListener('keydown', function (e) {
    var el = e.target; if (e.key !== 'Enter' || !el.matches || !el.matches('[data-mvs]')) return;
    e.preventDefault(); var key = el.getAttribute('data-mvs'), q = curQ(), list = hits[key] || [];
    if (!q) return;
    var up = el.value.trim().toUpperCase(), exact = list.filter(function (x) { return x.code === up })[0];
    if (exact || list.length === 1) pickHit(q, key, exact || list[0]);
    else { clearTimeout(sTimer); runSearch(key, el.value); }
  });
  admRoot.addEventListener('change', function (e) {
    var el = e.target, q = curQ();
    if (!q) return;
    /* persiana: trocar acionamento redesenha (o rótulo do lado muda) */
    if (el.matches('select[data-f="comando"][data-it]')) { var it0 = itBy(q, el.dataset.it); if (it0) { it0.motor = el.value === 'motor'; orcSave(); orcRerender(); } return; }
    if (el.matches('select[data-x="un"][data-it]')) { var it1 = itBy(q, el.dataset.it); if (it1) { it1.un = el.value; orcSave(); orcRerender(); } return; }
    if (el.matches('[data-qm="margem"]') && el.value.trim() === '') { el.value = br(qMarg(q), 0); return; }
    if (el.matches('input[type=radio][data-mo="sel"]') && el.checked) { var it = itBy(q, el.dataset.it); if (it) { it.sel = Number(el.dataset.k) === 1 ? 1 : 0; orcSave(); orcRerender(); } return; }
  });
  admRoot.addEventListener('click', function (e) {
    var b = e.target.closest('[data-mov],[data-orc="tipo2"],[data-orc="add"]'); if (!b) return;
    var q = curQ(); if (!q) return;
    if (b.getAttribute('data-orc') === 'add') {
      /* (o módulo da prévia já criou o item) móvel: o cursor vai direto para a busca da peça */
      if (b.dataset.v === 'movel') { var last = q.itens[q.itens.length - 1], s = last && admRoot.querySelector('[data-mvs="' + last.id + '"]'); if (s) s.focus({ preventScroll: true }); }
      return;
    }
    if (b.getAttribute('data-orc') === 'tipo2') {
      var cur = itBy(q, b.dataset.it), v = b.dataset.v; if (!cur || cur.tipo === v) return;
      /* trocar o tipo não perde nada: o que foi digitado no tipo anterior fica guardado no item */
      var prev = cur.prev || {}, snap = JSON.parse(JSON.stringify(cur)); delete snap.prev; prev[cur.tipo] = snap;
      var n2 = prev[v] ? JSON.parse(JSON.stringify(prev[v])) : newItem(v);
      delete prev[v];
      n2.id = cur.id; n2.amb = cur.amb; n2.qtd = cur.qtd;
      if ((v === 'cortina' || v === 'persiana') && (n2.L === '' || n2.L == null) && cur.L !== undefined) { n2.L = cur.L; n2.H = cur.H; }
      if (Object.keys(prev).length) n2.prev = prev;
      q.itens[q.itens.indexOf(cur)] = n2; orcSave(); orcRerender(); return;
    }
    var a = b.getAttribute('data-mov');
    if (a === 'mg') { q.margem = num(b.dataset.v); orcSave(); orcRerender(); return; }
    if (a === 'mgpad') { orcLoad().cfg.mPadrao = qMarg(q); orcSave(); orcRerender(); admMsg('Margem padrão salva: ' + br(qMarg(q), 0) + '% para os próximos orçamentos.'); return; }
    if (a === 'pick') { pickHit(q, b.dataset.key, (hits[b.dataset.key] || [])[Number(b.dataset.i)]); return; }
    if (a === 'lista') { mlOpen(b.dataset.key); return; }
    var it = itBy(q, b.dataset.it); if (!it) return;
    if (a === 'delop') { var k = Number(b.dataset.k); it.ops.splice(k, 1); it.sel = 0; orcSave(); orcRerender(); return; }
  });
  /* "Preços e regras": a margem padrão é lida antes do salvamento da prévia (fase de captura) */
  admRoot.addEventListener('submit', function (e) {
    var f = e.target.closest('form[data-form="orccfg"]'); if (!f) return;
    var d = fd(f); if (d.mPadrao !== undefined) orcLoad().cfg.mPadrao = num(d.mPadrao);
  }, true);
  admRoot.addEventListener('submit', function (e) {
    var f = e.target.closest('form[data-form="perxcfg"]'); if (!f) return; e.preventDefault();
    var d = fd(f), c = orcLoad().cfg;
    PCFG.forEach(function (x) { if (d[x[0]] !== undefined) c[x[0]] = num(d[x[0]]) });
    orcSave(); orcRerender(); admMsg('Adicionais de persiana salvos. Os orçamentos abertos já foram recalculados.');
  });
  /* sair do módulo por um link do painel (sem recarregar a página) grava antes */
  document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a[href]'); if (a && String(a.getAttribute('href')).charAt(0) !== '#') flush(); }, true);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
