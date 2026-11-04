/* node tools/teste-cartoes-calc.js — contas do painel de cartões (dados inventados) */
var C = require('../js/cartoes-calc.js'), ok = 0, f = 0;
function check(c, m) { if (c) { ok++; console.log('  ok   ' + m); } else { f++; console.log('  FALHA ' + m); } }
var s = { cartoes: [{ id: 'c1', apelido: 'Roxinho' }], faturas: [
  { id: 'f1', cartao: 'c1', mes: '2026-09', vencimento: '2026-09-10' }, { id: 'f2', cartao: 'c1', mes: '2026-10', vencimento: '2026-10-10' }, { id: 'f3', cartao: 'c1', mes: '2026-11', vencimento: '2026-11-10' },
  { id: 'ft', cartao: 'c1', mes: '2026-11', vencimento: '2026-11-10', teste: true }], lancs: [
  { fatura: 'f1', data: '2026-09-03', desc: 'Netflix.com', valor: 55.9, cat: 'assinaturas', pa: 0, pt: 0 }, { fatura: 'f1', data: '2026-09-05', desc: 'Mercado A', valor: 300, cat: 'mercado', pa: 0, pt: 0 }, { fatura: 'f1', data: '2026-09-07', desc: 'Loja Y', valor: 100, cat: 'compras', pa: 1, pt: 4 },
  { fatura: 'f2', data: '2026-10-03', desc: 'Netflix.com', valor: 55.9, cat: 'assinaturas', pa: 0, pt: 0 }, { fatura: 'f2', data: '2026-10-05', desc: 'Mercado A', valor: 400, cat: 'mercado', pa: 0, pt: 0 }, { fatura: 'f2', data: '2026-10-07', desc: 'Loja Y', valor: 100, cat: 'compras', pa: 2, pt: 4 }, { fatura: 'f2', data: '2026-10-09', desc: 'Estorno', valor: -50, cat: 'compras', pa: 0, pt: 0 },
  { fatura: 'f3', data: '2026-11-03', desc: 'Netflix.com', valor: 55.9, cat: 'assinaturas', pa: 0, pt: 0 }, { fatura: 'f3', data: '2026-11-05', desc: 'Mercado A', valor: 500, cat: 'mercado', pa: 0, pt: 0 }, { fatura: 'f3', data: '2026-11-07', desc: 'Loja Y', valor: 100, cat: 'compras', pa: 3, pt: 4 },
  { fatura: 'ft', data: '2026-11-07', desc: 'Teste', valor: 9999, cat: 'outros', pa: 0, pt: 0 }] };
check(C.faturaTotal(s, s.faturas[1]) === 505.9, 'total da fatura = soma com estorno (505,90)');
var cat = C.porCategoria(C.lancsDe(s, 'f3')); check(cat[0].cat === 'mercado' && cat[0].total === 500 && cat[0].pct === 76.2, 'categorias ordenadas, % (mercado 76,2%)');
check(C.top(C.lancsDe(s, 'f3'), 2)[0].desc === 'Mercado A', 'top compras');
var a = C.assinaturas(s); check(a.lista.length === 1 && a.lista[0].nome === 'Netflix.com' && a.lista[0].meses === 3 && a.totalMensal === 55.9, 'assinatura recorrente detectada (Netflix, 3 meses)');
var p = C.parcelas(s, '2026-11-15'); check(p.lista.length === 1 && p.lista[0].restantes === 1 && p.totalComprometido === 100 && p.proximosMeses[0].mes === '2026-12', 'parcelas: 1 restante, R$ 100 comprometidos em 2026-12');
var e = C.evolucao(s); check(e.length === 3 && e[1].total === 505.9 && e[2].total === 655.9 && e[2].vs.dir === 'subiu' && e[2].vs.dv === 150, 'evolução ignora fatura de teste e compara com o mês anterior (+R$ 150,00)');
check(e[2].vs.pct === 29.7, 'variação % = 29,7');
var csv = C.csv(s, [{ fatura: 'f1', data: '2026-09-03', desc: '=HYPERLINK("x")', valor: 55.9, cat: 'x', pa: 1, pt: 3 }]);
check(csv.charAt(0) === '\ufeff' && csv.indexOf("\"'=HYPERLINK") > 0 && csv.indexOf('55,9') > 0 && csv.indexOf('1/3') > 0, 'CSV: BOM, vírgula decimal, parcela, proteção contra fórmula');
check(C.filtrar(s.lancs, { q: 'mercado' }).length === 3 && C.filtrar(s.lancs, { cat: 'compras' }).length === 4, 'busca e filtro por categoria');
console.log('\n' + ok + ' ok, ' + f + ' falhas'); process.exit(f ? 1 : 0);
