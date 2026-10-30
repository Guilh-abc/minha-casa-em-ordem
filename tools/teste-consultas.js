/* Ajudante sem inventar: consultas determinísticas + validação da resposta do modelo.  node tools/teste-consultas.js */
'use strict';
var assert = require('assert');
var C = require('../js/assistente-consultas.js');
var ok = 0, falhas = 0;
function t(nome, fn) { try { fn(); ok++; console.log('  ok   ' + nome); } catch (e) { falhas++; console.log('  FALHOU ' + nome + ' — ' + e.message); } }
var HOJE = '2026-10-30';  /* sexta */
var D = {
  abertas: [
    { titulo: 'Luz', data: '2026-10-28', valor: 215.37, dias: -2 },
    { titulo: 'Internet', data: '2026-11-01', valor: 120, dias: 2 },
    { titulo: 'IPTU', data: '2026-11-20', valor: 300, dias: 21 }
  ],
  compromissos: [
    { titulo: 'Dentista', data: '2026-10-31', hora: '09:30', local: 'Clínica' },
    { titulo: 'Reunião escola', data: '2026-11-02', hora: '', local: '' },
    { titulo: 'Passado', data: '2026-10-29', hora: '10:00', local: '' }
  ],
  tarefas: [
    { titulo: 'Trocar filtro', prio: 'alta', feita: false, vence: '2026-11-01' },
    { titulo: 'Arrumar armário', prio: 'baixa', feita: false },
    { titulo: 'Já feita', prio: 'alta', feita: true }
  ]
};

/* classificação + datas */
t('amanhã a partir de 30/10 é 31/10', function () { var q = C.classificar('O que tenho na agenda amanhã?', HOJE); assert.strictEqual(q.tipo, 'agenda'); assert.strictEqual(q.ini, '2026-10-31'); assert.strictEqual(q.fim, '2026-10-31'); });
t('amanhã vira o mês/ano', function () { assert.strictEqual(C.classificar('agenda de amanhã', '2026-12-31').ini, '2027-01-01'); });
t('hoje', function () { var q = C.classificar('compromissos de hoje?', HOJE); assert.strictEqual(q.tipo, 'agenda'); assert.strictEqual(q.ini, HOJE); });
t('vence essa semana = hoje..domingo', function () { var q = C.classificar('O que vence essa semana?', HOJE); assert.strictEqual(q.tipo, 'vencimentos'); assert.strictEqual(q.ini, HOJE); assert.strictEqual(q.fim, '2026-11-01'); });
t('atrasada', function () { assert.strictEqual(C.classificar('Tem conta atrasada?', HOJE).tipo, 'atrasadas'); });
t('prioridade alta', function () { assert.strictEqual(C.classificar('Quais tarefas são prioridade alta?', HOJE).tipo, 'prioridade'); });
t('pergunta livre não classifica', function () { assert.strictEqual(C.classificar('Quanto gastei com mercado?', HOJE), null); });

/* respostas determinísticas */
t('agenda amanhã lista só o dentista', function () { var r = C.responder(C.classificar('O que tenho na agenda amanhã?', HOJE), D); assert.strictEqual(r.itens.length, 1); assert.ok(/Dentista/.test(r.texto) && /09:30/.test(r.texto) && /31\/10/.test(r.texto)); assert.ok(!/Passado|escola/.test(r.texto)); });
t('agenda vazia: mensagem exata sem modelo', function () { var r = C.responder(C.classificar('O que tenho na agenda amanhã?', HOJE), { compromissos: [] }); assert.strictEqual(r.itens.length, 0); assert.strictEqual(r.texto, 'Não encontrei nada na agenda para amanhã (31/10).'); });
t('vencimentos da semana: só Internet', function () { var r = C.responder(C.classificar('O que vence essa semana?', HOJE), D); assert.deepStrictEqual(r.itens.map(function (x) { return x.titulo; }), ['Internet']); assert.ok(/R\$ 120,00/.test(r.texto)); });
t('atrasadas: só Luz', function () { var r = C.responder(C.classificar('Tem conta atrasada?', HOJE), D); assert.deepStrictEqual(r.itens.map(function (x) { return x.titulo; }), ['Luz']); });
t('prioridade alta: pendentes', function () { var r = C.responder(C.classificar('Quais tarefas são prioridade alta?', HOJE), D); assert.deepStrictEqual(r.itens.map(function (x) { return x.titulo; }), ['Trocar filtro']); });

t('dados de EXEMPLO nunca entram (ex.: Reunião de alinhamento do dados.json)', function () {
  var r = C.responder(C.classificar('O que tenho na agenda hoje?', HOJE), { compromissos: [{ titulo: 'Reunião de alinhamento', data: HOJE, hora: '15:00', local: 'Online', exemplo: true }] });
  assert.strictEqual(r.itens.length, 0); assert.strictEqual(r.texto, 'Não encontrei nada na agenda para hoje (30/10).');
});
t('pergunta sem pedido de criação não libera horário citado pelo usuário', function () {
  var p = C.permitidoResposta('- nada marcado', 'Qual a reunião de alinhamento das 15h?', HOJE); assert.strictEqual(C.fiel('A reunião de alinhamento é hoje às 15:00.', p), false);
  var q = C.permitidoResposta('- nada marcado', 'Marque dentista dia 05/11 às 15h', HOJE); assert.strictEqual(C.fiel('Sugiro marcar Dentista em 05/11 às 15:00.', q), true);
});
t('limpa <think> e tags soltas', function () { assert.strictEqual(C.limpar('<think>x</think>Oi</think>'), 'Oi'); });

/* validação pós-resposta */
var LISTA = C.responder(C.classificar('O que tenho na agenda amanhã?', HOJE), D);
t('resposta fiel passa', function () { assert.strictEqual(C.fiel('Amanhã (31/10) você tem Dentista às 09:30 na Clínica.', LISTA.permitido), true); });
t('horário inventado reprova', function () { assert.strictEqual(C.fiel('Amanhã (31/10): reunião de alinhamento online às 15:00.', LISTA.permitido), false); });
t('data errada reprova (30/10 como amanhã)', function () { assert.strictEqual(C.fiel('Amanhã (30/10/2026) você tem Dentista às 09:30.', LISTA.permitido), false); });
t('valor inventado reprova', function () { var v = C.responder(C.classificar('O que vence essa semana?', HOJE), D); assert.strictEqual(C.fiel('Internet R$ 120,00 e Água R$ 80,00', v.permitido), false); assert.strictEqual(C.fiel('Vence a Internet, R$ 120,00, em 01/11.', v.permitido), true); });
t('item a mais (linha extra de lista) reprova', function () { assert.strictEqual(C.fiel('- Dentista 09:30\n- Reunião de alinhamento', LISTA.permitido), false); });
t('contexto livre: data/valor fora do contexto reprova', function () { var p = C.permitidoDeTexto('- Luz: R$ 215,37, vence 2026-10-28', HOJE); assert.strictEqual(C.fiel('A Luz de R$ 215,37 venceu em 28/10.', p), true); assert.strictEqual(C.fiel('Você tem reunião às 15:00.', p), false); });

console.log('\n' + ok + ' ok, ' + falhas + ' falhas'); process.exitCode = falhas ? 1 : 0;
