/* Repetição de compromissos manuais e tarefas: Não repete, Diária, Semanal, Mensal, Anual, com "Até" opcional.
   Os compromissos guardam só a 1ª data; as ocorrências são calculadas na hora (Agenda e Hoje). PURO, testável em Node. byGui */
(function (raiz, fabrica) {
  var api = fabrica(), g = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : raiz);
  if (typeof module === 'object' && module.exports) module.exports = api;
  g.PS = g.PS || {}; g.PS.rep = api;
})(this, function () {
  'use strict';
  var OPCOES = [['', 'Não repete'], ['diaria', 'Diária'], ['semanal', 'Semanal'], ['mensal', 'Mensal'], ['anual', 'Anual']];
  var VALIDOS = { diaria: 1, semanal: 1, mensal: 1, anual: 1 };
  function valido(r) { return VALIDOS[r] ? r : ''; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function utc(iso) { var p = iso.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function iso(ms) { var d = new Date(ms); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function somaDias(d, n) { return iso(utc(d) + n * 864e5); }
  function difDias(a, b) { return Math.round((utc(a) - utc(b)) / 864e5); }
  function ultimoDia(a, m) { return new Date(Date.UTC(a, m, 0)).getUTCDate(); }   /* m de 1 a 12 */
  /* soma meses mantendo o dia âncora (31 vira o último dia em mês curto) */
  function somaMeses(d, n, dia) {
    var a = +d.slice(0, 4), m = +d.slice(5, 7) - 1 + n; a += Math.floor(m / 12); m = ((m % 12) + 12) % 12 + 1;
    return a + '-' + pad(m) + '-' + pad(Math.min(dia, ultimoDia(a, m)));
  }
  /* próxima data depois de d; base (opcional) = data original, para manter o dia do mês */
  function proxima(d, rep, base) {
    rep = valido(rep); if (!rep || !d) return '';
    var dia = +(base || d).slice(8, 10);
    if (rep === 'diaria') return somaDias(d, 1);
    if (rep === 'semanal') return somaDias(d, 7);
    return somaMeses(d, rep === 'mensal' ? 1 : 12, dia);
  }
  /* datas da série de c (c.data, c.repete, c.ate) dentro de [de, ate] */
  function ocorrencias(c, de, ate) {
    var ini = c.data, rep = valido(c.repete), fim = c.ate && c.ate < ate ? c.ate : ate, out = [];
    if (!ini) return out;
    if (!rep) { if (ini >= de && ini <= ate) out.push(ini); return out; }
    var d = ini, guarda = 0;
    if (ini < de && (rep === 'diaria' || rep === 'semanal')) { var p = rep === 'diaria' ? 1 : 7; d = somaDias(ini, Math.ceil(difDias(de, ini) / p) * p); }
    var dia = +ini.slice(8, 10), n = 0, passo = rep === 'mensal' ? 1 : 12;
    if (ini < de && (rep === 'mensal' || rep === 'anual')) { n = Math.max(0, Math.floor(((+de.slice(0, 4) - +ini.slice(0, 4)) * 12 + (+de.slice(5, 7) - +ini.slice(5, 7))) / passo) - 1); d = somaMeses(ini, n * passo, dia); }
    while (d <= fim && guarda++ < 1000) {
      if (d >= de) out.push(d);
      if (rep === 'diaria' || rep === 'semanal') d = somaDias(d, rep === 'diaria' ? 1 : 7);
      else { n++; d = somaMeses(ini, n * passo, dia); }
    }
    return out;
  }
  /* lista com uma cópia por ocorrência (origem = id do original); o original não muda */
  function expandir(lista, de, ate) {
    var out = [];
    (lista || []).forEach(function (c) {
      if (!valido(c.repete)) { if (c.data >= de && c.data <= ate) out.push(c); return; }
      ocorrencias(c, de, ate).forEach(function (d) { var x = {}; for (var k in c) x[k] = c[k]; x.data = d; x.origem = c.id; out.push(x); });
    });
    return out;
  }
  /* marca a tarefa como feita; se repete, cria a próxima (uma vez só) e devolve a nova */
  function concluirTarefa(lista, t, hoje, novoId) {
    t.feita = true;
    var rep = valido(t.repete); if (!rep || t.gerou) return null;
    var base = t.vence || hoje, prox = proxima(base, rep, t.base || base);
    if (!prox || (t.ate && prox > t.ate)) return null;
    var n = { id: novoId(), lista: t.lista, titulo: t.titulo, prio: t.prio, vence: prox, feita: false, dono: t.dono || '', repete: rep, ate: t.ate || '', base: t.base || base };
    t.gerou = n.id; lista.unshift(n);
    return n;
  }
  return { OPCOES: OPCOES, valido: valido, proxima: proxima, ocorrencias: ocorrencias, expandir: expandir, concluirTarefa: concluirTarefa };
});
