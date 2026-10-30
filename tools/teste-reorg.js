/* Testes da reorganização (Lista de Compra, Contas a Pagar; sem lembretes e sem rotina):  node tools/teste-reorg.js */
'use strict';
var assert = require('assert');
global.window = global; global.PS = {};
var mem = {}; global.localStorage = { getItem: function (k) { return k in mem ? mem[k] : null; }, setItem: function (k, v) { mem[k] = String(v); }, removeItem: function (k) { delete mem[k]; } };
require('../js/util.js'); require('../js/icons.js'); require('../js/repeticao.js'); require('../js/store.js'); require('../js/dominio.js'); require('../js/financeiro.js');
var N = require('../js/sync-nucleo.js');
var S = global.PS.store, D = global.PS.dom, F = global.PS.fin;
var ok = 0, falhas = 0;
var fila = Promise.resolve();
function t(nome, fn) { fila = fila.then(function () { return Promise.resolve().then(fn).then(function () { ok++; console.log('  ok   ' + nome); }, function (e) { falhas++; console.log('  FALHA ' + nome + ' → ' + e.message); }); }); }
function secao(x) { fila = fila.then(function () { console.log(x); }); }
var HOJE = '2026-10-10';
var ANTIGO = { app: 'minha-casa-em-ordem', versao: 4, config: { cidade: 'Osasco, SP' }, listas: ['Casa'],
  habitos: [{ id: 'h1', nome: 'Alongar', icone: 'check' }], checks: { '2026-10-09': ['h1'] },
  lembretes: [{ id: 'lembrete-bilu-casinha', titulo: 'Bilu', dia: 0, prio: 'alta' }, { id: 'l2', titulo: 'Escola', dia: 10 }],
  tarefas: [{ id: 't1', lista: 'Casa', titulo: 'Varrer', vence: HOJE, prio: 'media' }],
  contas: [{ id: 'c1', titulo: 'Luz', mensal: true, dia: 12, valor: 100 }], compras: [{ id: 'k1', nome: 'Arroz' }] };

secao('Backup antigo e esquema');
t('backup antigo (com lembretes, hábitos e checks) importa sem erro e descarta essas partes', function () {
  var s = S.sanear(JSON.parse(JSON.stringify(ANTIGO)));
  assert.strictEqual(s.tarefas.length, 1); assert.strictEqual(s.contas.length, 1); assert.strictEqual(s.compras.length, 1);
  assert(!('lembretes' in s), 'lembretes ficou'); assert(!('habitos' in s), 'habitos ficou'); assert(!('checks' in s), 'checks ficou');
});
t('estado vazio não tem lembretes, hábitos nem checks', function () {
  var s = S.sanear({}); assert(!('lembretes' in s) && !('habitos' in s) && !('checks' in s));
});
t('store não expõe mais funções de hábitos', function () {
  assert.strictEqual(S.habitoFeito, undefined); assert.strictEqual(S.alternarHabito, undefined); assert.strictEqual(S.sequencia, undefined);
});
t('não existe mais a migração que cria o lembrete do Bilu', function () {
  mem = {}; mem['painelsala.dados'] = JSON.stringify({ versao: 4, config: {}, tarefas: [], contas: [] });
  return S.iniciar().then(function (s) { assert(!s.lembretes, 'lembretes recriado'); assert(!/bilu/i.test(JSON.stringify(s)), 'Bilu voltou'); });
});

secao('Sincronização');
t('coleções enviadas não incluem lembretes, hábitos nem checks', function () {
  assert(N.COLECOES.indexOf('lembretes') < 0 && N.COLECOES.indexOf('habitos') < 0);
  var l = N.itensLocais(JSON.parse(JSON.stringify(ANTIGO)));
  assert(!Object.keys(l).some(function (k) { return /^(lembretes|habitos|checks)\|/.test(k); }), 'enviaria coleção removida');
  assert(l['tarefas|t1'] && l['compras|k1'] && l['contas|c1']);
});
t('itens recebidos de aparelho antigo (lembretes, hábitos, checks) são aceitos e ignorados', function () {
  S.substituir(S.sanear({}));
  assert.strictEqual(S.sanearItem('lembretes', 'l2', { id: 'l2', titulo: 'x', dia: 10 }), null);
  assert.strictEqual(S.sanearItem('habitos', 'h1', { id: 'h1', nome: 'x' }), null);
  assert.strictEqual(S.sanearItem('checks', '2026-10-09|h1', 1), null);
  var st = S.sanear({});
  assert.strictEqual(N.colocar(st, 'lembretes', 'l2', { id: 'l2' }), null); assert.strictEqual(N.colocar(st, 'checks', '2026-10-09|h1', 1), null);
  N.tirar(st, 'lembretes', 'l2'); N.tirar(st, 'checks', '2026-10-09|h1');
  assert(!('lembretes' in st) && !('checks' in st));
});

