/* Testes de Compras feitas (núcleo puro). node tools/teste-notas.js  byGui */
var N = require('../js/notas-nucleo.js');
var ok = 0, falhas = 0;
function t(nome, cond) { if (cond) ok++; else { falhas++; console.log('  FALHA ' + nome); } }
var HJ = '2026-10-30';
t('valor BR', N.valor('R$ 1.234,56') === 1234.56 && N.valor('4,99') === 4.99 && N.valor('') === null && N.valor('abc') === null && N.valor(3) === 3);
t('qtd', N.qtd('2') === 2 && N.qtd('0,5') === 0.5 && N.qtd('') === null);
t('data DD/MM usa o ano de hoje', N.data('28/10', HJ) === '2026-10-28');
t('data DD/MM no futuro volta um ano', N.data('15/12', HJ) === '2025-12-15');
t('data completa', N.data('05/01/2026', HJ) === '2026-01-05' && N.data('', HJ) === '' && N.data('31/02', HJ) === '');
var bruto = { loja: 'Atacadão', data: '28/10', itens: [{ nome: 'Arroz 5kg', qtd: '2', unit: 'R$ 22,90', total: 'R$ 45,80' }, { nome: 'Leite', qtd: '1', unit: '4,99', total: '4,99' }, { nome: '', total: '' }], desconto: 'R$ 1,00', total: 'R$ 49,79' };
var n = N.normalizar(bruto, HJ);
t('normalizar', n.loja === 'Atacadão' && n.data === '2026-10-28' && n.itens.length === 2 && n.itens[0].qtd === 2 && n.itens[0].unit === 22.9 && n.itens[0].total === 45.8 && n.desconto === 1 && n.total === 49.79);
var c = N.conferir(n);
t('confere: bate', c.bate === true && c.soma === 49.79 && c.aviso === '');
n.total = 60; c = N.conferir(n);
t('não bate: aviso com os dois valores', c.bate === false && /49,79/.test(c.aviso) && /60,00/.test(c.aviso));
var semTotal = N.normalizar({ loja: 'X', itens: [{ nome: 'A', qtd: '2', unit: '3,00', total: '' }], total: '6,00' }, HJ);
t('não inventa total de item', semTotal.itens[0].total === null);
c = N.conferir(semTotal);
t('item sem total gera aviso, sem calcular', c.bate === false && /sem total/.test(c.aviso));
t('sem total da nota: aviso', /total da nota/.test(N.conferir(N.normalizar({ loja: 'X', itens: [{ nome: 'A', total: '2,00' }] }, HJ)).aviso));
var L = [{ id: 'a', loja: 'Atacadão', data: '2026-10-28', total: 49.79, itens: [] }, { id: 'b', loja: 'Padaria', data: '2026-10-02', total: 10, itens: [] },
  { id: 'c', loja: 'atacadão ', data: '2026-10-15', total: 100.21, itens: [] }, { id: 'd', loja: 'Feira', data: '2026-09-30', total: 30, itens: [] }, { id: 'e', loja: 'Sem total', data: '2026-10-20', total: null, itens: [{ total: 5 }] }];
var m = N.resumoMes(L, '2026-10');
t('mês: total e quantidade', m.n === 4 && m.total === 165 && m.compras[0].id === 'a');
t('mês: total por loja (junta maiúsculas e espaços), maior primeiro', m.porLoja.length === 3 && m.porLoja[0].loja === 'Atacadão' && m.porLoja[0].total === 150 && m.porLoja[0].n === 2);
t('compra sem total usa a soma dos itens', m.porLoja.some(function (x) { return x.loja === 'Sem total' && x.total === 5; }));
t('meses com compras, mais recente primeiro', JSON.stringify(N.meses(L)) === '["2026-10","2026-09"]');
t('brl', N.brl(1234.5) === 'R$ 1.234,50');
var J = N.juntar([{ loja: 'MERCADO X', data: '30/10/2026', itens: [{ nome: 'Arroz', total: '25,90' }, { nome: 'Feijão', total: '8,49' }, { nome: 'Feijão', total: '8,49' }], total: 'R$ 0,00' },
  { loja: '', itens: [{ nome: 'FEIJAO', total: '8,49' }, { nome: 'Leite', total: '4,79' }], total: '' }, { itens: [{ nome: 'Café', total: '19,90' }], total: '67,57', desconto: '' }], '2026-10-30');
t('juntar: loja e data da 1ª parte', J.loja === 'MERCADO X' && J.data === '2026-10-30');
t('juntar: emenda tira 1 repetido, mantém item igual dentro da mesma foto', J.itens.length === 5 && J.repetidos === 1);
t('juntar: total da parte que tem, R$ 0,00 não conta como total', J.total === 67.57);
t('normalizar: R$ 0,00 vira falta de total', N.normalizar({ itens: [{ nome: 'a', total: '5' }], total: 'R$ 0,00' }).total === null);
t('totalDe: total 0 com itens usa a soma', N.totalDe({ total: 0, itens: [{ total: 10 }, { total: 5 }] }) === 15);
t('semValor: tudo vazio', N.semValor({ total: 0, itens: [{ total: null }] }) && !N.semValor({ total: 3, itens: [] }));
console.log(ok + ' ok, ' + falhas + ' falhas'); process.exit(falhas ? 1 : 0);
