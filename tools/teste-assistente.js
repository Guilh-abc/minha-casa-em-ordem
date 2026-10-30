/* Testes do Ajudante (consultas puras). node tools/teste-assistente.js  byGui */
var C = require('../js/assistente-consultas.js');
var ok = 0, falhas = 0;
function t(nome, cond) { if (cond) ok++; else { falhas++; console.log('  FALHA ' + nome); } }
var SEX = '2026-10-30', DOM = '2026-11-01', SEG = '2026-11-02';

/* essa semana = de hoje até domingo da semana corrente (segunda a domingo) */
var q = C.classificar('O que vence essa semana?', SEX);
t('semana sexta: fim domingo', q.tipo === 'vencimentos' && q.ini === SEX && q.fim === DOM);
t('semana sexta: rótulo', /30\/10 a 01\/11/.test(q.rotulo));
q = C.classificar('O que vence essa semana?', DOM);
t('semana domingo: só o domingo', q.fim === DOM);
q = C.classificar('O que vence essa semana?', SEG);
t('semana segunda: até 08/11', q.fim === '2026-11-08');
q = C.classificar('o que tenho na agenda essa semana', SEX);
t('agenda semana: até domingo', q.tipo === 'agenda' && q.fim === DOM);

var d = { abertas: [
  { id: 'a', titulo: 'Luz', valor: 120, data: '2026-10-31', dias: 1 },
  { id: 'b', titulo: 'Escola', valor: 900, data: '2026-11-02', dias: 3 },
  { id: 'c', titulo: 'Água', valor: 80, data: '2026-10-28', dias: -2 }],
  compromissos: [{ titulo: 'Aniversário Ana', data: '2026-11-22' }, { titulo: 'Dentista', data: '2026-10-31', hora: '09:00' }],
  tarefas: [{ titulo: 'Trocar filtro', prio: 'alta' }, { titulo: 'Pintar', prio: 'baixa' }, { titulo: 'Feita', prio: 'alta', feita: true }] };
var r = C.responder(C.classificar('O que vence essa semana?', SEX), d);
t('vence semana: só Luz', r.itens.length === 1 && r.itens[0].titulo === 'Luz');
r = C.responder(C.classificar('O que tenho na agenda amanhã?', SEX), d);
t('agenda amanhã: só Dentista, sem 22/11', r.itens.length === 1 && !/22\/11/.test(r.texto));
r = C.responder(C.classificar('Tem conta atrasada?', SEX), d);
t('atrasadas: Água', r.itens.length === 1 && /Água/.test(r.texto));
q = C.classificar('Quais tarefas tenho pendentes?', SEX);
r = q && C.responder(q, d);
t('quais tarefas: 2 pendentes', r && r.itens.length === 2);

/* limpar: tira repetição e reticências */
t('limpar reticências finais', C.limpar('Você tem 2 contas.......') === 'Você tem 2 contas.');
t('limpar …', C.limpar('Ok… … … …') === 'Ok.');
t('limpar linhas repetidas', C.limpar('- Luz\n- Luz\n- Luz\n- Água') === '- Luz\n- Água');
t('limpar frase em laço', C.limpar('Tudo certo. Tudo certo. Tudo certo. Tudo certo.') === 'Tudo certo.');
t('limpar think', C.limpar('<think>x</think>Oi') === 'Oi');
t('limpar mantém texto normal', C.limpar('Vence sex, 31/10: Luz.') === 'Vence sex, 31/10: Luz.');
console.log(ok + ' ok, ' + falhas + ' falhas'); process.exit(falhas ? 1 : 0);