secao('Domínio: Hoje e vencimentos sem lembretes');
t('itensDoDia só traz tarefas, mesmo com lembretes antigos no objeto', function () {
  var s = JSON.parse(JSON.stringify(ANTIGO)); var it = D.itensDoDia(s, HOJE);
  assert.strictEqual(it.length, 1); assert.strictEqual(it[0].tipo, 'tarefa');
  assert.strictEqual(D.ocorrenciasLembrete, undefined); assert.strictEqual(D.pendencias, undefined);
});
t('aVencer só traz contas', function () {
  var s = JSON.parse(JSON.stringify(ANTIGO)); s.contas[0] = S.sanear({ contas: s.contas }).contas[0];
  var v = D.aVencer(s, HOJE, 7); assert(v.length >= 1); assert(v.every(function (x) { return x.tipo === 'conta'; }));
});
t('pendências financeiras não trazem lembretes e apontam para #/contas', function () {
  var s = S.sanear(JSON.parse(JSON.stringify(ANTIGO))); s.lembretes = ANTIGO.lembretes;
  var p = F.pendencias(s, HOJE, 7); assert(p.length >= 1);
  assert(p.every(function (x) { return x.tipo !== 'lembrete'; }), 'lembrete nas pendências');
  assert(p.filter(function (x) { return x.tipo === 'conta'; }).every(function (x) { return x.href === '#/contas'; }), 'href antigo');
});
t('notificações de vencimento de contas continuam (lembretesPara)', function () {
  var s = S.sanear({ contas: [{ id: 'c1', titulo: 'Luz', mensal: true, dia: 13, valor: 100 }] });
  var l = F.lembretesPara(s, HOJE, [3, 1, 0], {}, 9); assert.strictEqual(l.length, 1); assert.strictEqual(l[0].titulo.indexOf('Luz') >= 0, true);
});

secao('Repetir (dados antigos e novos)');
t('dados antigos sem repetir continuam iguais', function () {
  var s = S.sanear(JSON.parse(JSON.stringify(ANTIGO)));
  assert.strictEqual(s.tarefas[0].repete, ''); assert.strictEqual(s.tarefas[0].ate, ''); assert.strictEqual(s.tarefas[0].vence, HOJE);
});
t('repetir e Até sobrevivem ao sanear; valor inválido vira Não repete; .ics nunca repete', function () {
  var s = S.sanear({ app: 'minha-casa-em-ordem', listas: ['Casa'], tarefas: [{ id: 'a', titulo: 'Regar', vence: HOJE, repete: 'semanal', ate: '2026-12-31', gerou: 'b' }, { id: 'c', titulo: 'X', repete: 'toda hora' }],
    compromissos: [{ id: 'v', titulo: 'Aniversario victor', data: '2026-03-15', repete: 'anual' }, { id: 'i', titulo: 'Ics', data: HOJE, fonte: 'ics', repete: 'diaria' }] });
  assert.strictEqual(s.tarefas[0].repete, 'semanal'); assert.strictEqual(s.tarefas[0].ate, '2026-12-31'); assert.strictEqual(s.tarefas[0].gerou, 'b'); assert.strictEqual(s.tarefas[1].repete, '');
  assert.strictEqual(s.compromissos[0].repete, 'anual'); assert.strictEqual(s.compromissos[1].repete, '');
});
fila.then(function () { console.log('\n' + ok + ' ok, ' + falhas + ' falhas'); process.exit(falhas ? 1 : 0); });
