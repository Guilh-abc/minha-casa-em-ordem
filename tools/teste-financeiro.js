/* Testes do domínio financeiro (pendências, pago/aberto, histórico, lembretes com relógio falso, .ics):  node tools/teste-financeiro.js */
'use strict';
var assert = require('assert');
global.window = global; global.PS = {};
require('../js/util.js'); require('../js/financeiro.js');
var F = global.PS.fin, U = global.PS.u;
var ok = 0, falhas = 0;
function t(nome, fn) { try { fn(); ok++; console.log('  ok   ' + nome); } catch (e) { falhas++; console.log('  FALHA ' + nome + ' → ' + e.message); } }
function conta(o) { return Object.assign({ id: 'c1', titulo: 'Luz', mensal: true, dia: 10, data: '', valor: 100, paga: false, pagaEm: '', pagas: {}, valores: {}, desde: '', cat: 'casa', dono: '' }, o); }
function est(o) { return Object.assign({ contas: [], faturas: [], cartoes: [], lancs: [] }, o); }
var HOJE = '2026-10-10';

t('pendências ordenam por urgência: vencida, hoje, amanhã, depois', function () {
  var s = est({ contas: [conta({ id: 'a', titulo: 'Água', dia: 7 }), conta({ id: 'b', titulo: 'Luz', dia: 10 }), conta({ id: 'c', titulo: 'Gás', dia: 11 }), conta({ id: 'd', titulo: 'Net', dia: 15 }), conta({ id: 'e', titulo: 'Longe', dia: 25 })] });
  var p = F.pendencias(s, HOJE, 7);
  assert.deepStrictEqual(p.map(function (x) { return x.titulo; }), ['Água', 'Luz', 'Gás', 'Net']);
  assert.deepStrictEqual(p.map(function (x) { return x.nivel; }), ['vencida', 'hoje', 'amanha', 'semana']);
  assert.strictEqual(p[0].dias, -3);
});
t('conta paga some das pendências; desfazer traz de volta', function () {
  var s = est({ contas: [conta({ dia: 10 })] });
  assert.strictEqual(F.pendencias(s, HOJE, 7).length, 1);
  assert.ok(F.marcarPaga(s, 'conta', 'c1', '2026-10', '2026-10-09'));
  assert.strictEqual(F.pendencias(s, HOJE, 7).length, 0);
  assert.strictEqual(s.contas[0].pagas['2026-10'], '2026-10-09');
  assert.strictEqual(s.contas[0].valores['2026-10'], 100);
  F.desfazerPaga(s, 'conta', 'c1', '2026-10');
  assert.strictEqual(F.pendencias(s, HOJE, 7).length, 1);
});
t('conta mensal gera o mês seguinte como aberto depois de paga', function () {
  var s = est({ contas: [conta({ dia: 3 })] });
  F.marcarPaga(s, 'conta', 'c1', '2026-10', HOJE);
  var p = F.pendencias(s, '2026-10-30', 7);
  assert.strictEqual(p.length, 1); assert.strictEqual(p[0].data, '2026-11-03'); assert.strictEqual(p[0].chave, '2026-11');
  var l = F.listas(s, '2026-10-30');
  assert.ok(l.abertas.some(function (x) { return x.chave === '2026-11'; })); assert.ok(l.pagas.some(function (x) { return x.chave === '2026-10' && x.pagaEm === HOJE; }));
});
t('conta antiga (sem desde) não vira vencida de meses passados; conta nova com desde sim', function () {
  var s = est({ contas: [conta({ id: 'x', dia: 5, desde: '' }), conta({ id: 'y', titulo: 'Nova', dia: 5, desde: '2026-09' })] });
  var p = F.pendencias(s, HOJE, 7).filter(function (x) { return x.dias < 0; });
  assert.deepStrictEqual(p.map(function (x) { return x.id + x.chave; }).sort(), ['x2026-10', 'y2026-09', 'y2026-10']);
});
t('fatura: vencida em vermelho (nivel), paga some, teste nunca entra', function () {
  var s = est({ cartoes: [{ id: 'k', apelido: 'Nubank' }], faturas: [{ id: 'f1', cartao: 'k', mes: '2026-10', valor: 1234.56, vencimento: '2026-10-08', status: 'fechada' }, { id: 'f2', cartao: 'k', mes: '2026-10', valor: 5, vencimento: '2026-10-09', status: 'aberta', teste: true }] });
  var p = F.pendencias(s, HOJE, 7); assert.strictEqual(p.length, 1); assert.strictEqual(p[0].nivel, 'vencida'); assert.strictEqual(p[0].titulo, 'Fatura Nubank');
  F.marcarPaga(s, 'fatura', 'f1', '', HOJE); assert.strictEqual(F.pendencias(s, HOJE, 7).length, 0); assert.strictEqual(s.faturas[0].pagaEm, HOJE);
  F.desfazerPaga(s, 'fatura', 'f1'); assert.strictEqual(s.faturas[0].status, 'aberta');
});
t('nunca marca como paga sozinha (listar/ler não muta)', function () {
  var s = est({ contas: [conta({ dia: 1 })] }); var antes = JSON.stringify(s); F.pendencias(s, HOJE, 7); F.listas(s, HOJE); F.historico(s, HOJE, 6); F.lembretesPara(s, HOJE, [3, 1, 0], {}); assert.strictEqual(JSON.stringify(s), antes);
});
t('lembretes antigos no estado não entram nas pendências (saíram do app)', function () {
  var s = est({ lembretes: [{ id: 'l1', titulo: 'Ligar para o dentista', dia: 10, feitos: {} }] });
  assert.strictEqual(F.pendencias(s, HOJE, 7).length, 0);
});
t('resumo conta níveis', function () {
  var s = est({ contas: [conta({ id: 'a', dia: 7 }), conta({ id: 'b', dia: 10 }), conta({ id: 'c', dia: 11 })] });
  var r = F.resumo(F.pendencias(s, HOJE, 7)); assert.strictEqual(r.vencidas, 1); assert.strictEqual(r.hoje, 1); assert.strictEqual(r.amanha, 1); assert.strictEqual(r.urgentes, 2); assert.strictEqual(r.valor, 300);
});
t('histórico: total por mês, Δ R$ e %, direção e categorias', function () {
  var s = est({ contas: [conta({ id: 'a', valor: 100, pagas: { '2026-08': '2026-08-10', '2026-09': '2026-09-10' }, valores: { '2026-08': 100, '2026-09': 120 }, cat: 'casa' })],
    faturas: [{ id: 'f1', cartao: 'k', mes: '2026-09', valor: 500, vencimento: '2026-09-20', status: 'paga' }, { id: 'f2', cartao: 'k', mes: '2026-10', valor: 400, vencimento: '2026-10-20', status: 'aberta' }],
    lancs: [{ fatura: 'f1', valor: 300, cat: 'mercado' }, { fatura: 'f1', valor: 200, cat: 'lazer' }, { fatura: 'f2', valor: 400, cat: 'mercado' }] });
  var h = F.historico(s, HOJE, 3), m = h.meses;
  assert.deepStrictEqual(m.map(function (x) { return x.mes; }), ['2026-08', '2026-09', '2026-10']);
  assert.strictEqual(m[0].total, 100); assert.strictEqual(m[1].total, 620); assert.strictEqual(m[2].total, 500);
  assert.strictEqual(m[1].vs.dir, 'subiu'); assert.strictEqual(m[1].vs.dv, 520); assert.strictEqual(m[1].vs.pct, 520);
  assert.strictEqual(m[2].vs.dir, 'caiu'); assert.strictEqual(m[2].vs.dv, -120); assert.strictEqual(m[2].vs.pct, -19.4);
  var lazer = h.porCategoria.filter(function (c) { return c.cat === 'lazer'; })[0]; assert.strictEqual(lazer.dir, 'caiu'); assert.strictEqual(lazer.dv, -200);
  assert.strictEqual(m[0].vs, null);
});
t('comparar: sem base anterior → pct nulo; igual', function () {
  assert.strictEqual(F.comparar(10, 0).pct, null); assert.strictEqual(F.comparar(10, 10).dir, 'igual');
});
t('totais do mês: a pagar / pago', function () {
  var s = est({ contas: [conta({ id: 'a', valor: 100 }), conta({ id: 'b', valor: 50, pagas: { '2026-10': HOJE } })] });
  var r = F.totaisDoMes(s, HOJE); assert.strictEqual(r.aPagar, 100); assert.strictEqual(r.pago, 50);
});
t('lembretes (relógio falso): 3, 1 e 0 dias; sem repetir; vencida 1x por dia; nada de madrugada', function () {
  var s = est({ contas: [conta({ dia: 13 })] });
  var enviados = {}, hoje = '2026-10-10';
  var l1 = F.lembretesPara(s, hoje, [3, 1, 0], enviados, 9); assert.strictEqual(l1.length, 1); assert.ok(/d3$/.test(l1[0].chave)); assert.ok(/em 3 dias/.test(l1[0].corpo));
  l1.forEach(function (x) { enviados[x.chave] = hoje; });
  assert.strictEqual(F.lembretesPara(s, hoje, [3, 1, 0], enviados, 15).length, 0);                           // já enviado
  assert.strictEqual(F.lembretesPara(s, '2026-10-11', [3, 1, 0], enviados, 9).length, 0);                    // 2 dias: não está na lista
  assert.strictEqual(F.lembretesPara(s, '2026-10-12', [3, 1, 0], enviados, 9).length, 1);                    // 1 dia
  assert.strictEqual(F.lembretesPara(s, '2026-10-13', [3, 1, 0], enviados, 9)[0].corpo.indexOf('hoje') >= 0, true); // dia
  var atras = F.lembretesPara(s, '2026-10-14', [3, 1, 0], {}, 9); assert.strictEqual(atras.length, 1); assert.ok(/Atrasada/.test(atras[0].titulo));
  assert.strictEqual(F.lembretesPara(s, '2026-10-12', [3, 1, 0], {}, 5).length, 0);                          // 05h
  assert.strictEqual(F.lembretesPara(s, '2026-10-12', [7], {}, 9).length, 0);                                // só 7 dias
  var paga = est({ contas: [conta({ dia: 13, pagas: { '2026-10': '2026-10-09' } })] }); assert.strictEqual(F.lembretesPara(paga, '2026-10-12', [3, 1, 0], {}, 9).length, 0);
});
t('podar enviados antigos', function () { var r = F.podarEnviados({ a: '2026-01-01', b: '2026-10-09' }, HOJE); assert.deepStrictEqual(Object.keys(r), ['b']); });
t('.ics válido: CRLF, BEGIN/END pareados, VALARM por antecedência, escape e dobra', function () {
  var s = est({ contas: [conta({ titulo: 'Condomínio, bloco; A\\B ' + new Array(90).join('x'), dia: 15, valor: 800 })], faturas: [{ id: 'f1', cartao: 'k', mes: '2026-10', valor: 1500, vencimento: '2026-10-20', status: 'aberta' }], cartoes: [{ id: 'k', apelido: 'Nubank' }] });
  var ics = F.icsDasPendencias(s, HOJE, [3, 1, 0], '2026-10-10T12:00:00.000Z');
  assert.ok(/^BEGIN:VCALENDAR\r\n/.test(ics) && /END:VCALENDAR\r\n$/.test(ics));
  assert.ok(ics.indexOf('\n') === ics.indexOf('\r\n') + 1);
  ['VEVENT', 'VALARM', 'VCALENDAR'].forEach(function (k) { assert.strictEqual((ics.match(new RegExp('BEGIN:' + k, 'g')) || []).length, (ics.match(new RegExp('END:' + k, 'g')) || []).length, k); });
  assert.strictEqual((ics.match(/BEGIN:VEVENT/g) || []).length, 3); assert.strictEqual((ics.match(/BEGIN:VALARM/g) || []).length, 9);
  ics.split('\r\n').forEach(function (l) { assert.ok(Buffer.byteLength(l) <= 75, 'linha longa: ' + l.length); });
  assert.ok(ics.indexOf('DTSTART;VALUE=DATE:20261015') >= 0 && ics.indexOf('DTEND;VALUE=DATE:20261016') >= 0);
  assert.ok(ics.indexOf('TRIGGER:-P2DT15H') >= 0 && ics.indexOf('TRIGGER:PT9H') >= 0 && ics.indexOf('TRIGGER:-P0DT15H') >= 0);
  assert.ok(/UID:[A-Za-z0-9_.@-]+@minha-casa-em-ordem/.test(ics)); assert.ok(ics.indexOf('DTSTAMP:20261010T120000Z') >= 0);
  var un = ics.replace(/\r\n /g, ''); assert.ok(un.indexOf('Condomínio\\, bloco\\; A\\\\B') >= 0);
  assert.ok(ics.indexOf('não confirma pagamento') >= 0);
});
t('agenda para o service worker', function () {
  var s = est({ contas: [conta({ dia: 15 })] }); var a = F.agendaParaSW(s, HOJE, [3, 1, 0]);
  assert.deepStrictEqual(a.map(function (x) { return x.avisar; }).sort(), ['2026-10-12', '2026-10-14', '2026-10-15', '2026-11-12', '2026-11-14', '2026-11-15'].sort());
});

