/* Página Carro (#/carro): lançamentos (abastecimento, óleo, serviço, IPVA, multa, licenciamento, seguro), vencimentos anuais com aviso,
   resumo, gráficos SVG, configurações (consumo, preços, tanque) e desenho do carro com pendências por parte. Coleção "carro" sincroniza. ES5.  byGui */
(function (global) {
  'use strict';
  var PS = global.PS, U = PS.u, h = U.h, S = PS.store, C = PS.carroCalc, I = PS.icone || function () { return null; };
  var NS = 'http://www.w3.org/2000/svg';
  var form = null, filtro = 'todos', parteSel = null, verCfg = false;
  var LATARIA = ['Batida', 'Amassado/Puxar', 'Martelinho de ouro', 'Risco', 'Pintura'];
  var MECANICO = ['Desgaste', 'Barulho', 'Vazamento', 'Não funciona', 'Revisar', 'Outro'];
  var GRAV = { leve: 'Leve', media: 'Média', grave: 'Grave', '': 'Gravidade pendente' };
  /* partes: id, rótulo, lataria?, retângulo no desenho (vista de cima, frente para cima) ou ponto do marcador */
  var PARTES = [
    ['pc-d', 'Para-choque dianteiro', 1, [40, 8, 80, 14]], ['capo', 'Capô', 1, [42, 22, 76, 50]],
    ['pl-de', 'Para-lama dianteiro esquerdo', 1, [24, 26, 18, 44]], ['pl-dd', 'Para-lama dianteiro direito', 1, [118, 26, 18, 44]],
    ['parabrisa', 'Para-brisa', 0, [46, 74, 68, 16]], ['teto', 'Teto', 1, [46, 92, 68, 78]],
    ['porta-de', 'Porta dianteira esquerda', 1, [24, 74, 20, 52]], ['porta-dd', 'Porta dianteira direita', 1, [116, 74, 20, 52]],
    ['porta-te', 'Porta traseira esquerda', 1, [24, 128, 20, 50]], ['porta-td', 'Porta traseira direita', 1, [116, 128, 20, 50]],
    ['pl-te', 'Para-lama traseiro esquerdo', 1, [24, 180, 18, 40]], ['pl-td', 'Para-lama traseiro direito', 1, [118, 180, 18, 40]],
    ['malas', 'Porta-malas', 1, [42, 186, 76, 36]], ['pc-t', 'Para-choque traseiro', 1, [40, 224, 80, 14]],
    ['pneus', 'Pneus', 0, [8, 40, 14, 30]], ['freios', 'Freios', 0, [138, 40, 14, 30]], ['suspensao', 'Suspensão', 0, [8, 180, 14, 30]],
    ['motor', 'Motor', 0, [62, 30, 36, 20]], ['bateria', 'Bateria', 0, [100, 26, 14, 12]], ['farol', 'Farol', 0, [44, 16, 14, 8]], ['outro', 'Outra parte', 0, [62, 140, 36, 14]]
  ];
  function parte(id) { var r = null; PARTES.forEach(function (p) { if (p[0] === id) r = p; }); return r; }
  function itens() { return (S.get().carro || []).slice(); }
  function brl(v) { return v == null ? '' : U.valorBRL(v); }
  function num(v, d) { return v == null ? '' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: d == null ? 2 : d }); }
  function dataBR(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : ''; }
  function lerNum(v) { v = String(v == null ? '' : v).trim().replace(/\s|R\$/g, ''); if (!v) return null; if (v.indexOf(',') >= 0) v = v.replace(/\./g, '').replace(',', '.'); var n = Number(v); return isFinite(n) ? n : null; }
  function botao(rot, fid, fn, cls) { return h('button', { class: 'btn' + (cls ? ' ' + cls : ''), type: 'button', 'data-fid': fid, onclick: fn }, rot); }
  function campo(rot, el) { return h('label', { class: 'campo' }, h('span', null, rot), el); }
  function entrada(fid, val, at) {
    var o = { class: 'entrada', 'data-fid': 'car:f:' + fid, value: val == null ? '' : String(val) };
    Object.keys(at || {}).forEach(function (k) { o[k] = at[k]; });
    if (!o.type) o.type = 'text';
    return h('input', o);
  }
  function numero(fid, val, ph) { return entrada(fid, val == null ? '' : String(val).replace('.', ','), { inputmode: 'decimal', placeholder: ph || '' }); }
  function selecao(fid, opcoes, val) {
    return h('select', { class: 'entrada', 'data-fid': 'car:f:' + fid }, opcoes.map(function (o) { var at = { value: o[0] }; if (o[0] === val) at.selected = 'selected'; return h('option', at, o[1]); }));
  }
  function salvarItem(x) {
    S.alterar(function (s) {
      if (!s.carro) s.carro = [];
      x.atualizado = new Date().toISOString();
      var i = -1; s.carro.forEach(function (y, k) { if (y.id === x.id) i = k; });
      var ok = S.sanearItem('carro', x.id, x); if (!ok) return;
      if (i >= 0) s.carro[i] = ok; else s.carro.push(ok);
    }, true);
  }
  function excluir(x) {
    PS.modal.abrir('Excluir lançamento?', h('p', null, C.TIPOS[x.tipo] + (x.data ? ' de ' + dataBR(x.data) : '') + (x.valor ? ', ' + brl(x.valor) : '') + '. Isso não pode ser desfeito.'), [
      { rotulo: 'Excluir', tipo: 'perigo', acao: function () { S.alterar(function (s) { s.carro = (s.carro || []).filter(function (y) { return y.id !== x.id; }); }); PS.aviso('Lançamento excluído'); } },
      { rotulo: 'Cancelar' }]);
  }

  /* ---------- formulário ---------- */
  function formulario() {
    var x = form, t = x.tipo, el = {}, campos = [];
    function f(k, rot, node) { el[k] = node; campos.push(campo(rot, node)); }
    if (t !== 'vencimento' && t !== 'lembrete') f('data', t === 'pendencia' ? 'Data em que notou' : 'Data', entrada('data', x.data || U.hoje(), { type: 'date' }));
    if (t === 'vencimento') {
      f('cat', 'Tipo', selecao('cat', [['ipva', 'IPVA'], ['licenciamento', 'Licenciamento'], ['seguro', 'Seguro']], x.cat || 'ipva'));
      f('data', 'Data de vencimento (repete todo ano)', entrada('data', x.data || '', { type: 'date' }));
      f('antec', 'Avisar quantos dias antes', numero('antec', x.antec == null ? 15 : x.antec, '15'));
      f('valor', 'Valor previsto R$ (opcional)', numero('valor', x.valor, 'Ex.: 1200,00'));
      f('desc', 'Observação (opcional)', entrada('desc', x.desc, { maxlength: '200', placeholder: 'Ex.: seguradora, apólice' }));
    } else if (t === 'pendencia') {
      f('parte', 'Parte do carro', selecao('parte', PARTES.map(function (p) { return [p[0], p[1]]; }), x.parte || parteSel || 'pc-d'));
      var pr = parte(x.parte || parteSel || 'pc-d');
      f('problema', 'Tipo de problema', selecao('problema', (pr && pr[2] ? LATARIA.concat(MECANICO) : MECANICO.concat(LATARIA)).map(function (o) { return [o, o]; }), x.problema || ''));
      f('gravidade', 'Gravidade', selecao('gravidade', [['', 'Pendente (avaliar)'], ['leve', 'Leve'], ['media', 'Média'], ['grave', 'Grave']], x.gravidade || ''));
      f('desc', 'Descrição', entrada('desc', x.desc, { maxlength: '200', placeholder: 'Ex.: risco perto da maçaneta' }));
      f('status', 'Situação', selecao('status', [['aberta', 'Aberta'], ['resolvida', 'Resolvida']], x.status || 'aberta'));
    } else {
      if (t !== 'lembrete') f('valor', 'Valor R$', numero('valor', x.valor, 'Ex.: 250,00'));
      if (t === 'abastecimento') {
        f('comb', 'Combustível', selecao('comb', [['alcool', 'Álcool'], ['gasolina', 'Gasolina'], ['diesel', 'Diesel'], ['gnv', 'GNV'], ['outro', 'Outro']], x.comb || 'alcool'));
        f('litros', 'Litros', numero('litros', x.litros, 'Ex.: 40,5'));
        var ck = h('input', { type: 'checkbox', 'data-fid': 'car:f:cheio' }); ck.checked = !!x.cheio; el.cheio = ck;
        campos.push(h('label', { class: 'campo car-check' }, ck, h('span', null, 'Tanque cheio (para medir o consumo real)')));
      }
      if (t === 'oleo') { f('oleo', 'Óleo usado (marca e tipo)', entrada('oleo', x.oleo, { maxlength: '80', placeholder: 'Ex.: 5W30 sintético' })); }
      if (['abastecimento', 'oleo', 'servico'].indexOf(t) >= 0) f('km', 'Km do painel' + (t === 'abastecimento' ? ' (opcional)' : ''), numero('km', x.km, 'Ex.: 45200'));
      if (t === 'oleo') { f('proxKm', 'Próxima troca em km (opcional)', numero('proxKm', x.proxKm)); f('proxData', 'Próxima troca em data (opcional)', entrada('proxData', x.proxData, { type: 'date' })); }
      if (t === 'servico' || t === 'lembrete') { f('proxKm', 'Lembrar em km (opcional)', numero('proxKm', x.proxKm, 'Ex.: 55000')); f('proxData', 'Lembrar na data (opcional)', entrada('proxData', x.proxData, { type: 'date' })); }
      if (t === 'lembrete') f('desc', 'O que lembrar', entrada('desc', x.desc, { maxlength: '200', placeholder: 'Ex.: rodízio de pneus' }));
      if (t === 'servico') { f('desc', 'Descrição', entrada('desc', x.desc, { maxlength: '200', placeholder: 'Ex.: alinhamento e balanceamento' })); f('oficina', 'Oficina (opcional)', entrada('oficina', x.oficina, { maxlength: '80' })); }
      if (['ipva', 'multa', 'licenciamento', 'seguro'].indexOf(t) >= 0) f('desc', 'Descrição (opcional)', entrada('desc', x.desc, { maxlength: '200' }));
    }
    var pl = h('p', { class: 'nota car-pl', 'data-fid': 'car:pl' });
    function atualizaPL() { if (t !== 'abastecimento') return; var p = C.precoLitro(lerNum(el.valor.value), lerNum(el.litros.value)); pl.textContent = p ? 'Preço por litro: ' + brl(p).replace(/(,\d\d)$/, '$1') + ' (' + num(p, 3) + ')' : 'Preço por litro: preencha valor e litros'; }
    if (t === 'abastecimento') { el.valor.addEventListener('input', atualizaPL); el.litros.addEventListener('input', atualizaPL); atualizaPL(); }
    if (t === 'pendencia') el.parte.addEventListener('change', function () { form.parte = el.parte.value; form.problema = el.problema.value; PS.redesenhar(); });
    function salvar() {
      var y = {}; Object.keys(x).forEach(function (k) { y[k] = x[k]; });
      Object.keys(el).forEach(function (k) { if (k === 'cheio') { y.cheio = el.cheio.checked; return; } var v = el[k].value; y[k] = ['valor', 'litros', 'km', 'proxKm', 'antec'].indexOf(k) >= 0 ? lerNum(v) : v; });
      if (t === 'lembrete') { if (!y.data) y.data = U.hoje(); if (!String(y.desc || '').trim()) { PS.aviso('Diga o que lembrar'); el.desc.focus(); return; } if (!y.proxData && !(y.proxKm > 0)) { PS.aviso('Informe a data ou o km'); el.proxData.focus(); return; } }
      if (!y.data) { PS.aviso('Informe a data'); el.data.focus(); return; }
      if (['abastecimento', 'oleo', 'servico', 'ipva', 'multa', 'licenciamento', 'seguro'].indexOf(t) >= 0 && !(y.valor > 0) && t !== 'oleo') { PS.aviso('Informe o valor'); el.valor.focus(); return; }
      if (t === 'abastecimento' && !(y.litros > 0)) { PS.aviso('Informe os litros'); el.litros.focus(); return; }
      if (t === 'servico' && !String(y.desc || '').trim()) { PS.aviso('Descreva o serviço'); el.desc.focus(); return; }
      if (!y.id) y.id = U.uid();
      var origem = x.deResolver; delete y.deResolver;
      salvarItem(y);
      if (origem) { var p0 = null; itens().forEach(function (z) { if (z.id === origem) p0 = z; }); if (p0) { var p1 = {}; Object.keys(p0).forEach(function (k) { p1[k] = p0[k]; }); p1.status = 'resolvida'; salvarItem(p1); } }
      if (t === 'vencimento' || t === 'oleo') sincAgenda();
      form = null; PS.aviso(origem ? 'Serviço lançado e pendência resolvida' : 'Salvo'); PS.redesenhar();
    }
    return h('section', { class: 'cartao car-vidro car-form', 'data-fid': 'car:form' },
      h('h2', null, I('carro'), h('span', null, (x.id && !x.deResolver ? 'Editar: ' : 'Novo: ') + C.TIPOS[t])),
      campos, pl,
      h('div', { class: 'acoes car-acoes' }, botao('Salvar', 'car:salvar', salvar, 'primario'), botao('Cancelar', 'car:cancelar', function () { form = null; PS.redesenhar(); })));
  }
  function novo(tipo, extra) { form = { tipo: tipo }; Object.keys(extra || {}).forEach(function (k) { form[k] = extra[k]; }); PS.redesenhar(); setTimeout(function () { var f = document.querySelector('[data-fid="car:form"]'); if (f && f.scrollIntoView) f.scrollIntoView({ block: 'start' }); }, 30); }
  function editar(x) { form = {}; Object.keys(x).forEach(function (k) { form[k] = x[k]; }); PS.redesenhar(); setTimeout(function () { var f = document.querySelector('[data-fid="car:form"]'); if (f && f.scrollIntoView) f.scrollIntoView({ block: 'start' }); }, 30); }

  /* ---------- configurações ---------- */
  function configuracoes(cfg) {
    var el = { consAlcMin: numero('consAlcMin', cfg.consAlcMin), consAlcMax: numero('consAlcMax', cfg.consAlcMax), consMin: numero('consMin', cfg.consMin), consMax: numero('consMax', cfg.consMax), kmMes: numero('kmMes', cfg.kmMes, 'Ex.: 1200'), kmAtual: numero('kmAtual', cfg.kmAtual, 'Km do painel hoje'), oleoIntervalo: numero('oleoIntervalo', cfg.oleoIntervalo, '10000'), oleoAte: entrada('oleoAte', cfg.oleoAte, { type: 'date' }), precoAlcool: numero('precoAlcool', cfg.precoAlcool, 'Ex.: 4,59'), precoGasolina: numero('precoGasolina', cfg.precoGasolina, 'em branco'), tanque: numero('tanque', cfg.tanque, 'Ex.: 48') };
    function salvar() {
      var y = { id: 'carro-config', tipo: 'config' };
      Object.keys(el).forEach(function (k) { y[k] = k === 'oleoAte' ? el[k].value : lerNum(el[k].value); });
      salvarItem(y); sincAgenda(); verCfg = false; PS.aviso('Configurações salvas'); PS.redesenhar();
    }
    return h('div', { class: 'car-cfg', 'data-fid': 'car:cfg' },
      h('div', { class: 'car-dupla' }, campo('Álcool: consumo mín. km/l', el.consAlcMin), campo('Álcool: consumo máx. km/l', el.consAlcMax)),
      h('div', { class: 'car-dupla' }, campo('Gasolina: consumo mín. km/l', el.consMin), campo('Gasolina: consumo máx. km/l', el.consMax)),
      campo('Km rodados por mês', el.kmMes), h('p', { class: 'nota' }, 'Padrão 1.170 km, estimado assim: São Bernardo 231 km por semana mais escola 8 km por dia, 5 vezes por semana, total 271 km por semana x 4,33. Ajuste se mudar.'),
      campo('Preço do álcool R$/l', el.precoAlcool),
      h('p', { class: 'nota' }, 'Preço padrão R$ 3,50. Ajuste para o valor do seu posto.'),
      campo('Preço da gasolina R$/l (opcional)', el.precoGasolina),
      campo('Capacidade do tanque (litros)', el.tanque),
      campo('Próxima troca de óleo até', el.oleoAte),
      campo('Km atual do carro (odômetro)', el.kmAtual),
      campo('Intervalo da troca de óleo (km, só informação)', el.oleoIntervalo),
      h('div', { class: 'acoes car-acoes' }, botao('Salvar configurações', 'car:cfg-salvar', salvar, 'primario'), botao('Fechar', 'car:cfg-fechar', function () { verCfg = false; PS.redesenhar(); })));
  }

  /* ---------- gráficos SVG ---------- */
  function svg(tag, at, filhos) { var e = document.createElementNS(NS, tag); Object.keys(at || {}).forEach(function (k) { e.setAttribute(k, at[k]); }); (filhos || []).forEach(function (f) { if (f) e.appendChild(f); }); return e; }
  function txt(x, y, s, at) { var t = svg('text', at || {}); t.setAttribute('x', x); t.setAttribute('y', y); t.textContent = s; return t; }
  function vazio(msg) { return h('div', { class: 'car-vazio' }, I('carro'), h('p', null, msg)); }
  function linha(serie, o) {
    if (serie.length < 2) return vazio(o.vazio);
    var W = 320, H = 150, L = 34, R = 8, T = 10, B = 22, vs = serie.map(function (p) { return p.v; });
    var mi = Math.min.apply(null, vs.concat(o.faixa || [])), ma = Math.max.apply(null, vs.concat(o.faixa || []));
    if (ma - mi < 1e-9) { ma += 1; mi -= 1; } var pad = (ma - mi) * .12; mi -= pad; ma += pad;
    function X(i) { return L + i * (W - L - R) / (serie.length - 1); } function Y(v) { return T + (ma - v) * (H - T - B) / (ma - mi); }
    var g = [];
    if (o.faixa) g.push(svg('rect', { x: L, y: Y(Math.max(o.faixa[0], o.faixa[1])), width: W - L - R, height: Math.max(2, Math.abs(Y(o.faixa[0]) - Y(o.faixa[1]))), class: 'car-faixa' }));
    [ma - pad, mi + pad].forEach(function (v) { g.push(svg('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: 'car-grade' })); g.push(txt(2, Y(v) + 4, num(v, o.dec), { class: 'car-eixo' })); });
    g.push(svg('polyline', { points: serie.map(function (p, i) { return X(i) + ',' + Y(p.v); }).join(' '), class: 'car-linha' }));
    serie.forEach(function (p, i) { g.push(svg('circle', { cx: X(i), cy: Y(p.v), r: 4, class: 'car-ponto' }, [svg('title', {}, [document.createTextNode(dataBR(p.data) + ': ' + num(p.v, o.dec) + ' ' + o.un)])])); });
    g.push(txt(L, H - 6, dataBR(serie[0].data).slice(0, 5), { class: 'car-eixo' })); g.push(txt(W - R, H - 6, dataBR(serie[serie.length - 1].data).slice(0, 5), { class: 'car-eixo', 'text-anchor': 'end' }));
    var ult = serie[serie.length - 1];
    return h('div', { class: 'car-graf' }, svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': o.titulo + '. Último: ' + num(ult.v, o.dec) + ' ' + o.un }, g),
      h('p', { class: 'nota' }, 'Último: ' + num(ult.v, o.dec) + ' ' + o.un + (o.faixa ? ' · faixa de referência ' + num(o.faixa[0]) + ' a ' + num(o.faixa[1]) + ' km/l' : '')));
  }
  var CORES = { abastecimento: 'c1', servico: 'c2', oleo: 'c3', ipva: 'c4', multa: 'c5', licenciamento: 'c6', seguro: 'c7' };
  function barras(meses) {
    if (!meses.length) return vazio('Sem gastos lançados ainda. Os gastos por mês aparecem aqui.');
    var W = 320, H = 160, L = 6, B = 22, T = 16, ma = Math.max.apply(null, meses.map(function (m) { return m.total; })), bw = (W - L * 2) / meses.length, g = [];
    meses.forEach(function (m, i) {
      var y = H - B, x = L + i * bw + bw * .18, w = bw * .64;
      C.GASTOS.forEach(function (c) { var v = m.cats[c]; if (!v) return; var hh = v / ma * (H - B - T); y -= hh; g.push(svg('rect', { x: x, y: y, width: w, height: Math.max(1, hh), rx: 2, class: 'car-b ' + CORES[c] }, [svg('title', {}, [document.createTextNode(C.TIPOS[c] + ': ' + brl(v))])])); });
      g.push(txt(x + w / 2, H - 6, U.MESES ? U.MESES[+m.mes.slice(5, 7) - 1].slice(0, 3) : m.mes.slice(5), { class: 'car-eixo', 'text-anchor': 'middle' }));
      g.push(txt(x + w / 2, y - 3, num(Math.round(m.total), 0), { class: 'car-eixo', 'text-anchor': 'middle' }));
    });
    var usados = C.GASTOS.filter(function (c) { return meses.some(function (m) { return m.cats[c]; }); });
    return h('div', { class: 'car-graf' }, svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Gastos por mês: ' + meses.map(function (m) { return m.mes + ' ' + brl(m.total); }).join('; ') }, g),
      h('div', { class: 'car-legenda' }, usados.map(function (c) { return h('span', null, h('i', { class: 'car-b ' + CORES[c] }), C.TIPOS[c]); })));
  }

  /* ---------- desenho do carro ---------- */
  function desenho(pend) {
    var porParte = {};
    pend.forEach(function (p) { (porParte[p.parte] = porParte[p.parte] || []).push(p); });
    var g = [];
    /* carroceria (SUV compacto genérico, vista de cima) */
    g.push(svg('rect', { x: 22, y: 6, width: 116, height: 234, rx: 34, class: 'car-corpo' }));
    g.push(svg('rect', { x: 44, y: 72, width: 72, height: 104, rx: 14, class: 'car-cabine' }));
    [[8, 40], [138, 40], [8, 180], [138, 180]].forEach(function (r) { g.push(svg('rect', { x: r[0], y: r[1], width: 14, height: 30, rx: 5, class: 'car-roda' })); });
    PARTES.forEach(function (p) {
      var r = p[3], tem = porParte[p[0]], at = { x: r[0], y: r[1], width: r[2], height: r[3], rx: 4, class: 'car-zona' + (tem ? ' tem g-' + (tem[0].gravidade || 'pend') : ''), 'data-fid': 'car:zona:' + p[0], role: 'button', tabindex: '0', 'aria-label': p[1] + (tem ? ': ' + tem.length + ' pendência(s)' : '') };
      var z = svg('rect', at); z.addEventListener('click', function () { parteSel = p[0]; PS.redesenhar(); });
      g.push(z);
    });
    Object.keys(porParte).forEach(function (id) {
      var p = parte(id); if (!p) return; var r = p[3], cx = r[0] + r[2] / 2, cy = r[1] + r[3] / 2, l = porParte[id], gv = l[0].gravidade || 'pend';
      var m = svg('g', { class: 'car-marca g-' + gv, 'data-fid': 'car:marca:' + id, role: 'button', tabindex: '0', 'aria-label': p[1] + ': ' + l.map(function (x) { return x.problema; }).join(', ') },
        [svg('circle', { cx: cx, cy: cy, r: 11 }), txt(cx, cy + 4, l.length > 1 ? String(l.length) : (gv === 'grave' ? '!!' : gv === 'media' ? '!' : gv === 'leve' ? 'i' : '?'), { 'text-anchor': 'middle' })]);
      m.addEventListener('click', function () { parteSel = id; PS.redesenhar(); });
      g.push(m);
    });
    return svg('svg', { viewBox: '0 0 160 246', class: 'car-desenho', role: 'img', 'aria-label': 'Desenho do carro visto de cima. ' + (pend.length ? pend.length + ' pendência(s) aberta(s).' : 'Sem pendências.') }, g);
  }
  function areaDesenho(lista) {
    var pend = lista.filter(function (x) { return x.tipo === 'pendencia' && x.status !== 'resolvida'; });
    var sel = parteSel ? parte(parteSel) : null, daParte = sel ? lista.filter(function (x) { return x.tipo === 'pendencia' && x.parte === parteSel; }) : [];
    var det = sel ? h('div', { class: 'car-item car-detalhe', 'data-fid': 'car:detalhe' },
      h('strong', null, sel[1]),
      daParte.length ? daParte.map(function (x) {
        return h('div', { class: 'car-pend g-' + (x.gravidade || 'pend') },
          h('span', { class: 'selo' }, x.problema || 'Problema'), h('span', { class: 'selo car-grav' }, GRAV[x.gravidade || '']), x.status === 'resolvida' ? h('span', { class: 'selo' }, 'Resolvida') : null,
          x.desc ? h('p', { class: 'nota' }, x.desc) : null, h('small', null, 'Notado em ' + dataBR(x.data)),
          h('div', { class: 'acoes car-acoes' },
            x.status !== 'resolvida' ? botao('Resolver e lançar serviço', 'car:resolver:' + x.id, function () { novo('servico', { desc: sel[1] + ': ' + (x.problema || '') + (x.desc ? ', ' + x.desc : ''), deResolver: x.id }); }, 'primario') : null,
            botao('Editar', 'car:pedit:' + x.id, function () { editar(x); }), botao('Excluir', 'car:pexc:' + x.id, function () { excluir(x); }, 'perigo')));
      }) : h('p', { class: 'nota' }, 'Nenhuma pendência nesta parte.'),
      h('div', { class: 'acoes car-acoes' }, botao('Nova pendência aqui', 'car:pnova', function () { novo('pendencia', { parte: parteSel }); }), botao('Fechar', 'car:pfechar', function () { parteSel = null; PS.redesenhar(); }))) : null;
    return h('section', { class: 'cartao car-vidro', 'data-fid': 'car:area-desenho' },
      h('h2', null, I('carro'), h('span', null, 'Pendências no carro')),
      h('p', { class: 'nota' }, pend.length ? 'Toque numa parte ou num marcador para ver o detalhe.' : 'Sem pendências. Toque numa parte para registrar um problema.'),
      h('div', { class: 'car-desenho-caixa' }, desenho(pend)),
      h('div', { class: 'car-legenda' }, ['leve', 'media', 'grave', 'pend'].map(function (k) { return h('span', null, h('i', { class: 'car-gv g-' + k }), k === 'pend' ? 'Gravidade pendente' : GRAV[k]); })),
      det, h('div', { class: 'acoes car-acoes' }, botao('Registrar pendência', 'car:pend-nova', function () { novo('pendencia', {}); })));
  }

  /* ---------- página ---------- */
  function linhaHist(x) {
    var info = [dataBR(x.data)];
    if (x.tipo === 'abastecimento') { info.push(C.COMBS[x.comb] || ''); if (x.litros) info.push(num(x.litros) + ' l'); var p = C.precoLitro(x.valor, x.litros); if (p) info.push(brl(p) + '/l'); }
    if (x.tipo === 'oleo' && x.oleo) info.push(x.oleo);
    if (x.km) info.push(num(x.km, 0) + ' km');
    if (x.desc) info.push(x.desc); if (x.oficina) info.push(x.oficina);
    return h('div', { class: 'car-item', 'data-fid': 'car:hist:' + x.id },
      h('div', { class: 'car-item-topo' }, h('strong', null, C.TIPOS[x.tipo]), h('strong', { class: 'car-valor' }, x.valor ? brl(x.valor) : '')),
      h('small', null, info.filter(Boolean).join(' · ')),
      h('div', { class: 'acoes car-acoes' }, botao('Editar', 'car:edit:' + x.id, function () { editar(x); }), botao('Excluir', 'car:exc:' + x.id, function () { excluir(x); }, 'perigo')));
  }
  function cartaoOleo(o) {
    var pct = o.progresso != null ? Math.round(o.progresso * 100) : null;
    return h('section', { class: 'cartao car-vidro car-oleo' + (o.avisar ? ' car-aviso' : ''), 'data-fid': 'car:oleo' },
      h('h2', null, I('carro'), h('span', null, 'Troca de óleo')),
      h('div', { class: 'car-oleo-num' }, h('strong', { 'data-fid': 'car:oleo-ate' }, o.ate ? 'Até ' + dataBR(o.ate) : 'Sem prazo'), h('small', null, o.ate ? (o.dias < 0 ? 'atrasada ' + (-o.dias) + ' dias' : o.dias === 0 ? 'hoje' : 'faltam ' + o.dias + ' dias') : 'informe a data nas configurações')),
      o.restantes != null ? h('small', { 'data-fid': 'car:oleo-rest' }, (o.restantes < 0 ? 'Passou ' + num(-o.restantes, 0) + ' km da troca' : 'Faltam ' + num(o.restantes, 0) + ' km')) : null,
      pct != null ? h('div', { class: 'car-barra', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': 'Uso do óleo' }, h('i', { style: 'width:' + pct + '%' })) : null,
      h('small', null, [o.ultima ? 'Última: ' + dataBR(o.ultima.data) + (o.ultima.km ? ' com ' + num(o.ultima.km, 0) + ' km' : '') + (o.ultima.oleo ? ', ' + o.ultima.oleo : '') : 'Nenhuma troca lançada', o.proxKm ? 'próxima em ' + num(o.proxKm, 0) + ' km' : '', 'intervalo ' + num(o.intervalo, 0) + ' km'].filter(Boolean).join(' · ')),
      o.faltaKmAtual && o.ultima ? h('p', { class: 'nota', 'data-fid': 'car:oleo-kmatual' }, 'Preencha o km atual do carro nas configurações para ver quanto falta em km.') : null,
      h('div', { class: 'acoes car-acoes' }, botao('Registrar troca', 'car:oleo-novo', function () { novo('oleo'); }, o.avisar ? 'primario' : ''), botao('Ajustar prazo e km', 'car:oleo-cfg', function () { verCfg = true; PS.redesenhar(); setTimeout(function () { var e = document.querySelector('[data-fid="car:cfg"]'); if (e) e.scrollIntoView({ block: 'start' }); }, 40); })));
  }
  /* ---------- Agenda: os lembretes do carro são compromissos da própria Agenda (etiqueta Carro, mesmos dados e sincronização) ---------- */
  var RX_CARRO = /\b(carro|óleo|oleo|ipva|licenciamento|seguro do carro|revis[aã]o|oficina|pneu|mec[aâ]nico)\b/i;
  var verTodosAg = false;
  function evento(s, id) { var r = null; (s.compromissos || []).forEach(function (c) { if (c.id === id) r = c; }); return r; }
  /* aplica as datas editadas na Agenda de volta nos itens do carro (o evento manda depois de criado) */
  function comAgenda(lista) {
    var s = S.get();
    return lista.map(function (x) {
      var e = null;
      if (x.tipo === 'vencimento') e = evento(s, 'car-v-' + x.id);
      if (x.tipo === 'config') e = evento(s, 'car-oleo');
      if (!e) return x;
      var y = {}; Object.keys(x).forEach(function (k) { y[k] = x[k]; });
      if (x.tipo === 'vencimento') y.data = e.data; else y.oleoAte = e.data;
      return y;
    });
  }
  function sincAgenda() {
    S.alterar(function (s) {
      if (!s.compromissos) s.compromissos = [];
      var l = s.carro || [], hoje = U.hoje(), cfg = C.config(l), o = C.oleo(l, cfg, hoje), quero = {};
      l.forEach(function (x) { if (x.tipo === 'vencimento' && x.data && C.ANUAIS[x.cat]) quero['car-v-' + x.id] = { titulo: C.ANUAIS[x.cat] + ' do carro vence' + (x.desc ? ' (' + x.desc + ')' : ''), data: x.data, repete: 'anual' }; });
      if (o.ate) quero['car-oleo'] = { titulo: 'Troca de óleo do carro (prazo)', data: o.ate, repete: '' };
      s.compromissos = s.compromissos.filter(function (c) { return !(/^car-(v-|oleo)/.test(c.id) && !quero[c.id]); });
      Object.keys(quero).forEach(function (id) {
        var q = quero[id], c = evento(s, id);
        if (!c) { c = S.sanearItem('compromissos', id, { id: id, titulo: q.titulo, data: q.data, hora: '', local: '', repete: q.repete, etiqueta: 'carro' }); if (c) s.compromissos.push(c); }
        else { c.titulo = q.titulo; c.data = q.data; c.repete = q.repete; c.etiqueta = 'carro'; }
      });
    }, true);
  }
  function widgetAgenda() {
    var s = S.get(), hoje = U.hoje(), fim = U.somaDias(hoje, 400);
    var base = (s.compromissos || []).filter(function (c) { return !c.exemplo && (c.etiqueta === 'carro' || RX_CARRO.test(c.titulo || '')); });
    var l = (PS.rep ? PS.rep.expandir(base, hoje, fim) : base.filter(function (c) { return c.data >= hoje; })).sort(function (a, b) { return (a.data + (a.hora || '')) < (b.data + (b.hora || '')) ? -1 : 1; });
    var mostra = verTodosAg ? l : l.slice(0, 4);
    return h('section', { class: 'cartao car-vidro', 'data-fid': 'car:agenda' }, h('h2', null, I('relogio'), h('span', null, 'Agenda do carro')),
      h('p', { class: 'nota' }, 'Os mesmos compromissos da aba Agenda, com etiqueta Carro. Mudou lá, muda aqui.'),
      mostra.length ? mostra.map(function (c) {
        var d = U.difDias(c.data, hoje);
        return h('a', { class: 'car-item car-ag', href: '#/agenda', 'data-fid': 'car:ag:' + (c.origem || c.id) + ':' + c.data },
          h('div', { class: 'car-item-topo' }, h('strong', null, c.titulo), h('strong', { class: 'car-valor' }, dataBR(c.data).slice(0, 5))),
          h('small', null, [d === 0 ? 'hoje' : d === 1 ? 'amanhã' : 'em ' + d + ' dias', c.hora, c.repete === 'anual' ? 'repete todo ano' : ''].filter(Boolean).join(' · ')));
      }) : h('div', { class: 'car-vazio' }, I('relogio'), h('p', null, 'Nada do carro na Agenda. Toque em Enviar lembretes para a Agenda.')),
      h('div', { class: 'acoes car-acoes' },
        l.length > 4 ? botao(verTodosAg ? 'Ver menos' : 'Ver todos (' + l.length + ')', 'car:ag-todos', function () { verTodosAg = !verTodosAg; PS.redesenhar(); }) : null,
        botao('Enviar lembretes para a Agenda', 'car:ag-sinc', function () { sincAgenda(); PS.aviso('Lembretes do carro na Agenda'); PS.redesenhar(); }),
        h('a', { class: 'btn', href: '#/agenda', 'data-fid': 'car:ag-abrir' }, 'Abrir Agenda')));
  }
  function cartaoLembretes(l) {
    return h('section', { class: 'cartao car-vidro', 'data-fid': 'car:lembretes' }, h('h2', null, I('sino'), h('span', null, 'Lembretes por data ou km')),
      h('p', { class: 'nota' }, 'Vence o que chegar primeiro: a data ou o km. Para ver os km, preencha o km atual nas configurações.'),
      l.length ? l.map(function (x, i) {
        var q = [x.data ? dataBR(x.data) + (x.dias < 0 ? ' (atrasado ' + (-x.dias) + ' dias)' : ' (em ' + x.dias + ' dias)') : '', x.proxKm ? num(x.proxKm, 0) + ' km' + (x.restKm != null ? (x.restKm < 0 ? ' (passou ' + num(-x.restKm, 0) + ' km)' : ' (faltam ' + num(x.restKm, 0) + ' km)') : '') : ''].filter(Boolean).join(' ou ');
        return h('div', { class: 'car-item car-lemb', 'data-fid': 'car:lemb:' + i },
          h('div', { class: 'car-item-topo' }, h('strong', null, x.rotulo), h('span', { class: 'car-nivel n-' + x.nivel, 'data-fid': 'car:nivel:' + i }, C.NIVEIS[x.nivel])),
          h('small', null, q),
          x.origem === 'lembrete' ? h('div', { class: 'acoes car-acoes' }, botao('Editar', 'car:ledit:' + i, function () { editar(x.item); }), botao('Excluir', 'car:lexc:' + i, function () { excluir(x.item); }, 'perigo')) : null);
      }) : h('p', { class: 'vazio' }, 'Nenhum lembrete.'),
      h('div', { class: 'acoes car-acoes' }, botao('Novo lembrete', 'car:lemb-novo', function () { novo('lembrete'); })));
  }
  function cartaoTanques(t, an) {
    var ult = t.slice(-5).reverse();
    return h('section', { class: 'cartao car-vidro' + (an ? ' car-aviso' : ''), 'data-fid': 'car:tanques' }, h('h2', null, I('carro'), h('span', null, 'Consumo real por tanque')),
      an ? h('p', { class: 'car-alerta-txt', 'data-fid': 'car:anormal', role: 'alert' }, 'Consumo anormal: ' + num(an.tanque.kmL) + ' km/l, ' + an.queda + '% abaixo do configurado (' + num(an.ref) + ' km/l). Vale checar pneus, filtro de ar e velas.') : null,
      ult.length ? ult.map(function (x) { return h('div', { class: 'car-item' }, h('div', { class: 'car-item-topo' }, h('strong', null, num(x.kmL) + ' km/l'), h('strong', { class: 'car-valor' }, brl(x.custoKm) + '/km')), h('small', null, dataBR(x.de) + ' a ' + dataBR(x.ate) + ' · ' + num(x.km, 0) + ' km · ' + num(x.litros) + ' l')); })
        : h('p', { class: 'nota', 'data-fid': 'car:tanques-vazio' }, 'Marque "Tanque cheio" e informe o km em dois abastecimentos para medir o consumo real.'));
  }
  function render() {
    var lista = comAgenda(itens()), hoje = U.hoje(), r = C.resumo(lista), cfg = C.config(lista), km = cfg.kmMes > 0 ? cfg.kmMes : C.kmMes(lista), cu = C.custos(cfg, km), tq = C.tanque(cfg, 'alcool'), tqG = C.tanque(cfg, 'gasolina'), ser = C.series(lista), prev = C.proximoAbast(lista, cfg, km), ol = C.oleo(lista, cfg, hoje);
    var venc = C.vencimentos(lista, hoje), avs = venc.filter(function (v) { return v.avisar; });
    var tiposNovo = [['abastecimento', 'Abastecer'], ['oleo', 'Troca de óleo'], ['servico', 'Serviço'], ['ipva', 'IPVA'], ['multa', 'Multa'], ['licenciamento', 'Licenciamento'], ['seguro', 'Seguro'], ['lembrete', 'Lembrete']];
    var hist = lista.filter(function (x) { return C.GASTOS.indexOf(x.tipo) >= 0 && (filtro === 'todos' || x.tipo === filtro); }).sort(function (a, b) { return a.data < b.data ? 1 : a.data > b.data ? -1 : 0; });
    var cats = Object.keys(r.porCat).sort(function (a, b) { return r.porCat[b] - r.porCat[a]; });
    var mesAtual = hoje.slice(0, 7), lemb = C.lembretes(lista, cfg, hoje), tqs = C.tanques(lista), anor = C.anormal(lista, cfg), pnl = C.painel(lista, cfg, hoje);
    var el = h('div', { class: 'car-tela', 'data-fid': 'car:tela' },
      h('h1', { class: 'titulo-tela' }, 'Carro', h('small', null, 'gastos, vencimentos e pendências')),
      h('section', { class: 'cartao car-vidro car-painel ' + (pnl.ok ? 'n-ok' : 'n-' + pnl.principal.nivel), 'data-fid': 'car:painel', role: 'status' },
        h('strong', null, pnl.ok ? 'Tudo em dia' : pnl.principal.texto), h('small', null, pnl.ok ? 'Nenhum lembrete, vencimento ou alerta pendente.' : (pnl.total > 1 ? 'e mais ' + (pnl.total - 1) + (pnl.total === 2 ? ' aviso' : ' avisos') : 'o mais urgente agora'))),
      ol.urgente ? h('section', { class: 'cartao car-vidro car-urgente', 'data-fid': 'car:urgente', role: 'alert' }, h('strong', null, 'URGENTE'), h('p', null, 'Troca de óleo vence até ' + (U.DIAS ? U.DIAS[new Date(ol.ate + 'T12:00:00').getDay()].toLowerCase() + ', ' : '') + ol.ate.slice(8, 10) + '/' + ol.ate.slice(5, 7)), botao('Registrar troca', 'car:urg-novo', function () { novo('oleo'); }, 'primario')) : null,
      cartaoOleo(ol),
      cartaoLembretes(lemb),
      widgetAgenda(),
      avs.length ? h('section', { class: 'cartao car-vidro car-aviso', 'data-fid': 'car:avisos', role: 'status' }, h('h2', null, I('sino'), h('span', null, 'Vence em breve')),
        avs.map(function (v) { return h('p', null, h('strong', null, v.rotulo), ' vence ' + (v.dias === 0 ? 'hoje' : v.dias === 1 ? 'amanhã' : 'em ' + v.dias + ' dias') + ' (' + dataBR(v.data) + ')' + (v.item.valor ? ', previsto ' + brl(v.item.valor) : '')); })) : null,
      h('section', { class: 'cartao car-vidro' }, h('h2', null, I('carro'), h('span', null, 'Novo lançamento')),
        h('div', { class: 'car-grade-bt' }, tiposNovo.map(function (t) { return botao(t[1], 'car:novo:' + t[0], function () { novo(t[0]); }, t[0] === 'abastecimento' ? 'primario' : ''); }))),
      form ? formulario() : null,
      h('section', { class: 'cartao car-vidro', 'data-fid': 'car:resumo' }, h('h2', null, I('carteira'), h('span', null, 'Resumo')),
        h('div', { class: 'car-kpis' },
          h('div', { class: 'car-kpi' }, h('small', null, 'Gasto total'), h('strong', { 'data-fid': 'car:total' }, brl(r.total))),
          h('div', { class: 'car-kpi' }, h('small', null, 'Este mês'), h('strong', null, brl(r.porMes[mesAtual] || 0))),
          h('div', { class: 'car-kpi' }, h('small', null, 'Último abastecimento'), h('strong', null, r.ultAbast ? dataBR(r.ultAbast.data) : 'Nenhum'), r.ultAbast ? h('small', null, brl(r.ultAbast.valor) + (r.ultAbast.litros ? ' · ' + num(r.ultAbast.litros) + ' l' : '')) : null),
          h('div', { class: 'car-kpi' }, h('small', null, 'Última troca de óleo'), h('strong', null, r.ultOleo ? dataBR(r.ultOleo.data) : 'Nenhuma'), r.ultOleo ? h('small', null, [r.ultOleo.oleo, r.ultOleo.km ? num(r.ultOleo.km, 0) + ' km' : '', r.ultOleo.proxKm ? 'próxima ' + num(r.ultOleo.proxKm, 0) + ' km' : '', r.ultOleo.proxData ? 'próxima ' + dataBR(r.ultOleo.proxData) : ''].filter(Boolean).join(' · ')) : null)),
        cats.length ? h('div', { class: 'car-cats' }, cats.map(function (c) { return h('div', { class: 'car-cat' }, h('span', null, h('i', { class: 'car-b ' + CORES[c] }), C.TIPOS[c]), h('strong', null, brl(r.porCat[c]))); })) : null),
      h('section', { class: 'cartao car-vidro', 'data-fid': 'car:custos' }, h('h2', null, I('carro'), h('span', null, 'Custo por km e autonomia')),
        cu.alcool || cu.gasolina ? ['alcool', 'gasolina'].filter(function (k) { return cu[k]; }).map(function (k) {
          var c = cu[k]; return h('div', { class: 'car-item' }, h('strong', null, (k === 'alcool' ? 'Álcool' : 'Gasolina') + ': ' + brl(c.porKm) + ' por km'),
            h('small', null, 'Faixa ' + brl(c.porKmMin) + ' a ' + brl(c.porKmMax) + ' por km · ' + brl(c.por100) + ' a cada 100 km' + (c.mes ? ' · cerca de ' + brl(c.mes) + ' por mês (' + num(km, 0) + ' km/mês)' : '')));
        }) : h('p', { class: 'nota' }, 'Informe o preço do combustível nas configurações.'),
        km ? null : h('p', { class: 'nota' }, 'Custo mensal estimado: preencha Km rodados por mês nas configurações.'),
        tq ? h('div', { class: 'car-item', 'data-fid': 'car:tanque' }, h('strong', null, 'Autonomia com tanque cheio: ' + num(tq.kmMin, 0) + ' a ' + num(tq.kmMax, 0) + ' km (álcool)'),
          h('small', null, [tq.encherAlcool ? 'Encher com álcool: ' + brl(tq.encherAlcool) : '', tqG ? 'gasolina: ' + num(tqG.kmMin, 0) + ' a ' + num(tqG.kmMax, 0) + ' km' : '', tqG && tqG.encherGasolina ? 'encher com gasolina: ' + brl(tqG.encherGasolina) : ''].filter(Boolean).join(' · ')))
          : h('p', { class: 'nota', 'data-fid': 'car:tanque-vazio' }, 'Preencha a capacidade do tanque nas configurações para ver a autonomia e o custo para encher.'),
        prev ? h('div', { class: 'car-item', 'data-fid': 'car:previsao' }, h('strong', null, 'Próximo abastecimento: por volta de ' + dataBR(prev.data)), h('small', null, 'Estimativa: autonomia de ' + num(prev.autonomia, 0) + ' km a ' + num(km, 0) + ' km/mês' + (prev.kmPrevisto ? ', perto de ' + num(prev.kmPrevisto, 0) + ' km no painel' : '')))
          : h('p', { class: 'nota', 'data-fid': 'car:previsao-vazia' }, 'Previsão do próximo abastecimento: precisa de um abastecimento, da capacidade do tanque e dos km por mês.'),
        h('p', { class: 'nota' }, 'Consumo: álcool ' + num(cfg.consAlcMin) + ' a ' + num(cfg.consAlcMax) + ' km/l, gasolina ' + num(cfg.consMin) + ' a ' + num(cfg.consMax) + ' km/l · álcool ' + (cfg.precoAlcool ? brl(cfg.precoAlcool) + '/l' : 'sem preço') + (cfg.precoGasolina ? ' · gasolina ' + brl(cfg.precoGasolina) + '/l' : '')),
        verCfg ? configuracoes(cfg) : h('div', { class: 'acoes car-acoes' }, botao('Configurações do carro', 'car:cfg-abrir', function () { verCfg = true; PS.redesenhar(); }))),
      cartaoTanques(tqs, anor),
      h('section', { class: 'cartao car-vidro', 'data-fid': 'car:graficos' }, h('h2', null, I('carro'), h('span', null, 'Gráficos')),
        h('h3', { class: 'car-h3' }, 'Consumo km/l'), linha(ser.consumo, { titulo: 'Consumo km/l', un: 'km/l', dec: 2, faixa: [cfg.consAlcMin, cfg.consAlcMax], vazio: 'Registre o km em dois abastecimentos ou mais para ver o consumo.' }),
        h('h3', { class: 'car-h3' }, 'Gastos por mês e categoria'), barras(C.porMesCat(lista, 6)),
        h('h3', { class: 'car-h3' }, 'Custo por km'), linha(ser.custoKm, { titulo: 'Custo por km', un: 'R$/km', dec: 3, vazio: 'Registre o km em dois abastecimentos ou mais para ver o custo por km.' })),
      h('section', { class: 'cartao car-vidro', 'data-fid': 'car:vencimentos' }, h('h2', null, I('sino'), h('span', null, 'Vencimentos anuais')),
        h('p', { class: 'nota' }, 'IPVA, Licenciamento e Seguro repetem todo ano. O aviso aparece aqui e na Ajudante.'),
        venc.length ? venc.map(function (v) {
          return h('div', { class: 'car-item' + (v.avisar ? ' car-alerta' : ''), 'data-fid': 'car:venc:' + v.item.id },
            h('div', { class: 'car-item-topo' }, h('strong', null, v.rotulo), h('strong', { class: 'car-valor' }, v.item.valor ? brl(v.item.valor) : '')),
            h('small', null, 'Próximo: ' + dataBR(v.data) + ' · ' + (v.dias === 0 ? 'hoje' : 'em ' + v.dias + ' dias') + ' · aviso ' + v.item.antec + ' dias antes'),
            h('div', { class: 'acoes car-acoes' }, botao('Editar', 'car:vedit:' + v.item.id, function () { editar(v.item); }), botao('Excluir', 'car:vexc:' + v.item.id, function () { excluir(v.item); }, 'perigo')));
        }) : h('p', { class: 'vazio' }, 'Nenhum vencimento cadastrado.'),
        h('div', { class: 'acoes car-acoes' }, botao('Cadastrar vencimento', 'car:venc-novo', function () { novo('vencimento'); }))),
      h('section', { class: 'cartao car-vidro', 'data-fid': 'car:historico' }, h('h2', null, I('relogio'), h('span', null, 'Histórico')),
        h('label', { class: 'campo' }, h('span', null, 'Mostrar'), (function () { var s = selecao('filtro', [['todos', 'Todos']].concat(C.GASTOS.map(function (t) { return [t, C.TIPOS[t]]; })), filtro); s.addEventListener('change', function () { filtro = s.value; PS.redesenhar(); }); return s; })()),
        hist.length ? hist.map(linhaHist) : h('p', { class: 'vazio' }, 'Nenhum lançamento ainda.')),
      areaDesenho(lista));
    return el;
  }
  PS.views.carro = { reativo: true, titulo: 'Carro', render: render };
  PS.carro = { PARTES: PARTES, LATARIA: LATARIA, MECANICO: MECANICO, avisos: function () { var l = itens(), hj = U.hoje(), a = C.avisos(l, hj), o = C.oleo(l, C.config(l), hj); if (o.avisar) a.unshift({ rotulo: 'Troca de óleo', dias: o.dias != null ? Math.max(0, o.dias) : 0 }); return a; } };
})(window);
