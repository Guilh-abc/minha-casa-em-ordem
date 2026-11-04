/* Contas do painel de cartões (puro; navegador e Node). Tudo calculado no aparelho a partir dos lançamentos já extraídos. ES5. */
(function (g) {
  'use strict';
  function r2(v) { return Math.round(v * 100) / 100; }
  function norm(s) { s = String(s || ''); if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); return s.toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function ymDe(d) { return d ? d.slice(0, 7) : ''; }
  function somaMes(ym, n) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + '-' + p2(m + 1); }
  function diasEntre(a, b) { var A = a.split('-'), B = b.split('-'); return Math.round((Date.UTC(+B[0], +B[1] - 1, +B[2]) - Date.UTC(+A[0], +A[1] - 1, +A[2])) / 86400000); }

  function lancsDe(s, faturaId) { return (s.lancs || []).filter(function (l) { return l.fatura === faturaId; }); }
  function total(f, ls) { if (ls && ls.length) return r2(ls.reduce(function (a, l) { return a + l.valor; }, 0)); return f && f.valor != null ? f.valor : 0; }
  function faturaTotal(s, f) { var ls = lancsDe(s, f.id); return ls.length ? total(f, ls) : (f.valor != null ? f.valor : 0); }

  function porCategoria(ls) {
    var m = {}, t = 0;
    ls.forEach(function (l) { if (l.valor > 0) { m[l.cat] = (m[l.cat] || 0) + l.valor; t += l.valor; } });
    return Object.keys(m).map(function (c) { return { cat: c, total: r2(m[c]), pct: t ? Math.round(m[c] / t * 1000) / 10 : 0 }; }).sort(function (a, b) { return b.total - a.total; });
  }
  function top(ls, n) { return ls.filter(function (l) { return l.valor > 0; }).slice().sort(function (a, b) { return b.valor - a.valor; }).slice(0, n || 10); }

  /* assinaturas: mesmo estabelecimento em 2+ faturas diferentes com valor parecido (±15%) ou categoria "assinaturas" */
  function assinaturas(s) {
    var grupos = {};
    (s.lancs || []).forEach(function (l) {
      if (l.valor <= 0 || l.pt > 0) return;
      var f = (s.faturas || []).filter(function (x) { return x.id === l.fatura; })[0]; if (!f || f.teste) return;
      var k = norm(l.desc).split(' ').slice(0, 2).join(' '); if (!k) return;
      var gp = grupos[k] = grupos[k] || { nome: l.desc, itens: [], faturas: {} };
      gp.itens.push(l); gp.faturas[f.id] = f.mes || ymDe(f.vencimento || l.data);
    });
    var out = [];
    Object.keys(grupos).forEach(function (k) {
      var gp = grupos[k], meses = {}; Object.keys(gp.faturas).forEach(function (id) { meses[gp.faturas[id]] = 1; });
      var nm = Object.keys(meses).length, vs = gp.itens.map(function (l) { return l.valor; }), mn = Math.min.apply(null, vs), mx = Math.max.apply(null, vs);
      var porCat = gp.itens[0].cat === 'assinaturas';
      if ((nm >= 2 && mx <= mn * 1.15) || porCat) { var ult = gp.itens.slice().sort(function (a, b) { return a.data < b.data ? 1 : -1; })[0]; out.push({ nome: gp.nome, valor: ult.valor, meses: nm, cat: ult.cat, certeza: nm >= 2 ? 'recorrente' : 'pela categoria' }); }
    });
    out.sort(function (a, b) { return b.valor - a.valor; });
    return { lista: out, totalMensal: r2(out.reduce(function (a, x) { return a + x.valor; }, 0)) };
  }

  /* parcelas em andamento: última ocorrência de cada compra parcelada; restantes = pt - pa */
  function parcelas(s, hoje) {
    var ult = {};
    (s.lancs || []).forEach(function (l) {
      if (!(l.pt > 1) || l.valor <= 0) return;
      var f = (s.faturas || []).filter(function (x) { return x.id === l.fatura; })[0]; if (!f || f.teste) return;
      var k = norm(l.desc) + '|' + l.pt, ref = f.vencimento || l.data;
      if (!ult[k] || ref > ult[k].ref) ult[k] = { l: l, ref: ref, f: f };
    });
    var lista = [], tot = 0, calendario = {};
    var base = ymDe(hoje);
    Object.keys(ult).forEach(function (k) {
      var u = ult[k], rest = u.l.pt - u.l.pa; if (rest <= 0) return;
      var m0 = ymDe(u.ref), valorRest = r2(rest * u.l.valor); tot += valorRest;
      for (var i = 1; i <= rest; i++) { var m = somaMes(m0, i); if (m >= base) calendario[m] = r2((calendario[m] || 0) + u.l.valor); }
      lista.push({ desc: u.l.desc, pa: u.l.pa, pt: u.l.pt, valor: u.l.valor, restantes: rest, restante: valorRest, ate: somaMes(m0, rest) });
    });
    lista.sort(function (a, b) { return b.restante - a.restante; });
    var meses = Object.keys(calendario).sort().slice(0, 6).map(function (m) { return { mes: m, valor: calendario[m] }; });
    return { lista: lista, totalComprometido: r2(tot), proximosMeses: meses };
  }

  function comparar(a, b) { var dv = r2((a || 0) - (b || 0)); return { dv: dv, pct: b > 0 ? Math.round(dv / b * 1000) / 10 : null, dir: dv > 0.005 ? 'subiu' : dv < -0.005 ? 'caiu' : 'igual' }; }
  function evolucao(s, cartaoId) {
    var m = {};
    (s.faturas || []).forEach(function (f) { if (f.teste) return; if (cartaoId && f.cartao !== cartaoId) return; var k = f.mes || ymDe(f.vencimento); if (!k) return; m[k] = r2((m[k] || 0) + faturaTotal(s, f)); });
    var meses = Object.keys(m).sort().slice(-8).map(function (k) { return { mes: k, total: m[k] }; });
    meses.forEach(function (e, i) { e.vs = i ? comparar(e.total, meses[i - 1].total) : null; });
    return meses;
  }
  function csvCel(v) { v = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(v) && !/^-?\d+([.,]\d+)?$/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; }
  function csv(s, lancs) {
    var cart = {}, fat = {}; (s.cartoes || []).forEach(function (c) { cart[c.id] = c; }); (s.faturas || []).forEach(function (f) { fat[f.id] = f; });
    var linhas = [['Data', 'Descrição', 'Valor', 'Parcela', 'Categoria', 'Cartão', 'Fatura', 'De quem']];
    lancs.forEach(function (l) { var f = fat[l.fatura] || {}, c = cart[f.cartao] || {}; linhas.push([l.data, l.desc, String(l.valor).replace('.', ','), l.pt ? l.pa + '/' + l.pt : '', l.cat, c.apelido || f.cartao || '', f.mes || '', l.dono || f.dono || '']); });
    return '\ufeff' + linhas.map(function (r) { return r.map(csvCel).join(';'); }).join('\r\n') + '\r\n';
  }
  function filtrar(ls, o) {
    o = o || {}; var q = norm(o.q || '');
    return ls.filter(function (l) { return (!o.cat || l.cat === o.cat) && (!o.dono || (l.dono || '') === o.dono) && (!q || norm(l.desc).indexOf(q) >= 0); });
  }
  var API = { lancsDe: lancsDe, faturaTotal: faturaTotal, porCategoria: porCategoria, top: top, assinaturas: assinaturas, parcelas: parcelas, evolucao: evolucao, comparar: comparar, csv: csv, filtrar: filtrar, diasEntre: diasEntre, somaMes: somaMes, norm: norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else { g.PS = g.PS || {}; g.PS.cartoesCalc = API; }
})(typeof window !== 'undefined' ? window : this);