/* ---------- contas fixas sugeridas, forma de pagamento, anuais, vínculo com fatura ---------- */
var HJ = '2026-10-24';
function fixas() { var s = est(); F.adicionarFixas(s, HJ); return s; }
function porK(s, k) { return s.contas.filter(function (c) { return c.fixa === k; })[0]; }
t('fixas: cria as 11 (sem valor), idempotente, ids estáveis', function () {
  var s = fixas(); assert.strictEqual(s.contas.length, 11);
  assert.ok(s.contas.every(function (c) { return c.valor === null && c.id === 'fixa-' + c.fixa && !c.paga && !c.exemplo; }));
  var r = F.adicionarFixas(s, HJ); assert.strictEqual(r.adicionadas, 0); assert.strictEqual(s.contas.length, 11);
  s.contas = s.contas.filter(function (c) { return c.fixa !== 'agua'; }); assert.strictEqual(F.fixasFaltando(s).length, 1);
  F.adicionarFixas(s, HJ); assert.strictEqual(s.contas.length, 11);
});
t('fixas: dias, formas e bancos conforme a lista', function () {
  var s = fixas(), esp = { escola: [5, 'boleto'], aluguel: [6, 'pix'], luz: [4, 'debito'], pensao: [6, 'pix'], internet: [12, 'debito'], iptu: [16, 'gerar'], financiamento: [15, 'debito'], ipva: [10, 'outro'], nubank: [21, 'gerar'], agua: [22, 'gerar'], 'itau-black': [28, 'debito'] };
  Object.keys(esp).forEach(function (k) { var c = porK(s, k); assert.strictEqual(c.dia, esp[k][0], k); assert.strictEqual(c.forma, esp[k][1], k); });
  assert.strictEqual(porK(s, 'luz').obs, 'Bradesco'); assert.strictEqual(porK(s, 'financiamento').obs, 'Itaú');
  assert.ok(/acesso veículo do Itaú/.test(porK(s, 'ipva').obs)); assert.ok(F.CONTAS_FIXAS.every(function (d) { return !/\d{5,}/.test(JSON.stringify(d)); }));
});
t('fixas: remove contas de exemplo ao adicionar', function () {
  var s = est({ contas: [conta({ id: 'x', titulo: 'Conta de luz', exemplo: true }), conta({ id: 'y', titulo: 'Minha', exemplo: false })] });
  var r = F.adicionarFixas(s, HJ); assert.strictEqual(r.exemplosRemovidos, 1); assert.ok(s.contas.some(function (c) { return c.id === 'y'; })); assert.ok(!s.contas.some(function (c) { return c.id === 'x'; }));
});
t('hoje 24/10: Água vencida (22), Cartão Itaú Black em 4 dias com destaque; ordenado por vencimento', function () {
  var s = fixas(), p = F.pendencias(s, HJ, 7);
  var ag = p.filter(function (x) { return x.titulo === 'Água'; })[0], ib = p.filter(function (x) { return x.titulo === 'Cartão Itaú Black'; })[0];
  assert.strictEqual(ag.nivel, 'vencida'); assert.strictEqual(ag.dias, -2); assert.strictEqual(ib.dias, 4); assert.strictEqual(ib.nivel, 'semana'); assert.ok(ib.destaque);
  for (var i = 1; i < p.length; i++) assert.ok(p[i - 1].dias <= p[i].dias);
  assert.ok(!p.some(function (x) { return /IPVA/.test(x.titulo); }), 'IPVA anual (julho) não aparece em outubro');
  assert.strictEqual(ag.valor, null);
});
t('conta nova (desde = mês atual) não gera atraso de meses anteriores; mês seguinte aparece em aberto', function () {
  var s = fixas(), l = F.listas(s, HJ), esc = l.abertas.filter(function (x) { return x.titulo === 'Escola'; });
  assert.deepStrictEqual(esc.map(function (x) { return x.data; }), ['2026-10-05', '2026-11-05']);
});
t('anual (IPVA, julho): só perto do vencimento; marcar paga é por ano; recorre no ano seguinte', function () {
  var s = fixas(), c = porK(s, 'ipva');
  assert.strictEqual(F.ocorrenciasConta(c, '2026-10-24').length, 0);
  assert.strictEqual(F.ocorrenciasConta(c, '2027-04-01').length, 1);                          /* ~100 dias antes */
  assert.strictEqual(F.ocorrenciasConta(c, '2027-02-01').length, 0);
  var o = F.ocorrenciasConta(c, '2027-06-20')[0]; assert.strictEqual(o.data, '2027-07-10'); assert.strictEqual(o.chave, '2027-07');
  assert.ok(F.marcarPaga(s, 'conta', c.id, '2027-07', '2027-07-08')); assert.strictEqual(c.pagas['2027-07'], '2027-07-08'); assert.strictEqual(c.paga, false);
  assert.ok(F.ocorrenciasConta(c, '2027-07-20')[0].paga);
  var o28 = F.ocorrenciasConta(c, '2028-06-20').filter(function (x) { return x.chave === '2028-07'; })[0]; assert.strictEqual(o28.paga, false); assert.strictEqual(o28.data, '2028-07-10');
  assert.strictEqual(F.proximoVencimento(c, '2026-10-24'), '2027-07-10');
  F.desfazerPaga(s, 'conta', c.id, '2027-07'); assert.ok(!c.pagas['2027-07']);
  var pend = F.pendencias(s, '2027-07-12', 7); assert.strictEqual(pend.filter(function (x) { return x.id === c.id; })[0].nivel, 'vencida');
});
t('arquivada: some de pendências, listas e .ics', function () {
  var s = fixas(); porK(s, 'agua').arquivada = true;
  assert.ok(!F.pendencias(s, HJ, 60).some(function (x) { return x.titulo === 'Água'; }));
  assert.ok(F.icsDasPendencias(s, HJ, [3, 1, 0], '2026-10-24T12:00:00Z').indexOf('Água') < 0);
});
t('forma: "gerar" avisa 5 dias antes; "débito" pede conferir saldo, sem marcar paga', function () {
  var s = fixas();
  var iptu = F.pendencias(s, '2026-11-11', 7).filter(function (x) { return x.titulo === 'IPTU' && x.data === '2026-11-16'; })[0];            /* 16/11 → 5 dias */
  assert.strictEqual(iptu.dias, 5); assert.strictEqual(iptu.aviso, 'Gerar o boleto');
  var luz = F.pendencias(s, '2026-11-03', 7).filter(function (x) { return x.titulo === 'Luz' && x.data === '2026-11-04'; })[0];             /* 04/11 → amanhã */
  assert.strictEqual(luz.aviso, 'Confira o saldo na conta'); assert.strictEqual(luz.forma, 'debito');
  var depois = F.pendencias(s, '2026-11-05', 7).filter(function (x) { return x.titulo === 'Luz'; })[0];
  assert.strictEqual(depois.nivel, 'vencida'); assert.ok(!porK(s, 'luz').pagas['2026-11']);                    /* débito automático não é pago sozinho */
  var l = F.listas(s, '2026-11-03').abertas.filter(function (x) { return x.titulo === 'Luz'; })[0]; assert.strictEqual(l.forma, 'debito');
});
t('lembretes: extra "gerar o boleto" 5 dias antes mesmo fora das antecedências; saldo 1 dia antes', function () {
  var s = fixas();
  var l5 = F.lembretesPara(s, '2026-11-11', [3, 1, 0], {}, 9).filter(function (x) { return /^Gerar boleto: IPTU/.test(x.titulo); });
  assert.strictEqual(l5.length, 1); assert.ok(/^Gerar boleto: IPTU/.test(l5[0].titulo)); assert.ok(l5[0].corpo.indexOf('Gerar o boleto') >= 0);
  var l5b = F.lembretesPara(s, '2026-11-11', [3, 1, 0], { [l5[0].chave]: true }, 9).filter(function (x) { return /^Gerar boleto: IPTU/.test(x.titulo); }); assert.strictEqual(l5b.length, 0);
  var luz = F.lembretesPara(s, '2026-11-03', [3, 0], {}, 9).filter(function (x) { return x.titulo === 'Luz'; });
  assert.strictEqual(luz.length, 1); assert.ok(luz[0].corpo.indexOf('Confira o saldo na conta') >= 0);
  var pix = F.lembretesPara(s, '2026-11-05', [3, 1, 0], {}, 9).filter(function (x) { return x.titulo === 'Escola' || x.titulo === 'Aluguel'; });
  pix.forEach(function (x) { assert.ok(x.corpo.indexOf('saldo') < 0 && x.corpo.indexOf('boleto') < 0); });
});
t('.ics inclui as contas fixas, a forma, o evento "Gerar boleto" e o alarme de saldo', function () {
  var s = fixas(), ics = F.icsDasPendencias(s, '2026-10-24', [3, 1, 0], '2026-10-24T12:00:00Z'), un = ics.replace(/\r\n /g, '');
  assert.ok(un.indexOf('SUMMARY:Cartão Itaú Black') >= 0); assert.ok(un.indexOf('Forma: Débito automático (Itaú)') >= 0); assert.ok(un.indexOf('confira o saldo') >= 0);
  assert.ok(un.indexOf('SUMMARY:Gerar boleto: IPTU') >= 0 && un.indexOf('DTSTART;VALUE=DATE:20261111') >= 0);
  assert.ok(un.indexOf('SUMMARY:Escola') >= 0); assert.ok(un.indexOf('Forma: Boleto') >= 0);
  assert.ok(un.indexOf('SUMMARY:IPVA') < 0);
});
t('service worker: agenda inclui extras por forma', function () {
  var a = F.agendaParaSW(fixas(), '2026-11-11', [3, 0]);
  assert.ok(a.some(function (x) { return /Gerar boleto: IPTU/.test(x.titulo); })); assert.ok(a.some(function (x) { return x.titulo === 'Luz' && /saldo/.test(x.corpo); }));
});
t('cartão vinculado: com fatura no mês, a conta não duplica e a fatura herda a forma', function () {
  var s = fixas(); s.cartoes = [{ id: 'k1', apelido: 'Itaú Black', final: '0000', dono: 'casal' }];
  var antes = F.pendencias(s, HJ, 7).filter(function (x) { return /Itaú Black/.test(x.titulo); }); assert.strictEqual(antes.length, 1); assert.strictEqual(antes[0].tipo, 'conta');
  s.faturas = [{ id: 'f1', cartao: 'k1', mes: '2026-10', valor: 1234.5, vencimento: '2026-10-28', status: 'aberta', teste: false }];
  var dep = F.pendencias(s, HJ, 7).filter(function (x) { return /Itaú Black/.test(x.titulo); });
  assert.strictEqual(dep.length, 1); assert.strictEqual(dep[0].tipo, 'fatura'); assert.strictEqual(dep[0].valor, 1234.5); assert.strictEqual(dep[0].forma, 'debito'); assert.strictEqual(dep[0].obs, 'Itaú');
  var l = F.listas(s, HJ); assert.strictEqual(l.abertas.filter(function (x) { return /Itaú Black/.test(x.titulo); }).length, 2);   /* fatura de out + conta de nov */
  var h = F.historico(s, HJ, 2); assert.ok(h.meses[1].faturas > 0);
  s.faturas[0].teste = true; assert.strictEqual(F.pendencias(s, HJ, 7).filter(function (x) { return /Itaú Black/.test(x.titulo); })[0].tipo, 'conta');   /* fatura de teste não cobre */
});
t('carga automática única: lista vazia/só exemplos → carrega + aviso; não repete; contas reais → não carrega; nuvem → não carrega', function () {
  var cfg = function () { return { fixasAuto: false, fixasAviso: false }; };
  var s = est({ config: cfg(), contas: [conta({ exemplo: true })] });
  assert.ok(F.fixasAuto(s, HJ, false)); assert.strictEqual(s.contas.length, 11); assert.ok(s.config.fixasAviso && s.config.fixasAuto);
  assert.strictEqual(F.fixasAuto(s, HJ, false), false);
  s.contas = []; assert.strictEqual(F.fixasAuto(s, HJ, false), false); assert.strictEqual(s.contas.length, 0);          /* apagou tudo depois: não recarrega */
  var r = est({ config: cfg(), contas: [conta({ exemplo: false })] }); F.fixasAuto(r, HJ, false); assert.strictEqual(r.contas.length, 1); assert.ok(r.config.fixasAuto && !r.config.fixasAviso);
  var n = est({ config: cfg() }); assert.strictEqual(F.fixasAuto(n, HJ, true), false); assert.strictEqual(n.contas.length, 0); assert.strictEqual(n.config.fixasAuto, false);
});
t('desfazer: remove só as fixas intocadas e apaga o aviso', function () {
  var s = est({ config: { fixasAuto: true, fixasAviso: true } }); F.adicionarFixas(s, HJ);
  porK(s, 'escola').valor = 500; F.marcarPaga(s, 'conta', 'fixa-agua', '2026-10', HJ);
  var n = F.desfazerFixas(s); assert.strictEqual(n, 9); assert.strictEqual(s.contas.length, 2); assert.ok(!s.config.fixasAviso);
});
t('formas válidas e rótulos', function () {
  assert.strictEqual(F.formaOk('pix'), 'pix'); assert.strictEqual(F.formaOk('x'), ''); assert.strictEqual(F.rotuloForma('gerar'), 'Gerar boleto'); assert.strictEqual(F.FORMAS.length, 6);
});
t('detalhe: mensal com histórico de pagamentos (mais recente primeiro) e recorrência', function () {
  var d = F.detalheConta(conta({ pagas: { '2026-08': '2026-08-09', '2026-09': true }, valores: { '2026-09': 130 }, forma: 'pix', obs: 'App do banco' }), HOJE);
  assert.strictEqual(d.recorrencia, 'Todo mês, dia 10');
  assert.deepStrictEqual(d.historico.map(function (x) { return x.mes + '|' + (x.pagaEm || '-') + '|' + x.valor; }), ['2026-09|-|130', '2026-08|2026-08-09|100']);
  assert.strictEqual(d.proximo, '2026-10-10');
});
t('detalhe: avulsa paga e anual', function () {
  var d = F.detalheConta(conta({ mensal: false, data: '2026-10-20', paga: true, pagaEm: '2026-10-05' }), HOJE);
  assert.strictEqual(d.recorrencia, 'Uma vez, vence 20/10/2026');
  assert.deepStrictEqual(d.historico, [{ mes: '', pagaEm: '2026-10-05', valor: 100 }]);
  var a = F.detalheConta(conta({ mensal: false, anual: true, mes: 3, dia: 15 }), HOJE);
  assert.strictEqual(a.recorrencia, 'Todo ano, 15 de março'); assert.deepStrictEqual(a.historico, []);
});
console.log('\n' + ok + ' ok, ' + falhas + ' falhas'); process.exit(falhas ? 1 : 0);
