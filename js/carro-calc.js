/* Carro: regras puras (sem DOM). Preço por litro, vencimentos anuais (IPVA, Licenciamento, Seguro), resumo de gastos.
   Testado em Node (tools/teste-carro.js). ES5.  byGui */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else { raiz.PS = raiz.PS || {}; raiz.PS.carroCalc = fabrica(); }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var TIPOS = { abastecimento: 'Abastecimento', oleo: 'Troca de óleo', servico: 'Serviço', ipva: 'IPVA', multa: 'Multa', licenciamento: 'Licenciamento', seguro: 'Seguro', vencimento: 'Vencimento anual', pendencia: 'Pendência' };
  var GASTOS = ['abastecimento', 'oleo', 'servico', 'ipva', 'multa', 'licenciamento', 'seguro'];
  var ANUAIS = { ipva: 'IPVA', licenciamento: 'Licenciamento', seguro: 'Seguro' };
  var COMBS = { alcool: 'Álcool', gasolina: 'Gasolina', diesel: 'Diesel', gnv: 'GNV', outro: 'Outro' };
  function n2(v) { return Math.round(v * 100) / 100; }
  function precoLitro(valor, litros) { valor = Number(valor); litros = Number(litros); return valor > 0 && litros > 0 ? Math.round(valor / litros * 1000) / 1000 : null; }
  function utc(iso) { var p = iso.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function dif(a, b) { return Math.round((utc(a) - utc(b)) / 86400000); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ultimoDia(a, m) { return new Date(Date.UTC(a, m, 0)).getUTCDate(); }
  /* próxima data (>= hoje) com o mesmo dia e mês da data cadastrada; repete todo ano */
  function proximoVenc(data, hoje) {
    if (!data || !hoje) return '';
    var m = +data.slice(5, 7), d = +data.slice(8, 10), a = +hoje.slice(0, 4);
    if (data >= hoje) return data;
    for (var i = 0; i < 3; i++) {
      var x = (a + i) + '-' + pad(m) + '-' + pad(Math.min(d, ultimoDia(a + i, m)));
      if (x >= hoje) return x;
    }
    return '';
  }
  /* vencimentos com aviso: [{item, rotulo, data, dias, avisar}] ordenados pela data */
  function vencimentos(itens, hoje) {
    return (itens || []).filter(function (x) { return x.tipo === 'vencimento' && ANUAIS[x.cat] && x.data; }).map(function (x) {
      var p = proximoVenc(x.data, hoje), dias = p ? dif(p, hoje) : null, ant = x.antec == null ? 15 : x.antec;
      return { item: x, rotulo: ANUAIS[x.cat] + (x.desc ? ' (' + x.desc + ')' : ''), data: p, dias: dias, avisar: dias != null && dias <= ant };
    }).sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });
  }
  function avisos(itens, hoje) { return vencimentos(itens, hoje).filter(function (v) { return v.avisar; }); }
  function ultimo(itens, tipo) {
    var l = (itens || []).filter(function (x) { return x.tipo === tipo && x.data; }).sort(function (a, b) { return b.data < a.data ? -1 : b.data > a.data ? 1 : 0; });
    return l[0] || null;
  }
  function resumo(itens) {
    var total = 0, porCat = {}, porMes = {}, litros = 0, gastoComb = 0;
    (itens || []).forEach(function (x) {
      if (GASTOS.indexOf(x.tipo) < 0 || !(x.valor > 0)) return;
      total += x.valor; porCat[x.tipo] = n2((porCat[x.tipo] || 0) + x.valor);
      if (x.data) { var m = x.data.slice(0, 7); porMes[m] = n2((porMes[m] || 0) + x.valor); }
      if (x.tipo === 'abastecimento' && x.litros > 0) { litros += x.litros; gastoComb += x.valor; }
    });
    return { total: n2(total), porCat: porCat, porMes: porMes, litros: n2(litros), precoMedio: precoLitro(gastoComb, litros),
      ultAbast: ultimo(itens, 'abastecimento'), ultOleo: ultimo(itens, 'oleo') };
  }
  /* consMin/consMax = gasolina; consAlcMin/consAlcMax = álcool (padrão igual até ser editado) */
  var PADRAO_CFG = { consMin: 6.2, consMax: 6.3, consAlcMin: 6.2, consAlcMax: 6.3, precoAlcool: 3.5, precoGasolina: null, tanque: null, kmMes: 1170, kmAtual: null, oleoIntervalo: 10000, oleoAte: '2026-11-07' };
  var VAZIOS = ['precoGasolina', 'tanque', 'kmAtual'];
  function config(itens) {
    var c = null; (itens || []).forEach(function (x) { if (x.tipo === 'config') c = x; });
    var r = {}; Object.keys(PADRAO_CFG).forEach(function (k) { r[k] = c && c[k] != null && c[k] !== '' ? c[k] : (c ? (VAZIOS.indexOf(k) >= 0 ? null : PADRAO_CFG[k]) : PADRAO_CFG[k]); });
    r.salvo = !!c; return r;
  }
  /* km rodados por mês a partir das leituras de km (abastecimentos, óleo, serviços); null se faltar dado */
  function kmMes(itens) {
    var l = (itens || []).filter(function (x) { return x.km > 0 && x.data; }).sort(function (a, b) { return a.data < b.data ? -1 : 1; });
    if (l.length < 2) return null;
    var dias = dif(l[l.length - 1].data, l[0].data), km = l[l.length - 1].km - l[0].km;
    if (dias < 7 || km <= 0) return null;
    return Math.round(km / dias * 30.4);
  }
  /* custo por km = preço / consumo; faixa pelo consumo mínimo e máximo */
  function custos(cfg, kmM) {
    var out = {};
    [['alcool', cfg.precoAlcool, cfg.consAlcMin, cfg.consAlcMax], ['gasolina', cfg.precoGasolina, cfg.consMin, cfg.consMax]].forEach(function (p) {
      var a = p[2], b = p[3];
      if (!(p[1] > 0) || !(a > 0) || !(b > 0)) return;
      var med = (a + b) / 2, kmMed = p[1] / med;
      out[p[0]] = { porKm: Math.round(kmMed * 1000) / 1000, porKmMax: Math.round(p[1] / Math.min(a, b) * 1000) / 1000, porKmMin: Math.round(p[1] / Math.max(a, b) * 1000) / 1000,
        por100: n2(kmMed * 100), mes: kmM ? n2(kmMed * kmM) : null, consMed: Math.round(med * 1000) / 1000 };
    });
    return out;
  }
  /* autonomia com tanque cheio (faixa pelo consumo) e custo para encher; null se faltar a capacidade */
  function tanque(cfg, comb) {
    var c1 = comb === 'gasolina' ? cfg.consMin : cfg.consAlcMin, c2 = comb === 'gasolina' ? cfg.consMax : cfg.consAlcMax;
    if (!(cfg.tanque > 0) || !(c1 > 0) || !(c2 > 0)) return null;
    var a = Math.min(c1, c2), b = Math.max(c1, c2);
    return { kmMin: Math.round(cfg.tanque * a), kmMax: Math.round(cfg.tanque * b), encherAlcool: cfg.precoAlcool > 0 ? n2(cfg.tanque * cfg.precoAlcool) : null, encherGasolina: cfg.precoGasolina > 0 ? n2(cfg.tanque * cfg.precoGasolina) : null };
  }
  /* séries dos abastecimentos com km: km/l = km rodados desde o anterior / litros deste; custo por km = valor / km rodados */
  function series(itens) {
    var l = (itens || []).filter(function (x) { return x.tipo === 'abastecimento' && x.km > 0 && x.data; }).sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : a.km - b.km; });
    var cons = [], ck = [];
    for (var i = 1; i < l.length; i++) {
      var d = l[i].km - l[i - 1].km; if (d <= 0) continue;
      if (l[i].litros > 0) cons.push({ data: l[i].data, v: Math.round(d / l[i].litros * 100) / 100 });
      if (l[i].valor > 0) ck.push({ data: l[i].data, v: Math.round(l[i].valor / d * 1000) / 1000 });
    }
    return { consumo: cons, custoKm: ck };
  }
  /* gastos por mês e categoria, últimos n meses com lançamento: [{mes, cats:{tipo:valor}, total}] */
  function porMesCat(itens, n) {
    var m = {};
    (itens || []).forEach(function (x) {
      if (GASTOS.indexOf(x.tipo) < 0 || !(x.valor > 0) || !x.data) return;
      var k = x.data.slice(0, 7); m[k] = m[k] || { mes: k, cats: {}, total: 0 };
      m[k].cats[x.tipo] = n2((m[k].cats[x.tipo] || 0) + x.valor); m[k].total = n2(m[k].total + x.valor);
    });
    return Object.keys(m).sort().slice(-(n || 6)).map(function (k) { return m[k]; });
  }
  /* previsão do próximo abastecimento: último abastecimento + autonomia (tanque x consumo médio) / km por dia */
  function proximoAbast(itens, cfg, kmM) {
    var u = ultimo(itens, 'abastecimento'); if (!u || !(kmM > 0)) return null;
    var t = tanque(cfg, u.comb === 'gasolina' ? 'gasolina' : 'alcool'); if (!t) return null;
    var aut = (t.kmMin + t.kmMax) / 2, dias = Math.max(0, Math.round(aut / (kmM / 30.4)));
    var d = new Date(utc(u.data) + dias * 86400000);
    return { data: d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()), dias: dias, kmPrevisto: u.km > 0 ? Math.round(u.km + aut) : null, autonomia: Math.round(aut) };
  }
  /* troca de óleo: prazo "Próxima troca até" (data) e km da próxima (última + intervalo, só informação). O aviso urgente some quando
     há troca lançada perto do prazo (até 60 dias antes) ou depois dele. */
  function oleo(itens, cfg, hoje) {
    var u = ultimo(itens, 'oleo'), iv = cfg.oleoIntervalo > 0 ? cfg.oleoIntervalo : 10000, ate = cfg.oleoAte || '';
    var feita = !!(u && ate && dif(ate, u.data) <= 60);
    var r = { ultima: u, intervalo: iv, ate: feita ? (u.proxData || '') : ate, proxKm: u ? (u.proxKm > 0 ? u.proxKm : (u.km > 0 ? u.km + iv : null)) : null };
    if (r.ate) r.dias = dif(r.ate, hoje);
    var km = cfg.kmAtual > 0 ? cfg.kmAtual : null;
    if (km && r.proxKm) { r.restantes = Math.round(r.proxKm - km); if (u.km > 0) r.progresso = Math.max(0, Math.min(1, (km - u.km) / (r.proxKm - u.km))); }
    r.faltaKmAtual = !km;
    r.urgente = !feita && !!ate && r.dias != null && r.dias <= 30;
    r.avisar = r.urgente || (r.dias != null && r.dias <= 30) || (r.restantes != null && r.restantes <= 1000);
    return r;
  }
  return { oleo: oleo, proximoAbast: proximoAbast, series: series, porMesCat: porMesCat, tanque: tanque, PADRAO_CFG: PADRAO_CFG, config: config, kmMes: kmMes, custos: custos, TIPOS: TIPOS, GASTOS: GASTOS, ANUAIS: ANUAIS, COMBS: COMBS, precoLitro: precoLitro, proximoVenc: proximoVenc, vencimentos: vencimentos, avisos: avisos, resumo: resumo, ultimo: ultimo, dif: dif };
});
