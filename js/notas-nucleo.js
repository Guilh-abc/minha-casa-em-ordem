/* Compras feitas: núcleo puro (ler valores da nota, conferir soma, resumo do mês). ES5.  byGui */
(function (root, fab) {
  var m = fab();
  if (typeof module === 'object' && module.exports) module.exports = m;
  var g = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : root);
  g.PS = g.PS || {}; g.PS.notasN = m;
})(this, function () {
  function cent(v) { return Math.round(v * 100) / 100; }
  function valor(v) {
    if (typeof v === 'number') return isFinite(v) ? cent(v) : null;
    var s = String(v == null ? '' : v).replace(/R\$|\s/g, '');
    if (!/\d/.test(s)) return null;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    var n = parseFloat(s.replace(/[^\d.\-]/g, ''));
    return isFinite(n) ? cent(n) : null;
  }
  function qtd(v) { var n = valor(v); return n === null ? null : n; }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function data(s, hoje) {
    var m = String(s || '').match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
    if (!m) return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? s : '';
    var d = +m[1], me = +m[2], a = m[3] ? +m[3] : +String(hoje).slice(0, 4);
    if (a < 100) a += 2000;
    var dt = new Date(a, me - 1, d);
    if (dt.getMonth() !== me - 1 || dt.getDate() !== d) return '';
    var iso = a + '-' + p2(me) + '-' + p2(d);
    if (!m[3] && hoje && iso > hoje) iso = (a - 1) + iso.slice(4);
    return iso;
  }
  function brl(n) {
    if (n === null || n === undefined || !isFinite(n)) return '';
    var neg = n < 0, s = Math.abs(n).toFixed(2).split('.');
    return (neg ? '-' : '') + 'R$ ' + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + s[1];
  }
  function normalizar(o, hoje) {
    o = o || {};
    var itens = (o.itens || []).map(function (x) {
      return { nome: String(x.nome || '').trim().slice(0, 80), qtd: qtd(x.qtd), unit: valor(x.unit), total: valor(x.total) };
    }).filter(function (x) { return x.nome || x.total !== null; });
    var tot = valor(o.total), des = valor(o.desconto);
    /* a leitura às vezes devolve "R$ 0,00" no lugar de vazio: total 0 com itens não é total, é falta de total */
    if (tot === 0) tot = null;
    if (des === 0) des = null;
    return { loja: String(o.loja || '').trim().slice(0, 80), data: data(o.data, hoje), itens: itens, desconto: des, total: tot };
  }
  /* nota longa em várias fotos: junta as partes numa compra só.
     Itens repetidos na emenda (fim de uma foto = começo da seguinte) entram uma vez só.
     Loja e data vêm da primeira parte que os tiver; total e desconto da última (ficam no pé da nota). */
  function chaveItem(x) { var t = String(x.nome || '').toLowerCase(); if (t.normalize) t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); return t.replace(/[^a-z0-9]/g, '') + '|' + (x.total === null || x.total === undefined ? '' : x.total); }
  function juntar(partes, hoje) {
    var ns = (partes || []).map(function (p) { return normalizar(p, hoje); });
    var r = { loja: '', data: '', itens: [], desconto: null, total: null, partes: ns.length, repetidos: 0 };
    ns.forEach(function (n) {
      if (!r.loja && n.loja) r.loja = n.loja;
      if (!r.data && n.data) r.data = n.data;
      if (n.total !== null) r.total = n.total;
      if (n.desconto !== null) r.desconto = n.desconto;
      var novos = n.itens.slice(), max = Math.min(8, r.itens.length, novos.length), k, sob = 0;
      for (k = max; k > 0; k--) {
        var ok = true;
        for (var i = 0; i < k; i++) if (chaveItem(r.itens[r.itens.length - k + i]) !== chaveItem(novos[i])) { ok = false; break; }
        if (ok) { sob = k; break; }
      }
      r.repetidos += sob;
      r.itens = r.itens.concat(novos.slice(sob));
    });
    return r;
  }
  function somaItens(n) {
    var s = 0; (n.itens || []).forEach(function (x) { if (x.total !== null && x.total !== undefined) s += x.total; });
    return cent(s - (n.desconto || 0));
  }
  function conferir(n) {
    var falta = (n.itens || []).filter(function (x) { return x.total === null || x.total === undefined; }).length;
    var soma = somaItens(n), avisos = [];
    if (falta) avisos.push(falta + (falta > 1 ? ' itens sem total' : ' item sem total') + '. Preencha conferindo na nota.');
    if (n.total === null || n.total === undefined) avisos.push('Falta o total da nota.');
    else if (Math.abs(soma - n.total) > 0.009) avisos.push('A soma dos itens' + (n.desconto ? ' menos o desconto' : '') + ' dá ' + brl(soma) + ', mas o total da nota é ' + brl(n.total) + '. Confira os valores.');
    return { soma: soma, bate: !avisos.length, aviso: avisos.join(' ') };
  }
  /* total salvo; se faltar (ou ficou 0 com itens que somam algo), a soma dos itens */
  function totalDe(c) { var t = c.total; if (t !== null && t !== undefined && !(t === 0 && somaItens(c) > 0)) return t; return somaItens(c); }
  /* compra sem valor nenhum (nem total nem itens): precisa de correção */
  function semValor(c) { return !(totalDe(c) > 0); }
  function chave(l) { return String(l || '').trim().toLowerCase(); }
  function resumoMes(lista, ym) {
    var cs = (lista || []).filter(function (c) { return String(c.data || '').slice(0, 7) === ym; })
      .sort(function (a, b) { return a.data < b.data ? 1 : a.data > b.data ? -1 : 0; });
    var tot = 0, lojas = {}, ord = [];
    cs.forEach(function (c) {
      var v = totalDe(c); tot += v;
      var k = chave(c.loja) || '(sem loja)';
      if (!lojas[k]) { lojas[k] = { loja: String(c.loja || '').trim() || 'Sem loja', total: 0, n: 0 }; ord.push(k); }
      lojas[k].total = cent(lojas[k].total + v); lojas[k].n++;
    });
    var por = ord.map(function (k) { return lojas[k]; }).sort(function (a, b) { return b.total - a.total; });
    return { compras: cs, n: cs.length, total: cent(tot), porLoja: por };
  }
  function meses(lista) {
    var v = {}; (lista || []).forEach(function (c) { var k = String(c.data || '').slice(0, 7); if (/^\d{4}-\d{2}$/.test(k)) v[k] = 1; });
    return Object.keys(v).sort().reverse();
  }
  return { valor: valor, qtd: qtd, data: data, brl: brl, normalizar: normalizar, conferir: conferir, somaItens: somaItens, totalDe: totalDe, semValor: semValor, juntar: juntar, resumoMes: resumoMes, meses: meses };
});
