/* Testes do quadro de tarefas por prazo (colunas e data ao mover):  node tools/teste-tarefas.js */
'use strict';
var assert = require('assert');
global.window = global; global.PS = {};
require('../js/util.js'); require('../js/dominio.js');
var D = global.PS.dom;
var ok = 0, falhas = 0;
function t(nome, fn) { try { fn(); ok++; console.log('  ok   ' + nome); } catch (e) { falhas++; console.log('  FALHA ' + nome + ' → ' + e.message); } }
var QUI = '2026-10-29';   /* quinta-feira */
function tf(o) { return Object.assign({ id: 'x', lista: 'Casa', titulo: 'T', prio: 'media', vence: '', feita: false }, o); }

t('fim da semana = domingo da semana corrente (segunda a domingo); no domingo, o próprio dia', function () {
  assert.strictEqual(D.fimDaSemana(QUI), '2026-11-01');
  assert.strictEqual(D.fimDaSemana('2026-11-01'), '2026-11-01');
  assert.strictEqual(D.fimDaSemana('2026-11-02'), '2026-11-08');
  assert.strictEqual(D.colunaPrazo(tf({ vence: '2026-11-02' }), '2026-11-01'), 'depois');   /* domingo: Esta semana vazia */
  assert.strictEqual(D.fimDaSemana('2026-10-31'), '2026-11-01');
});
t('coluna pelo prazo: atrasadas, hoje, esta semana, depois, sem data', function () {
  assert.strictEqual(D.colunaPrazo(tf({ vence: '2026-10-28' }), QUI), 'atrasadas');
  assert.strictEqual(D.colunaPrazo(tf({ vence: QUI }), QUI), 'hoje');
  assert.strictEqual(D.colunaPrazo(tf({ vence: '2026-10-30' }), QUI), 'semana');
  assert.strictEqual(D.colunaPrazo(tf({ vence: '2026-11-01' }), QUI), 'semana');
  assert.strictEqual(D.colunaPrazo(tf({ vence: '2026-11-02' }), QUI), 'depois');
  assert.strictEqual(D.colunaPrazo(tf({ vence: '' }), QUI), 'semdata');
});
t('quadro: só pendentes, colunas na ordem, ordenadas por prioridade, filtro por lista', function () {
  var ts = [tf({ id: 'a', vence: '2026-10-01' }), tf({ id: 'b', vence: QUI, prio: 'baixa' }), tf({ id: 'c', vence: QUI, prio: 'alta' }), tf({ id: 'd', feita: true, vence: QUI }), tf({ id: 'e', lista: 'Trabalho' })];
  var q = D.quadroPrazo(ts, QUI);
  assert.deepStrictEqual(q.map(function (c) { return c.id; }), ['atrasadas', 'hoje', 'semana', 'depois', 'semdata']);
  assert.deepStrictEqual(q[1].itens.map(function (x) { return x.id; }), ['c', 'b']);
  assert.strictEqual(q[0].itens.length, 1); assert.strictEqual(q[4].itens.length, 1);
  assert.strictEqual(D.quadroPrazo(ts, QUI, 'Casa')[4].itens.length, 0);
  assert.strictEqual(q[0].rotulo, 'Atrasadas'); assert.strictEqual(q[2].rotulo, 'Esta semana');
});
t('mover para coluna define a data: hoje, domingo, +14 dias, sem data; atrasadas não é destino', function () {
  assert.strictEqual(D.dataDaColuna('hoje', QUI), QUI);
  assert.strictEqual(D.dataDaColuna('semana', QUI), '2026-11-01');
  assert.strictEqual(D.dataDaColuna('depois', QUI), '2026-11-12');
  assert.strictEqual(D.dataDaColuna('semdata', QUI), '');
  assert.strictEqual(D.dataDaColuna('atrasadas', QUI), null);
});
t('mover não altera nada além de vence', function () {
  var x = tf({ vence: '2026-10-01' }), antes = JSON.stringify(Object.assign({}, x, { vence: 'Z' }));
  assert.ok(D.moverTarefa(x, 'hoje', QUI)); assert.strictEqual(x.vence, QUI);
  assert.strictEqual(JSON.stringify(Object.assign({}, x, { vence: 'Z' })), antes);
  assert.strictEqual(D.moverTarefa(x, 'atrasadas', QUI), false); assert.strictEqual(x.vence, QUI);
});
t('lista: concluídas saem das ativas (comuns e ocorrência de recorrente), mais recente primeiro', function () {
  var ts = [tf({ id: 'a', vence: '2026-11-06', feita: true, repete: 'mensal', gerou: 'b' }), tf({ id: 'b', vence: '2026-12-06', repete: 'mensal' }),
    tf({ id: 'c', vence: '2026-11-01', feita: true }), tf({ id: 'd', vence: '' })];
  var sep = D.separarTarefas(ts);
  assert.deepStrictEqual(sep.ativas.map(function (x) { return x.id; }), ['b', 'd']);
  assert.deepStrictEqual(sep.concluidas.map(function (x) { return x.id; }), ['a', 'c']);
  assert.ok(sep.ativas.every(function (x) { return !x.feita; }));
  assert.ok(D.quadroPrazo(ts, QUI).every(function (c) { return c.itens.every(function (x) { return !x.feita; }); }));
});
t('recorrente: concluir gera a próxima e a concluída vai para Concluídas', function () {
  require('../js/repeticao.js');
  var R = global.PS.rep, n = 0, l = [tf({ id: 'r1', vence: '2026-11-06', repete: 'mensal' })];
  R.concluirTarefa(l, l[0], QUI, function () { return 'r' + (++n + 1); });
  var sep = D.separarTarefas(l);
  assert.strictEqual(sep.ativas.length, 1); assert.strictEqual(sep.ativas[0].vence, '2026-12-06');
  assert.deepStrictEqual(sep.concluidas.map(function (x) { return x.id; }), ['r1']);
});
console.log('\n' + ok + ' ok, ' + falhas + ' falhas'); process.exit(falhas ? 1 : 0);
